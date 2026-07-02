export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getActiveProject, stampRow } from '@/lib/project-server'

const db       = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function extractFromFile(file: File): Promise<{ text: string; type: string }> {
  const buf      = Buffer.from(await file.arrayBuffer())
  const mime     = file.type
  const name     = file.name.toLowerCase()

  // PDF — pdf-parse v2 API (class-based; the old lib/pdf-parse.js deep import
  // no longer exists in the installed package)
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require('pdf-parse')
    const parser = new PDFParse({ data: new Uint8Array(buf) })
    const data   = await parser.getText()
    return { text: data.text.slice(0, 15_000), type: 'pdf' }
  }

  // Word doc
  if (mime.includes('wordprocessingml') || name.endsWith('.docx')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth')
    const result  = await mammoth.extractRawText({ buffer: buf })
    return { text: result.value.slice(0, 15_000), type: 'docx' }
  }

  // Image → Claude Vision
  if (mime.startsWith('image/')) {
    const b64 = buf.toString('base64')
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image in detail. Focus on any text, branding, products, or marketing-relevant information visible.' },
          { type: 'image', source: { type: 'base64', media_type: mime as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: b64 } },
        ],
      }],
    })
    return { text: (res.content.find(b => b.type === 'text') as any)?.text ?? '', type: 'image' }
  }

  // Plain text fallback
  return { text: buf.toString('utf-8').slice(0, 15_000), type: 'text' }
}

async function extractFromLink(url: string): Promise<string> {
  const res  = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10_000) })
  const html = await res.text()
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12_000)
}

export async function POST(req: NextRequest) {
  try {
    const fd   = await req.formData()
    const type = fd.get('type') as string | null

    let fileName: string
    let fileType: string
    let text: string

    if (type === 'link') {
      const url = fd.get('url') as string
      text      = await extractFromLink(url)
      fileName  = url
      fileType  = 'link'
    } else {
      const file           = fd.get('file') as File
      const { text: t, type: ft } = await extractFromFile(file)
      text     = t
      fileName = file.name
      fileType = ft
    }

    const pid = await getActiveProject()
    const { data, error } = await db
      .from('brand_files')
      .insert(stampRow({ file_name: fileName, file_type: fileType, extracted_text: text }, pid))
      .select('id, file_name, file_type, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ file: data })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
