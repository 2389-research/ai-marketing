'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CH_COLOR } from '@/lib/channels'
import ChannelIcon from '@/components/ChannelIcon'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ActionDraft {
  id: string
  topic: string
  channel: string
  scheduled_for: string
}

type ChatItem =
  | { kind: 'message'; role: 'user' | 'assistant'; content: string }
  | { kind: 'action'; draft: ActionDraft }

const SUGGESTIONS = [
  'What should my Instagram bio say?',
  'Write me a punchier LinkedIn headline',
  'I have an event today — make a post about it',
  'Give me 3 caption ideas for our next post',
]

function fmtScheduled(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function ActionCard({ draft }: { draft: ActionDraft }) {
  const color = CH_COLOR[draft.channel]
  return (
    <div className="max-w-[80%] bg-white border border-[#E4E9F2] rounded-2xl shadow-[0_1px_2px_rgba(26,33,48,0.04),0_8px_24px_-14px_rgba(26,33,48,0.08)] px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ backgroundColor: color?.bg ?? '#EEF1F4', color: color?.text ?? '#64748B' }}
        >
          <ChannelIcon channel={draft.channel} className="w-3 h-3" />
          {draft.channel}
        </span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#EEF1F4] text-[#64748B]">
          Pending review
        </span>
      </div>
      <p className="text-sm font-semibold text-[#1A2130] mb-1">{draft.topic}</p>
      <p className="font-mono text-xs text-[#94A3B8] mb-2">Scheduled for {fmtScheduled(draft.scheduled_for)}</p>
      <Link href="/drafts?filter=pending" className="font-mono text-xs text-[#3B5BFF] hover:text-[#2F44D9] transition-colors">
        Review on Drafts page →
      </Link>
    </div>
  )
}

// Persisted only for the browser tab's lifetime — survives navigating to
// another page and back (the normal "schedule a post, go check Drafts, come
// back" flow), but clears on its own when the tab closes. Not a DB table:
// no cross-device history, no unbounded growth to manage.
const STORAGE_KEY = 'assistant-chat-v1'

function loadPersisted(): { items: ChatItem[]; conversation: ChatMessage[] } {
  if (typeof window === 'undefined') return { items: [], conversation: [] }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { items: [], conversation: [] }
    const parsed = JSON.parse(raw)
    return { items: parsed.items ?? [], conversation: parsed.conversation ?? [] }
  } catch {
    return { items: [], conversation: [] }
  }
}

export default function AssistantPage() {
  const [items, setItems]             = useState<ChatItem[]>([])
  const [conversation, setConversation] = useState<ChatMessage[]>([])
  const [input, setInput]             = useState('')
  const [sending, setSending]         = useState(false)
  const [error, setError]             = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load once on mount (client-only — sessionStorage isn't available during SSR)
  useEffect(() => {
    const persisted = loadPersisted()
    setItems(persisted.items)
    setConversation(persisted.conversation)
  }, [])

  // Save on every change so a navigation away mid-conversation isn't lost
  useEffect(() => {
    if (items.length === 0 && conversation.length === 0) return
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ items, conversation }))
  }, [items, conversation])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items])

  const appendToLastMessage = (text: string) => {
    setItems(prev => {
      const updated = [...prev]
      const last = updated[updated.length - 1]
      if (last?.kind === 'message') updated[updated.length - 1] = { ...last, content: last.content + text }
      return updated
    })
    setConversation(prev => {
      const updated = [...prev]
      const last = updated[updated.length - 1]
      if (last) updated[updated.length - 1] = { ...last, content: last.content + text }
      return updated
    })
  }

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    setError('')
    setInput('')
    const nextConversation: ChatMessage[] = [...conversation, { role: 'user', content: trimmed }]
    setConversation([...nextConversation, { role: 'assistant', content: '' }])
    setItems(prev => [
      ...prev,
      { kind: 'message', role: 'user', content: trimmed },
      { kind: 'message', role: 'assistant', content: '' },
    ])
    setSending(true)

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextConversation }),
      })

      if (!res.body) throw new Error('No response stream')
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'token') {
              appendToLastMessage(data.text)
            } else if (data.type === 'action') {
              setItems(prev => [
                ...prev,
                { kind: 'action', draft: data.draft },
                { kind: 'message', role: 'assistant', content: '' },
              ])
            } else if (data.type === 'error') {
              setError(data.message ?? 'Assistant request failed')
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch {
      setError('Something went wrong — try again')
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    send(input)
  }

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-[800px] w-full flex flex-col h-screen">
      <div className="mb-4 lg:mb-5 pb-4 border-b border-[#E4E9F2] shrink-0 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-[28px] font-bold text-[#1A2130] tracking-tight">Assistant</h1>
          <p className="font-mono text-[11px] text-[#94A3B8] mt-1.5">
            Ask about bios and captions, or ask it to schedule a post — grounded in this brand's own strategy
          </p>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => {
              setItems([])
              setConversation([])
              sessionStorage.removeItem(STORAGE_KEY)
            }}
            className="font-mono text-xs text-[#94A3B8] hover:text-[#1A2130] transition-colors shrink-0 mt-1"
          >
            New chat
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-sm text-[#64748B]">Try asking:</p>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm px-4 py-2.5 bg-white border border-[#E4E9F2] rounded-2xl shadow-[0_1px_2px_rgba(26,33,48,0.04),0_8px_24px_-14px_rgba(26,33,48,0.08)] hover:border-[#3B5BFF] transition-colors text-[#1A2130]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-4">
            {items.map((item, i) => {
              if (item.kind === 'action') {
                return <div key={i} className="flex justify-start"><ActionCard draft={item.draft} /></div>
              }
              const isEmptyTrailing = !item.content && item.role === 'assistant' && i === items.length - 1
              if (isEmptyTrailing && !sending) return null
              return (
                <div key={i} className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                      item.role === 'user'
                        ? 'bg-[#3B5BFF] text-white'
                        : 'bg-white border border-[#E4E9F2] text-[#1A2130] shadow-[0_1px_2px_rgba(26,33,48,0.04),0_8px_24px_-14px_rgba(26,33,48,0.08)]'
                    }`}
                  >
                    {item.content || (isEmptyTrailing ? '…' : '')}
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-[#D6336C] mb-2 shrink-0">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-3 border-t border-[#E4E9F2] shrink-0">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask a question or ask it to schedule a post…"
          disabled={sending}
          className="flex-1 text-sm border border-[#E4E9F2] px-3.5 py-2.5 rounded-2xl focus:outline-none focus:border-[#3B5BFF] bg-white disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="px-4 py-2.5 bg-[#3B5BFF] text-white text-sm font-semibold rounded-2xl hover:bg-[#2F44D9] disabled:opacity-40 transition-colors"
        >
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
