'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useRole } from '@/components/RoleProvider'
import { createClient } from '@/lib/supabase'

const ADMIN_NAV = [
  { href: '/rental-launch', label: 'Rental Launch' },
  { href: '/messages', label: 'Messages' },
  { href: '/leads', label: 'Leads' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/properties', label: 'Properties' },
  { href: '/transactions', label: 'Ledger' },
  { href: '/follow-ups', label: 'Follow-Ups' },
  { href: '/maintenance', label: 'Maintenance' },
  { href: '/kpis', label: 'KPIs' },
]

const EMPLOYEE_NAV = [
  { href: '/rental-launch', label: 'Rental Launch' },
  { href: '/messages', label: 'Messages' },
  { href: '/leads', label: 'Leads' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/properties', label: 'Properties' },
  { href: '/follow-ups', label: 'Follow-Ups' },
  { href: '/maintenance', label: 'Maintenance' },
]

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const { role, fullName } = useRole()
  const navItems = role === 'admin' ? ADMIN_NAV : EMPLOYEE_NAV

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col h-full w-48 bg-panel border-r border-edge shrink-0">

        <div className="px-5 py-5 border-b border-edge">
          <div className="text-sm font-semibold text-content">Rental Launch OS</div>
        </div>

        <div className="flex-1 py-3 overflow-y-auto">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-5 py-2 text-sm transition-colors rounded-none ${
                isActive(item.href)
                  ? 'text-blue font-medium'
                  : 'text-dim hover:text-content'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-edge">
          <div className="text-sm text-content truncate mb-0.5">{fullName || 'User'}</div>
          <button
            onClick={handleLogout}
            className="text-xs text-dim hover:text-urgent transition-colors mt-2"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-edge flex">
        {navItems.slice(0, 5).map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex items-center justify-center py-3 text-[11px] transition-colors ${
              isActive(item.href) ? 'text-blue font-medium' : 'text-dim'
            }`}
          >
            {item.label.split(' ')[0]}
          </Link>
        ))}
      </nav>
    </>
  )
}
