'use client'

import { Suspense, useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Contact, Message } from '@/lib/types'

const CHANNEL_LABEL: Record<string, string> = {
  openphone: 'Phone',
  facebook: 'FB',
  instagram: 'IG',
  furnished_finder: 'FF',
  email: 'Email',
}

const INBOX_MATCH: Record<string, (type: string | undefined) => boolean> = {
  leads:   t => t !== 'tenant' && t !== 'owner',
  tenants: t => t === 'tenant',
  owners:  t => t === 'owner',
}

const INBOX_LABEL: Record<string, string> = {
  leads: 'Leads',
  tenants: 'Tenants',
  owners: 'Owners',
}

interface Conversation {
  contact: Contact
  lastMessage: Message
  unreadCount: number
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function fmtTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function MessagesPage() {
  return <Suspense><MessagesInner /></Suspense>
}

function MessagesInner() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const inbox = searchParams.get('inbox') ?? 'leads'
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [search, setSearch] = useState('')
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [channel, setChannel] = useState<'openphone' | 'facebook'>('openphone')
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async () => {
    const { data: msgs } = await supabase
      .from('messages')
      .select('*, contacts(id, name, phone, type, fb_id, status, last_contact, notes)')
      .order('created_at', { ascending: false })

    if (!msgs) { setLoading(false); return }

    const byContact = new Map<string, { contact: Contact; messages: Message[] }>()
    for (const msg of msgs) {
      if (!msg.contact_id || !msg.contacts) continue
      const cid = msg.contact_id
      if (!byContact.has(cid)) {
        byContact.set(cid, { contact: msg.contacts as unknown as Contact, messages: [] })
      }
      byContact.get(cid)!.messages.push(msg as Message)
    }

    const convos: Conversation[] = []
    for (const { contact, messages: cMsgs } of byContact.values()) {
      convos.push({
        contact,
        lastMessage: cMsgs[0],
        unreadCount: cMsgs.filter(m => !m.is_read && m.direction === 'inbound').length,
      })
    }
    setConversations(convos)
    setLoading(false)
  }, [supabase])

  const loadThread = useCallback(async (contactId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
    if (data) setMessages(data as Message[])
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('contact_id', contactId)
      .eq('direction', 'inbound')
      .eq('is_read', false)
  }, [supabase])

  useEffect(() => { loadConversations() }, [loadConversations])
  useEffect(() => { if (selectedContact) loadThread(selectedContact.id) }, [selectedContact, loadThread])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!reply.trim() || !selectedContact) return
    setSending(true)
    const res = await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId: selectedContact.id, body: reply, channel }),
    })
    if (res.ok) {
      setReply('')
      await loadThread(selectedContact.id)
      await loadConversations()
    }
    setSending(false)
  }

  function selectContact(contact: Contact) {
    setSelectedContact(contact)
    setChannel(contact.fb_id ? 'facebook' : 'openphone')
  }

  const matchInbox = INBOX_MATCH[inbox] ?? INBOX_MATCH.leads
  const filtered = conversations.filter(c => {
    if (!matchInbox(c.contact.type ?? undefined)) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        c.contact.name.toLowerCase().includes(q) ||
        c.contact.phone?.includes(q) ||
        c.lastMessage.body.toLowerCase().includes(q)
      )
    }
    return true
  })

  // Mobile: convo list → thread
  const mobileView = selectedContact ? 'thread' : 'convos'

  return (
    <div className="flex overflow-hidden" style={{ height: 'calc(100dvh - 4rem)' }}>

      {/* Panel 1 — Conversation list */}
      <div className={`flex flex-col border-r border-edge shrink-0 w-full md:w-72
        ${mobileView !== 'convos' ? 'hidden md:flex' : 'flex'}`}>
          <>
            <div className="px-4 py-3 border-b border-edge shrink-0">
              <div className="text-sm font-medium text-content mb-2">
                {INBOX_LABEL[inbox] ?? 'Messages'}
              </div>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full bg-dark border border-edge px-2 py-1.5 text-xs text-content focus:border-blue outline-none"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-xs text-dim animate-pulse">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-xs text-dim">No conversations.</div>
              ) : (
                filtered.map(({ contact, lastMessage, unreadCount }) => (
                  <button
                    key={contact.id}
                    onClick={() => selectContact(contact)}
                    className={`w-full text-left px-4 py-3 border-b border-edge hover:bg-panel/50 transition-colors
                      ${selectedContact?.id === contact.id ? 'bg-panel' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className={`text-xs font-medium truncate ${unreadCount > 0 ? 'text-content' : 'text-dim'}`}>
                        {contact.name}
                      </span>
                      <span className="text-[9px] text-dim shrink-0">{timeAgo(lastMessage.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-dim truncate flex-1">{lastMessage.body}</span>
                      {unreadCount > 0 && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue" />}
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
      </div>

      {/* Panel 2 — Thread */}
      <div className={`flex flex-col flex-1 overflow-hidden
        ${mobileView !== 'thread' ? 'hidden md:flex' : 'flex'}`}>
        {!selectedContact ? (
          <div className="flex-1 flex items-center justify-center text-xs text-dim">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-edge shrink-0 flex items-center gap-3">
              <button
                onClick={() => setSelectedContact(null)}
                className="md:hidden text-dim hover:text-content text-sm leading-none"
              >
                ←
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-content">{selectedContact.name}</div>
                {selectedContact.phone && (
                  <div className="text-[11px] text-dim">{selectedContact.phone}</div>
                )}
              </div>
              {selectedContact.phone && selectedContact.fb_id && (
                <select
                  value={channel}
                  onChange={e => setChannel(e.target.value as 'openphone' | 'facebook')}
                  className="text-[10px] bg-dark border border-edge px-2 py-1 text-dim focus:border-blue outline-none"
                >
                  <option value="openphone">Phone</option>
                  <option value="facebook">Facebook</option>
                </select>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.length === 0 ? (
                <div className="text-xs text-dim text-center py-8">No messages yet</div>
              ) : (
                messages.map(msg => {
                  const isOut = msg.direction === 'outbound'
                  const mediaUrls: string[] = (msg.payload as { media?: string[] } | null)?.media ?? []
                  return (
                    <div key={msg.id} className={`flex items-end gap-2 ${isOut ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[72%] text-[13px] leading-relaxed overflow-hidden ${
                        isOut
                          ? 'bg-blue text-white rounded-[20px] rounded-br-[4px]'
                          : 'bg-panel border border-edge text-content rounded-[20px] rounded-bl-[4px]'
                      }`}>
                        {mediaUrls.map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt="attachment"
                            className="w-full max-w-xs block rounded-[16px]"
                          />
                        ))}
                        {msg.body ? (
                          <div className={`px-4 py-2.5 ${mediaUrls.length > 0 ? 'pt-1' : ''}`}>
                            <div>{msg.body}</div>
                            <div className={`text-[10px] mt-1 flex items-center gap-1 ${isOut ? 'text-white/60 justify-end' : 'text-dim'}`}>
                              <span>{fmtTime(msg.created_at)}</span>
                              {msg.channel && <span className="opacity-50">{CHANNEL_LABEL[msg.channel]}</span>}
                            </div>
                          </div>
                        ) : mediaUrls.length > 0 ? (
                          <div className={`px-3 pb-1 text-[10px] ${isOut ? 'text-white/60 text-right' : 'text-dim'}`}>
                            {fmtTime(msg.created_at)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSend} className="border-t border-edge p-3 flex gap-2 shrink-0">
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) } }}
                placeholder="Reply..."
                rows={2}
                className="flex-1 bg-dark border border-edge px-3 py-2 text-xs text-content focus:border-blue outline-none resize-none"
              />
              <button
                type="submit"
                disabled={sending || !reply.trim()}
                className="bg-blue text-white px-4 py-2 text-xs uppercase tracking-widest hover:bg-blue/90 disabled:opacity-40 self-end"
              >
                {sending ? '...' : 'Send'}
              </button>
            </form>
          </>
        )}
      </div>

      {/* Panel 4 — Contact context (desktop only) */}
      {selectedContact && (
        <div className="hidden lg:flex flex-col w-56 shrink-0 border-l border-edge overflow-y-auto">
          <div className="p-4 border-b border-edge">
            <div className="text-[10px] text-dim uppercase tracking-widest mb-3">Contact</div>
            <div className="text-sm font-medium text-content mb-0.5">{selectedContact.name}</div>
            {selectedContact.phone && <div className="text-[11px] text-dim">{selectedContact.phone}</div>}
            <div className={`text-[10px] uppercase tracking-widest mt-2 ${
              selectedContact.status === 'active' ? 'text-good' : 'text-dim'
            }`}>{selectedContact.status}</div>
          </div>

          {selectedContact.notes && (
            <div className="p-4 border-b border-edge">
              <div className="text-[10px] text-dim uppercase tracking-widest mb-1.5">Notes</div>
              <div className="text-[11px] text-content">{selectedContact.notes}</div>
            </div>
          )}

          {selectedContact.last_contact && (
            <div className="p-4 border-b border-edge">
              <div className="text-[10px] text-dim uppercase tracking-widest mb-1">Last Contact</div>
              <div className="text-[11px] text-content">
                {new Date(selectedContact.last_contact).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
              </div>
            </div>
          )}

          <div className="p-4">
            <button
              onClick={async () => {
                const task = prompt('Follow-up task:')
                if (!task) return
                await supabase.from('follow_ups').insert({
                  task,
                  contact_id: selectedContact.id,
                  priority: 'normal',
                  due_date: new Date().toISOString().split('T')[0],
                })
              }}
              className="w-full text-xs text-dim border border-edge px-3 py-2 hover:text-content hover:border-blue transition-colors uppercase tracking-widest"
            >
              + Follow-Up
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
