'use client'

import { Suspense, useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Contact, Message } from '@/lib/types'

const CHANNEL_LABEL: Record<string, string> = {
  openphone: 'Phone',
  facebook: 'FB',
  instagram: 'IG',
  furnished_finder: 'FF',
  email: 'Email',
}

const INBOXES = ['leads', 'tenants', 'owners'] as const
type Inbox = typeof INBOXES[number]

const INBOX_LABEL: Record<Inbox, string> = {
  leads: 'Leads',
  tenants: 'Tenants',
  owners: 'Owners',
}

const INBOX_MATCH: Record<Inbox, (t: string | null | undefined) => boolean> = {
  leads:   t => t !== 'tenant' && t !== 'owner',
  tenants: t => t === 'tenant',
  owners:  t => t === 'owner',
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const inbox = (searchParams.get('inbox') as Inbox) ?? 'leads'

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
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

  function unreadCount(tab: Inbox) {
    return conversations
      .filter(c => INBOX_MATCH[tab](c.contact.type))
      .reduce((s, c) => s + c.unreadCount, 0)
  }

  const filtered = conversations.filter(c => INBOX_MATCH[inbox](c.contact.type))

  const showThread = !!selectedContact

  return (
    <div className="flex overflow-hidden" style={{ height: 'calc(100dvh - 4rem)' }}>

      {/* Left: inbox list */}
      <div className={`flex flex-col w-full md:w-80 shrink-0 border-r border-edge ${showThread ? 'hidden md:flex' : 'flex'}`}>

        {/* Top tabs */}
        <div className="flex border-b border-edge shrink-0">
          {INBOXES.map(tab => {
            const unread = unreadCount(tab)
            const active = inbox === tab
            return (
              <button
                key={tab}
                onClick={() => {
                  setSelectedContact(null)
                  router.push(`/messages?inbox=${tab}`)
                }}
                className={`flex-1 py-3 text-xs font-medium transition-colors relative ${
                  active ? 'text-content' : 'text-dim hover:text-content'
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  {INBOX_LABEL[tab]}
                  {unread > 0 && (
                    <span className="bg-blue text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                      {unread}
                    </span>
                  )}
                </span>
                {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue" />}
              </button>
            )
          })}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-xs text-dim animate-pulse">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-xs text-dim text-center">No conversations yet.</div>
          ) : (
            filtered.map(({ contact, lastMessage, unreadCount: uc }) => (
              <button
                key={contact.id}
                onClick={() => selectContact(contact)}
                className={`w-full text-left flex items-center gap-3 px-4 py-3.5 border-b border-edge hover:bg-panel/60 transition-colors ${
                  selectedContact?.id === contact.id ? 'bg-panel' : ''
                }`}
              >
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-medium ${
                  uc > 0 ? 'bg-blue text-white' : 'bg-edge text-dim'
                }`}>
                  {contact.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className={`text-sm truncate ${uc > 0 ? 'font-semibold text-content' : 'text-content'}`}>
                      {contact.name}
                    </span>
                    <span className="text-[10px] text-dim shrink-0">{timeAgo(lastMessage.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs truncate flex-1 ${uc > 0 ? 'text-content' : 'text-dim'}`}>
                      {lastMessage.body || 'Image'}
                    </span>
                    {uc > 0 && (
                      <span className="bg-blue text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                        {uc}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: thread */}
      <div className={`flex flex-col flex-1 overflow-hidden ${showThread ? 'flex' : 'hidden md:flex'}`}>
        {!selectedContact ? (
          <div className="flex-1 flex items-center justify-center text-xs text-dim">
            Select a conversation
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-4 py-3 border-b border-edge shrink-0 flex items-center gap-3">
              <button
                onClick={() => setSelectedContact(null)}
                className="md:hidden text-dim hover:text-content text-lg leading-none"
              >
                ←
              </button>
              <div className="w-9 h-9 rounded-full bg-edge flex items-center justify-center text-sm font-medium text-content shrink-0">
                {selectedContact.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-content">{selectedContact.name}</div>
                {selectedContact.phone && <div className="text-[11px] text-dim">{selectedContact.phone}</div>}
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

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5">
              {messages.length === 0 ? (
                <div className="text-xs text-dim text-center py-8">No messages yet</div>
              ) : (
                messages.map(msg => {
                  const isOut = msg.direction === 'outbound'
                  const mediaUrls: string[] = (msg.payload as { media?: string[] } | null)?.media ?? []
                  return (
                    <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] text-[14px] leading-relaxed overflow-hidden ${
                        isOut
                          ? 'bg-blue text-white rounded-[20px] rounded-br-[4px]'
                          : 'bg-panel border border-edge text-content rounded-[20px] rounded-bl-[4px]'
                      }`}>
                        {mediaUrls.map((url, i) => (
                          <img key={i} src={url} alt="attachment" className="w-full block rounded-[16px]" />
                        ))}
                        {msg.body ? (
                          <div className={`px-4 py-2.5 ${mediaUrls.length > 0 ? 'pt-1' : ''}`}>
                            {msg.body}
                            <div className={`text-[10px] mt-0.5 ${isOut ? 'text-white/60 text-right' : 'text-dim'}`}>
                              {fmtTime(msg.created_at)}
                              {msg.channel && <span className="ml-1 opacity-60">{CHANNEL_LABEL[msg.channel]}</span>}
                            </div>
                          </div>
                        ) : mediaUrls.length > 0 ? (
                          <div className={`px-3 pb-1.5 text-[10px] ${isOut ? 'text-white/60 text-right' : 'text-dim'}`}>
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

            {/* Reply box */}
            <form onSubmit={handleSend} className="border-t border-edge px-3 py-3 flex items-end gap-2 shrink-0">
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) } }}
                placeholder="Message..."
                rows={1}
                className="flex-1 bg-panel border border-edge rounded-full px-4 py-2.5 text-sm text-content focus:border-blue outline-none resize-none"
                style={{ maxHeight: '120px' }}
              />
              <button
                type="submit"
                disabled={sending || !reply.trim()}
                className="w-9 h-9 rounded-full bg-blue text-white flex items-center justify-center disabled:opacity-40 shrink-0 hover:bg-blue/90 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
                </svg>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
