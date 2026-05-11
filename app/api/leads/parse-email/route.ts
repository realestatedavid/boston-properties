import { NextResponse } from 'next/server'

export interface ParsedLead {
  name: string | null
  email: string | null
  phone: string | null
  source: 'furnished_finder' | 'facebook' | 'direct' | null
  budget: number | null
  move_in_date: string | null
  move_out_date: string | null
  notes: string | null
}

function extractEmail(text: string): string | null {
  const m = text.match(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/)
  // Ignore notification/system emails
  if (m && !/(facebookmail|furnishedfinder|notification|noreply|no-reply)/.test(m[0])) return m[0]
  return null
}

function extractPhone(text: string): string | null {
  const m = text.match(/(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/)
  return m ? m[1].replace(/[^\d]/g, '').replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3') : null
}

function extractDate(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    const pattern = new RegExp(kw + '[:\\s]+([A-Za-z]+\\s+\\d{1,2},?\\s*\\d{4}|\\d{1,2}[/\\-]\\d{1,2}[/\\-]\\d{2,4})', 'i')
    const m = text.match(pattern)
    if (m) {
      const raw = m[1].trim()
      const d = new Date(raw)
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    }
  }
  return null
}

function extractBudget(text: string): number | null {
  // "$2,500/mo", "$2500/month", "budget: $2500", "2500 per month"
  const patterns = [
    /\$\s*([\d,]+)\s*(?:\/\s*mo(?:nth)?|per\s+month)/i,
    /budget[:\s]+\$?\s*([\d,]+)/i,
    /monthly[:\s]+\$?\s*([\d,]+)/i,
    /rent[:\s]+\$?\s*([\d,]+)/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return parseInt(m[1].replace(/,/g, ''), 10)
  }
  return null
}

function extractName(text: string, source: string | null): string | null {
  // Try labeled fields first
  const labelPatterns = [
    /^Name[:\s]+(.+)$/im,
    /^Guest[:\s]+(.+)$/im,
    /^From[:\s]+(.+)$/im,
    /^Renter[:\s]+(.+)$/im,
  ]
  for (const p of labelPatterns) {
    const m = text.match(p)
    if (m) {
      const name = m[1].trim().split(/\s{2,}/)[0].replace(/<.*>/, '').trim()
      if (name.length > 1 && name.length < 60 && !name.includes('@')) return name
    }
  }

  // FF: "You have a new inquiry from [Name]"
  const ffInquiry = text.match(/new inquiry from\s+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/i)
  if (ffInquiry) return ffInquiry[1].trim()

  // FF: "[Name] wants to book"
  const ffBook = text.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)+)\s+wants to book/im)
  if (ffBook) return ffBook[1].trim()

  // Facebook: "[Name] sent you a message"
  const fbMsg = text.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)+)\s+sent you a message/im)
  if (fbMsg) return fbMsg[1].trim()

  // Facebook: "New message from [Name]"
  const fbNew = text.match(/new message from\s+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/i)
  if (fbNew) return fbNew[1].trim()

  // Subject line: "Re: [Name] - Furnished Finder"
  const subjLine = text.match(/Subject:.*?([A-Z][a-z]+(?: [A-Z][a-z]+)+)\s*[-–|]/i)
  if (subjLine) return subjLine[1].trim()

  return null
}

function extractMessage(text: string): string | null {
  // Try labeled message section
  const msgPatterns = [
    /^Message[:\s]*\n+([\s\S]+?)(?:\n{3,}|$)/im,
    /^(?:Their\s+)?Message[:\s]+"([\s\S]+?)"/im,
    /"([\s\S]{20,500})"/,   // quoted message
    /(?:wrote|says|said)[:\s]+"?([\s\S]{20,500})"?/i,
  ]
  for (const p of msgPatterns) {
    const m = text.match(p)
    if (m) return m[1].trim().slice(0, 500)
  }
  return null
}

function detectSource(text: string, subject: string): 'furnished_finder' | 'facebook' | 'direct' | null {
  const combined = `${text} ${subject}`.toLowerCase()
  if (combined.includes('furnishedfinder') || combined.includes('furnished finder')) return 'furnished_finder'
  if (combined.includes('facebook') || combined.includes('facebookmail') || combined.includes('fb.com') || combined.includes('marketplace')) return 'facebook'
  return 'direct'
}

export async function POST(request: Request) {
  const { emailText } = await request.json()
  if (!emailText || typeof emailText !== 'string') {
    return NextResponse.json({ error: 'emailText required' }, { status: 400 })
  }

  // Extract subject line if present
  const subjectMatch = emailText.match(/^Subject:\s*(.+)$/im)
  const subject = subjectMatch ? subjectMatch[1] : ''

  const source = detectSource(emailText, subject)
  const name = extractName(emailText, source)
  const email = extractEmail(emailText)
  const phone = extractPhone(emailText)
  const budget = extractBudget(emailText)
  const move_in_date = extractDate(emailText, ['move.?in(?: date)?', 'arrival', 'start date', 'available from', 'from'])
  const move_out_date = extractDate(emailText, ['move.?out(?: date)?', 'departure', 'end date', 'until', 'through', 'to'])
  const rawMessage = extractMessage(emailText)

  const notes = rawMessage
    ? `[Via ${source?.replace('_', ' ') ?? 'email'}] ${rawMessage}`
    : `[Via ${source?.replace('_', ' ') ?? 'email'}] ${emailText.slice(0, 300).trim()}`

  const result: ParsedLead = { name, email, phone, source, budget, move_in_date, move_out_date, notes }
  return NextResponse.json(result)
}
