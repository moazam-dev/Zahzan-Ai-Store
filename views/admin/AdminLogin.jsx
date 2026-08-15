'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react'

const API_BASE = '/api'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const router = useRouter()

  useEffect(() => {
    // If token exists and is valid admin token, redirect to dashboard
    const token = localStorage.getItem('zahzan_token')
    if (token) {
      fetch(`${API_BASE}/admin/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.user && data.user.role === 'admin') {
            router.push('/admin/dashboard', { scroll: false })
          }
        })
        .catch(() => {})
    }
  }, [router])

  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!email || !password) {
      setErrorMsg('Please enter email and password.')
      return
    }

    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await res.json()

      if (res.ok && data.success && data.token) {
        localStorage.setItem('zahzan_token', data.token)
        router.push('/admin/dashboard', { scroll: false })
      } else {
        setErrorMsg(data.message || 'Administrator authentication failed.')
      }
    } catch (err) {
      console.error('Admin login error:', err)
      setErrorMsg('Network connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0c0e] text-[#e1e3e8] flex flex-col items-center justify-center p-4 font-sans">
      
      <div className="max-w-md w-full bg-[#16181d] border border-[#262931] p-8 sm:p-10 rounded-sm shadow-2xl space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-[#222630] border border-[#343845] rounded-full flex items-center justify-center mx-auto text-[#8c9472]">
            <ShieldCheck size={24} />
          </div>
          <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-[#8a8e98] block">
            ZAHZAN BESPOKE
          </span>
          <h1 className="font-serif text-2xl font-light text-white">
            Administrator Access
          </h1>
          <p className="text-xs text-[#8a8e98] leading-relaxed max-w-xs mx-auto">
            Authorized management credentials required to access system statistics and orders.
          </p>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div className="p-3.5 bg-[#2d1515] border border-[#5c2424] text-red-300 text-xs flex items-start gap-2 rounded-xs">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.25em] text-[#8a8e98] mb-1">
              Admin Email
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0f1012] border border-[#262931] p-3 pl-10 text-xs text-white placeholder-[#505462] focus:outline-none focus:border-[#8c9472]"
                placeholder="admin@zahzan.com"
              />
              <Mail size={16} className="absolute left-3 top-3.5 text-[#505462]" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.25em] text-[#8a8e98] mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0f1012] border border-[#262931] p-3 pl-10 text-xs text-white placeholder-[#505462] focus:outline-none focus:border-[#8c9472]"
                placeholder="••••••••••••"
              />
              <Lock size={16} className="absolute left-3 top-3.5 text-[#505462]" />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#222630] border border-[#3c4254] text-white text-xs font-mono font-medium uppercase tracking-[0.25em] py-3.5 hover:bg-[#8c9472] hover:border-[#8c9472] transition-all cursor-pointer flex items-center justify-center gap-2 group disabled:opacity-50"
            >
              <span>{loading ? 'AUTHENTICATING...' : 'AUTHENTICATE ACCESS'}</span>
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </form>

        <div className="pt-4 border-t border-[#262931] text-center">
          <span className="text-[10px] text-[#505462] font-mono uppercase tracking-wider block">
            Role-Based Access Control Enforced • {new Date().getFullYear()} ZAHZAN
          </span>
        </div>

      </div>

    </div>
  )
}
