'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useRole } from '@/components/RoleProvider'
import { createClient } from '@/lib/supabase'

const ADMIN_NAV = [
  { href: '/', label: 'Overview', icon: '⬛' },
  { href: '/messages', label: 'Messages', icon: '✉' },
  { href: '/properties', label: 'Properties', icon: '🏠' },
  { href: '/contacts', label: 'Contacts', icon: '👥' },
  { href: '/transactions', label: 'Transactions', icon: '💰' },
  { href: '/follow-ups', label: 'Follow-Ups', icon: '✓' },
  { href: '/maintenance', label: 'Maintenance', icon: '🔧' },
  { href: '/kpis', label: 'KPIs', icon: '📊' },
]

const EMPLOYEE_NAV = [
  { href: '/messages', label: 'Messages', icon: '✉' },
  { href: '/properties', label: 'Properties', icon: '🏠' },
  { href: '/contacts', label: 'Contacts', icon: '👥' },
  { href: '/follow-ups', label: 'Follow-Ups', icon: '✓' },
  { href: '/maintenance', label: 'Maintenance', icon: '🔧' },
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
      <nav className="hidden md:flex flex-col h-full w-56 bg-panel border-r border-edge">
        <div className="p-4 border-b border-edge">
          <div className="text-xs text-dim uppercase tracking-widest mb-0.5">Command Center</div>
          <div className="text-sm font-medium text-content">Boston Properties</div>
        </div>

        <div className="flex-1 py-2 overflow-y-auto">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-4 py-2 text-xs transition-colors ${
                isActive(item.href)
                  ? 'text-content bg-edge'
                  : 'text-dim hover:text-content hover:bg-edge/50'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="uppercase tracking-widest">{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="p-4 border-t border-edge">
          <div className="text-xs text-dim truncate mb-2">{fullName || 'User'}</div>
          <div className="text-[10px] text-fade uppercase tracking-widest mb-3">{role}</div>
          <button
            onClick={handleLogout}
            className="text-xs text-dim hover:text-urgent transition-colors uppercase tracking-widest"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-panel border-t border-edge flex">
        {navItems.slice(0, 5).map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
              isActive(item.href) ? 'text-content' : 'text-fade'
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="text-[9px] uppercase tracking-wide">{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  )
}
