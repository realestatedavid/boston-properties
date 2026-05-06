'use client'

import { createContext, useContext } from 'react'
import type { Role } from '@/lib/types'

type RoleCtx = {
  role: Role
  userId: string
  fullName: string
}

const RoleContext = createContext<RoleCtx>({
  role: 'employee',
  userId: '',
  fullName: '',
})

export function RoleProvider({
  children,
  role,
  userId,
  fullName,
}: RoleCtx & { children: React.ReactNode }) {
  return (
    <RoleContext.Provider value={{ role, userId, fullName }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  return useContext(RoleContext)
}
