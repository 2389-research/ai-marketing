export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

const ROOT = path.resolve(process.cwd(), '..')
const PYTHON = process.env.BACKEND_PYTHON ?? 'python3'

export async function POST() {
  return new Promise<NextResponse>(resolve => {
    const proc = spawn(
      PYTHON,
      ['-c', `
import sys, os
sys.path.insert(0, '${ROOT}')
os.chdir('${ROOT}')
from dotenv import load_dotenv
load_dotenv()
from agents.website_agent import run_website_research
results = run_website_research(save_to_db=True, force=True)
print(f"scraped:{len(results)}")
`],
      { cwd: ROOT }
    )

    let output = ''
    proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { output += d.toString() })

    proc.on('close', (code: number) => {
      const match = output.match(/scraped:(\d+)/)
      const count = match ? parseInt(match[1]) : 0
      if (code === 0) {
        resolve(NextResponse.json({ ok: true, count }))
      } else {
        resolve(NextResponse.json({ error: output.slice(-500) }, { status: 500 }))
      }
    })
  })
}
