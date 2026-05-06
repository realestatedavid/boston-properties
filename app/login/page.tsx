'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="text-xs text-dim tracking-widest uppercase mb-1">Command Center</div>
          <h1 className="text-2xl font-medium text-content tracking-tight">Boston Properties</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-dim uppercase tracking-widest mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-panel border border-edge px-3 py-2 text-sm text-content focus:border-blue outline-none"
              placeholder="david@example.com"
            />
          </div>
          <div>
            <label className="block text-xs text-dim uppercase tracking-widest mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-panel border border-edge px-3 py-2 text-sm text-content focus:border-blue outline-none"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div className="text-xs text-urgent border border-urgent/30 bg-urgent/10 px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue text-white px-3 py-2 text-sm font-medium hover:bg-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
