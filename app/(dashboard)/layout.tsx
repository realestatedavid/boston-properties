import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { RoleProvider } from '@/components/RoleProvider'
import Nav from '@/components/Nav'
import type { Role } from '@/lib/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const role = (profile?.role as Role) || 'employee'
  const fullName = profile?.full_name || user.email || ''

  return (
    <RoleProvider role={role} userId={user.id} fullName={fullName}>
      <div className="flex h-full bg-dark">
        <Nav />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {children}
        </main>
      </div>
    </RoleProvider>
  )
}
