import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { User, Lock, Mail, Phone, MapPin, Plus, Trash2, CheckCircle, AlertCircle, LogOut, Key, ShieldCheck } from 'lucide-react'
import Header from '../components/Header'
import Footer from '../components/Footer'

const API_BASE = '/api'

export default function Account() {
  const [searchParams] = useSearchParams()
  const actionParam = searchParams.get('action')
  const tokenParam = searchParams.get('token')

  const [mode, setMode] = useState(actionParam === 'reset-password' ? 'reset-password' : 'login') // 'login' | 'register' | 'forgot' | 'reset-password'
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('orders') // 'orders' | 'profile' | 'addresses' | 'security'

  // Orders State
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  // Auth Form State
  const [loginData, setLoginData] = useState({ email: '', password: '' })
  const [registerData, setRegisterData] = useState({ name: '', email: '', password: '', confirmPassword: '', phone: '' })
  const [forgotEmail, setForgotEmail] = useState('')
  const [resetPasswordData, setResetPasswordData] = useState({ newPassword: '', confirmPassword: '' })
  const [changePasswordData, setChangePasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })

  // Profile Edit State
  const [profileData, setProfileData] = useState({ name: '', phone: '' })

  // Addresses State
  const [addresses, setAddresses] = useState([])
  const [showAddressModal, setShowAddressModal] = useState(false)
  const [newAddress, setNewAddress] = useState({
    fullName: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    province: 'Punjab',
    postalCode: '',
    country: 'Pakistan',
    label: 'Home',
    isDefault: false
  })

  // Feedback Messages
  const [statusMsg, setStatusMsg] = useState(null) // { type: 'success' | 'error', text: '' }

  // Check stored auth session on mount
  useEffect(() => {
    const token = localStorage.getItem('zahzan_token')

    if (actionParam === 'verify-email' && tokenParam) {
      verifyEmailToken(tokenParam)
    }

    if (token) {
      fetchUserProfile(token)
    } else {
      setLoading(false)
    }
  }, [actionParam, tokenParam])

  const showFeedback = (type, text) => {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 6000)
  }

  const verifyEmailToken = async (token) => {
    try {
      const res = await fetch(`${API_BASE}/auth/verify-email?token=${token}`)
      const data = await res.json()
      if (data.success) {
        showFeedback('success', 'Your email address has been verified successfully!')
      } else {
        showFeedback('error', data.message || 'Verification failed.')
      }
    } catch (err) {
      showFeedback('error', 'Error verifying email link.')
    }
  }

  const fetchOrders = async (token = localStorage.getItem('zahzan_token')) => {
    if (!token) return
    try {
      setOrdersLoading(true)
      const res = await fetch(`${API_BASE}/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.orders)) {
        setOrders(data.orders)
      }
    } catch (err) {
      console.error('Failed to fetch user orders:', err)
    } finally {
      setOrdersLoading(false)
    }
  }

  const fetchUserProfile = async (token) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        setUser(data.user)
        setProfileData({ name: data.user.name || '', phone: data.user.phone || '' })
        if (data.addresses) setAddresses(data.addresses)
        fetchOrders(token)
      } else {
        // Token expired / invalid
        logout()
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelOrder = async (orderId) => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return
    if (!window.confirm('Are you sure you want to cancel this order?')) return

    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        showFeedback('success', 'Order cancelled successfully.')
        fetchOrders(token)
      } else {
        showFeedback('error', data.message || 'Failed to cancel order.')
      }
    } catch (err) {
      showFeedback('error', 'Error cancelling order.')
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setStatusMsg(null)
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem('zahzan_token', data.token)
        localStorage.setItem('zahzan_refresh_token', data.refreshToken)
        window.dispatchEvent(new Event('storage'))
        setUser(data.user)
        setProfileData({ name: data.user.name || '', phone: data.user.phone || '' })
        showFeedback('success', 'Logged in successfully.')
        fetchUserProfile(data.token)
      } else {
        showFeedback('error', data.message || 'Invalid credentials.')
      }
    } catch (err) {
      showFeedback('error', 'Unable to connect to server. Please try again.')
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setStatusMsg(null)
    if (registerData.password !== registerData.confirmPassword) {
      showFeedback('error', 'Passwords do not match.')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: registerData.name,
          email: registerData.email,
          password: registerData.password,
          phone: registerData.phone
        })
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem('zahzan_token', data.token)
        localStorage.setItem('zahzan_refresh_token', data.refreshToken)
        window.dispatchEvent(new Event('storage'))
        setUser(data.user)
        setProfileData({ name: data.user.name || '', phone: data.user.phone || '' })
        showFeedback('success', data.message || 'Account created successfully.')
      } else {
        showFeedback('error', data.message || 'Registration failed.')
      }
    } catch (err) {
      showFeedback('error', 'Unable to connect to server. Please try again.')
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setStatusMsg(null)
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      })
      const data = await res.json()
      showFeedback('success', data.message || 'If an account exists, a reset link has been sent.')
      setMode('login')
    } catch (err) {
      showFeedback('error', 'Failed to request password reset.')
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setStatusMsg(null)
    if (resetPasswordData.newPassword !== resetPasswordData.confirmPassword) {
      showFeedback('error', 'Passwords do not match.')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenParam,
          newPassword: resetPasswordData.newPassword
        })
      })
      const data = await res.json()
      if (data.success) {
        showFeedback('success', data.message || 'Password reset successfully.')
        setMode('login')
      } else {
        showFeedback('error', data.message || 'Password reset failed.')
      }
    } catch (err) {
      showFeedback('error', 'Server error. Please try again.')
    }
  }

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    setStatusMsg(null)
    const token = localStorage.getItem('zahzan_token')
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(profileData)
      })
      const data = await res.json()
      if (data.success) {
        setUser(data.user)
        showFeedback('success', 'Profile updated successfully.')
      } else {
        showFeedback('error', data.message || 'Failed to update profile.')
      }
    } catch (err) {
      showFeedback('error', 'Server error updating profile.')
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setStatusMsg(null)
    if (changePasswordData.newPassword !== changePasswordData.confirmPassword) {
      showFeedback('error', 'New passwords do not match.')
      return
    }
    const token = localStorage.getItem('zahzan_token')
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword: changePasswordData.currentPassword,
          newPassword: changePasswordData.newPassword
        })
      })
      const data = await res.json()
      if (data.success) {
        showFeedback('success', 'Password updated successfully.')
        setChangePasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
      } else {
        showFeedback('error', data.message || 'Failed to change password.')
      }
    } catch (err) {
      showFeedback('error', 'Server error updating password.')
    }
  }

  const handleAddAddress = async (e) => {
    e.preventDefault()
    setStatusMsg(null)
    const token = localStorage.getItem('zahzan_token')
    try {
      const res = await fetch(`${API_BASE}/users/me/addresses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newAddress)
      })
      const data = await res.json()
      if (data.success) {
        showFeedback('success', 'Address added successfully.')
        setShowAddressModal(false)
        fetchUserProfile(token)
      } else {
        showFeedback('error', data.message || 'Failed to add address.')
      }
    } catch (err) {
      showFeedback('error', 'Server error adding address.')
    }
  }

  const handleDeleteAddress = async (id) => {
    const token = localStorage.getItem('zahzan_token')
    try {
      const res = await fetch(`${API_BASE}/users/me/addresses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        showFeedback('success', 'Address deleted.')
        fetchUserProfile(token)
      }
    } catch (err) {
      showFeedback('error', 'Failed to delete address.')
    }
  }

  const handleSetDefaultAddress = async (id) => {
    const token = localStorage.getItem('zahzan_token')
    try {
      const res = await fetch(`${API_BASE}/users/me/addresses/${id}/default`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        showFeedback('success', 'Default shipping address updated.')
        fetchUserProfile(token)
      }
    } catch (err) {
      showFeedback('error', 'Failed to set default address.')
    }
  }

  const logout = async () => {
    const token = localStorage.getItem('zahzan_token')
    const refreshToken = localStorage.getItem('zahzan_refresh_token')
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      })
    } catch (e) {
      // Ignore network errors on logout
    }
    localStorage.removeItem('zahzan_token')
    localStorage.removeItem('zahzan_refresh_token')
    window.dispatchEvent(new Event('storage'))
    setUser(null)
    showFeedback('success', 'Signed out successfully.')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex flex-col justify-between">
        <Header />
        <div className="flex-1 flex items-center justify-center py-20">
          <span className="text-xs uppercase tracking-[0.3em] font-sans text-[#5a5e4b] animate-pulse">
            LOADING ZAHZAN CLIENT PORTAL...
          </span>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] text-[#1c1b18] flex flex-col justify-between">
      <Header />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-10 sm:px-6 sm:py-16">
        
        {/* FEEDBACK BANNER */}
        {statusMsg && (
          <div className={`mb-8 p-4 border text-xs font-sans tracking-wide flex items-center gap-3 transition-all ${
            statusMsg.type === 'success' 
              ? 'bg-[#f0f4ec] border-[#b4c4a4] text-[#364426]' 
              : 'bg-[#fdf2f2] border-[#f4c7c7] text-[#8a2222]'
          }`}>
            {statusMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {!user ? (
          /* ========================================================================= */
          /* AUTHENTICATION FORM (LOGIN / REGISTER / FORGOT / RESET) */
          /* ========================================================================= */
          <div className="max-w-md mx-auto bg-[#faf8f5] border border-[#e8e4dc] p-6 sm:p-10 shadow-sm">
            
            {mode === 'login' && (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block">
                    ZAHZAN MAISON
                  </span>
                  <h1 className="font-serif text-3xl font-light text-[#1c1b18]">Client Sign In</h1>
                  <p className="text-xs font-sans text-[#706c64]">
                    Sign in to access your orders, wishlist, and exclusive previews.
                  </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      placeholder="client@zahzan.com"
                      className="w-full bg-[#f3efe8] border border-[#e8e4dc] px-3.5 py-2.5 text-xs font-sans focus:outline-none focus:border-[#1c1b18]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b]">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setMode('forgot')}
                        className="text-[10px] font-sans text-[#706c64] hover:text-[#1c1b18] underline cursor-pointer"
                      >
                        Forgot?
                      </button>
                    </div>
                    <input
                      type="password"
                      required
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-[#f3efe8] border border-[#e8e4dc] px-3.5 py-2.5 text-xs font-sans focus:outline-none focus:border-[#1c1b18]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#1c1b18] text-[#faf8f5] text-xs font-sans uppercase tracking-[0.25em] py-3 hover:bg-[#5a5e4b] transition-colors cursor-pointer"
                  >
                    Sign In
                  </button>
                </form>

                <div className="border-t border-[#e8e4dc] pt-6 text-center">
                  <p className="text-xs font-sans text-[#706c64]">
                    Don't have a ZAHZAN account?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('register')}
                      className="text-[#1c1b18] font-medium underline hover:text-[#5a5e4b] cursor-pointer"
                    >
                      Create Account
                    </button>
                  </p>
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block">
                    WELCOME TO ZAHZAN
                  </span>
                  <h1 className="font-serif text-3xl font-light text-[#1c1b18]">Create Account</h1>
                  <p className="text-xs font-sans text-[#706c64]">
                    Register for bespoke client services and order tracking.
                  </p>
                </div>

                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={registerData.name}
                      onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
                      placeholder="Ayesha Khan"
                      className="w-full bg-[#f3efe8] border border-[#e8e4dc] px-3.5 py-2.5 text-xs font-sans focus:outline-none focus:border-[#1c1b18]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={registerData.email}
                      onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                      placeholder="client@domain.com"
                      className="w-full bg-[#f3efe8] border border-[#e8e4dc] px-3.5 py-2.5 text-xs font-sans focus:outline-none focus:border-[#1c1b18]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1.5">
                      Phone (Optional)
                    </label>
                    <input
                      type="tel"
                      value={registerData.phone}
                      onChange={(e) => setRegisterData({ ...registerData, phone: e.target.value })}
                      placeholder="+92 300 1234567"
                      className="w-full bg-[#f3efe8] border border-[#e8e4dc] px-3.5 py-2.5 text-xs font-sans focus:outline-none focus:border-[#1c1b18]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1.5">
                      Password (min 6 chars)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={registerData.password}
                      onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-[#f3efe8] border border-[#e8e4dc] px-3.5 py-2.5 text-xs font-sans focus:outline-none focus:border-[#1c1b18]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1.5">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={registerData.confirmPassword}
                      onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-[#f3efe8] border border-[#e8e4dc] px-3.5 py-2.5 text-xs font-sans focus:outline-none focus:border-[#1c1b18]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#1c1b18] text-[#faf8f5] text-xs font-sans uppercase tracking-[0.25em] py-3 hover:bg-[#5a5e4b] transition-colors cursor-pointer"
                  >
                    Register Account
                  </button>
                </form>

                <div className="border-t border-[#e8e4dc] pt-6 text-center">
                  <p className="text-xs font-sans text-[#706c64]">
                    Already registered?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="text-[#1c1b18] font-medium underline hover:text-[#5a5e4b] cursor-pointer"
                    >
                      Sign In Here
                    </button>
                  </p>
                </div>
              </div>
            )}

            {mode === 'forgot' && (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block">
                    PASSWORD RECOVERY
                  </span>
                  <h1 className="font-serif text-3xl font-light text-[#1c1b18]">Forgot Password</h1>
                  <p className="text-xs font-sans text-[#706c64]">
                    Enter your email address and we will send a password reset link.
                  </p>
                </div>

                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="client@zahzan.com"
                      className="w-full bg-[#f3efe8] border border-[#e8e4dc] px-3.5 py-2.5 text-xs font-sans focus:outline-none focus:border-[#1c1b18]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#1c1b18] text-[#faf8f5] text-xs font-sans uppercase tracking-[0.25em] py-3 hover:bg-[#5a5e4b] transition-colors cursor-pointer"
                  >
                    Send Reset Link
                  </button>
                </form>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-xs font-sans text-[#5a5e4b] hover:text-[#1c1b18] cursor-pointer"
                  >
                    ← Return to Sign In
                  </button>
                </div>
              </div>
            )}

            {mode === 'reset-password' && (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block">
                    SET NEW PASSWORD
                  </span>
                  <h1 className="font-serif text-3xl font-light text-[#1c1b18]">Reset Password</h1>
                </div>

                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1.5">
                      New Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={resetPasswordData.newPassword}
                      onChange={(e) => setResetPasswordData({ ...resetPasswordData, newPassword: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-[#f3efe8] border border-[#e8e4dc] px-3.5 py-2.5 text-xs font-sans focus:outline-none focus:border-[#1c1b18]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1.5">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={resetPasswordData.confirmPassword}
                      onChange={(e) => setResetPasswordData({ ...resetPasswordData, confirmPassword: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-[#f3efe8] border border-[#e8e4dc] px-3.5 py-2.5 text-xs font-sans focus:outline-none focus:border-[#1c1b18]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#1c1b18] text-[#faf8f5] text-xs font-sans uppercase tracking-[0.25em] py-3 hover:bg-[#5a5e4b] transition-colors cursor-pointer"
                  >
                    Update Password
                  </button>
                </form>
              </div>
            )}

          </div>
        ) : (
          /* ========================================================================= */
          /* CLIENT ACCOUNT DASHBOARD (AUTHENTICATED) */
          /* ========================================================================= */
          <div className="space-y-8">
            
            {/* CLIENT HEADER */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-[#e8e4dc] gap-4">
              <div>
                <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block mb-1">
                  CLIENT PORTAL
                </span>
                <h1 className="font-serif text-3xl font-light text-[#1c1b18]">
                  Welcome, {user.name || user.firstName}
                </h1>
                <p className="text-xs font-sans text-[#706c64] mt-0.5">
                  {user.email} • {user.role === 'admin' ? 'Administrator' : 'Client Account'}
                </p>
              </div>

              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-2 text-xs font-sans uppercase tracking-[0.25em] text-[#8a2222] hover:text-[#1c1b18] border border-[#f4c7c7] px-4 py-2 hover:border-[#1c1b18] transition-colors cursor-pointer"
              >
                <LogOut size={14} />
                <span>SIGN OUT</span>
              </button>
            </div>

            {/* TAB NAVIGATION */}
            <div className="flex border-b border-[#e8e4dc] gap-8 text-xs font-sans font-medium uppercase tracking-[0.25em]">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('orders')
                  fetchOrders()
                }}
                className={`pb-3 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'orders' ? 'border-[#1c1b18] text-[#1c1b18]' : 'border-transparent text-[#706c64] hover:text-[#1c1b18]'
                }`}
              >
                Order History ({orders.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className={`pb-3 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'profile' ? 'border-[#1c1b18] text-[#1c1b18]' : 'border-transparent text-[#706c64] hover:text-[#1c1b18]'
                }`}
              >
                Profile Details
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('addresses')}
                className={`pb-3 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'addresses' ? 'border-[#1c1b18] text-[#1c1b18]' : 'border-transparent text-[#706c64] hover:text-[#1c1b18]'
                }`}
              >
                Address Book ({addresses.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('security')}
                className={`pb-3 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'security' ? 'border-[#1c1b18] text-[#1c1b18]' : 'border-transparent text-[#706c64] hover:text-[#1c1b18]'
                }`}
              >
                Security & Password
              </button>
            </div>

            {/* TAB CONTENT: ORDER HISTORY */}
            {activeTab === 'orders' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-[#e8e4dc] pb-3">
                  <div>
                    <h3 className="font-serif text-2xl text-[#1c1b18] font-light">Client Order History</h3>
                    <p className="text-xs font-sans text-[#706c64] mt-0.5">
                      View your order status, items, delivery details, and receipts.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchOrders()}
                    className="text-[10px] font-sans uppercase tracking-[0.2em] text-[#5a5e4b] hover:text-[#1c1b18] border border-[#e8e4dc] px-3 py-1.5 cursor-pointer"
                  >
                    REFRESH
                  </button>
                </div>

                {ordersLoading ? (
                  <div className="py-12 text-center text-xs font-sans uppercase tracking-widest text-[#706c64]">
                    Loading your orders...
                  </div>
                ) : orders.length > 0 ? (
                  <div className="space-y-6">
                    {orders.map((ord) => {
                      const status = ord.orderStatus || 'Pending'
                      const canCancel = status.toLowerCase() === 'pending' || status.toLowerCase() === 'confirmed'

                      return (
                        <div key={ord._id || ord.id} className="bg-[#faf8f5] border border-[#e8e4dc] p-6 rounded-xs space-y-5">
                          {/* Order Header */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e8e4dc] pb-4">
                            <div>
                              <div className="flex items-center gap-3">
                                <h4 className="font-serif text-xl font-normal text-[#1c1b18]">
                                  Order #{ord.orderNumber}
                                </h4>
                                <span className={`px-2.5 py-0.5 text-[9px] font-sans font-semibold uppercase tracking-widest border ${
                                  status.toLowerCase() === 'cancelled'
                                    ? 'bg-[#fdf2f2] border-[#f4c7c7] text-[#8a2222]'
                                    : status.toLowerCase() === 'delivered'
                                    ? 'bg-[#f0f4ec] border-[#b4c4a4] text-[#5a5e4b]'
                                    : 'bg-white border-[#e8e4dc] text-[#1c1b18]'
                                }`}>
                                  {status}
                                </span>
                              </div>
                              <span className="text-[11px] font-sans text-[#706c64] block mt-1">
                                Placed on: {new Date(ord.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                              </span>
                            </div>

                            <div className="text-left sm:text-right">
                              <span className="text-[10px] font-sans uppercase tracking-wider text-[#5a5e4b] block">Total Amount</span>
                              <span className="font-serif text-lg font-normal text-[#1c1b18]">
                                PKR {ord.total.toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Order Items */}
                          <div className="space-y-3">
                            <span className="text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] block">
                              Purchased Items ({ord.items.length})
                            </span>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {ord.items.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-3 bg-white p-3 border border-[#e8e4dc]/80 rounded-xs text-xs font-sans">
                                  <img src={item.image || 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=400&q=80'} alt={item.productName} className="w-12 h-16 object-cover bg-[#eee]" />
                                  <div className="flex-1 space-y-0.5">
                                    <h5 className="font-serif text-sm text-[#1c1b18] leading-snug">{item.productName}</h5>
                                    {item.sku && <span className="text-[9px] font-mono text-[#706c64] block">SKU: {item.sku}</span>}
                                    <span className="text-[11px] text-[#706c64] block">
                                      Size: <span className="text-[#1c1b18] font-medium">{item.size || 'M'}</span> | Qty: <span className="text-[#1c1b18] font-medium">{item.quantity}</span>
                                    </span>
                                  </div>
                                  <span className="font-medium text-[#1c1b18]">
                                    PKR {item.totalPrice.toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Order Details Footer */}
                          <div className="pt-3 border-t border-[#e8e4dc] flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-sans text-[#706c64]">
                            <div>
                              <span className="font-medium text-[#1c1b18] block uppercase tracking-wider text-[10px]">Deliver To:</span>
                              <span>{ord.shippingAddress.fullName} • {ord.shippingAddress.addressLine1}, {ord.shippingAddress.city}</span>
                            </div>

                            {canCancel && (
                              <button
                                type="button"
                                onClick={() => handleCancelOrder(ord._id || ord.id)}
                                className="self-start sm:self-auto text-[10px] font-sans uppercase tracking-[0.2em] text-[#8a2222] hover:text-[#1c1b18] border border-[#f4c7c7] px-3 py-1.5 hover:border-[#1c1b18] transition-colors cursor-pointer"
                              >
                                CANCEL ORDER
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="py-16 text-center space-y-3 bg-[#faf8f5] border border-[#e8e4dc] p-8">
                    <h4 className="font-serif text-2xl text-[#1c1b18] font-light">NO ORDERS PLACED YET</h4>
                    <p className="text-xs font-sans text-[#706c64] max-w-sm mx-auto">
                      Explore the ZAHZAN collection and place your first order.
                    </p>
                    <div className="pt-2">
                      <Link
                        to="/shop"
                        className="inline-block bg-[#1c1b18] text-[#faf8f5] text-xs font-sans uppercase tracking-[0.25em] py-2.5 px-6 hover:bg-[#5a5e4b] transition-colors"
                      >
                        EXPLORE COLLECTION
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: PROFILE */}
            {activeTab === 'profile' && (
              <div className="bg-[#faf8f5] border border-[#e8e4dc] p-6 sm:p-8 space-y-6 max-w-xl">
                <h3 className="font-serif text-xl text-[#1c1b18]">Personal Information</h3>

                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={profileData.name}
                      onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                      className="w-full bg-[#f3efe8] border border-[#e8e4dc] px-3.5 py-2.5 text-xs font-sans focus:outline-none focus:border-[#1c1b18]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1.5">
                      Email Address (Locked)
                    </label>
                    <input
                      type="email"
                      disabled
                      value={user.email}
                      className="w-full bg-[#e8e4dc]/50 border border-[#e8e4dc] px-3.5 py-2.5 text-xs font-sans text-[#706c64] cursor-not-allowed"
                    />
                    <span className="text-[10px] text-[#706c64] mt-1 block">
                      {user.isEmailVerified ? '✓ Verified Email' : '⚠ Unverified Email'}
                    </span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1.5">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                      placeholder="+92 300 1234567"
                      className="w-full bg-[#f3efe8] border border-[#e8e4dc] px-3.5 py-2.5 text-xs font-sans focus:outline-none focus:border-[#1c1b18]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="bg-[#1c1b18] text-[#faf8f5] text-xs font-sans uppercase tracking-[0.25em] px-6 py-2.5 hover:bg-[#5a5e4b] transition-colors cursor-pointer"
                  >
                    Save Changes
                  </button>
                </form>
              </div>
            )}

            {/* TAB CONTENT: ADDRESSES */}
            {activeTab === 'addresses' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="font-serif text-xl text-[#1c1b18]">Shipping Addresses</h3>
                  <button
                    type="button"
                    onClick={() => setShowAddressModal(true)}
                    className="flex items-center gap-2 bg-[#1c1b18] text-[#faf8f5] text-xs font-sans uppercase tracking-[0.25em] px-4 py-2 hover:bg-[#5a5e4b] transition-colors cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Add New Address</span>
                  </button>
                </div>

                {addresses.length === 0 ? (
                  <p className="text-xs font-sans text-[#706c64] italic py-4">
                    No shipping addresses saved yet. Add an address for faster checkout.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {addresses.map((addr) => (
                      <div
                        key={addr._id}
                        className={`border p-5 relative flex flex-col justify-between space-y-3 ${
                          addr.isDefault ? 'border-[#1c1b18] bg-[#f3efe8]/50' : 'border-[#e8e4dc] bg-[#faf8f5]'
                        }`}
                      >
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-sans font-bold uppercase tracking-[0.25em] text-[#5a5e4b]">
                              {addr.label || 'Home'}
                            </span>
                            {addr.isDefault && (
                              <span className="text-[9px] font-sans font-medium uppercase tracking-[0.2em] bg-[#1c1b18] text-[#faf8f5] px-2 py-0.5 rounded-xs">
                                DEFAULT
                              </span>
                            )}
                          </div>
                          <p className="font-serif text-base text-[#1c1b18]">{addr.fullName}</p>
                          <p className="text-xs font-sans text-[#706c64] mt-1">{addr.addressLine1}</p>
                          {addr.addressLine2 && <p className="text-xs font-sans text-[#706c64]">{addr.addressLine2}</p>}
                          <p className="text-xs font-sans text-[#706c64]">
                            {addr.city}, {addr.province} {addr.postalCode}
                          </p>
                          <p className="text-xs font-sans text-[#706c64]">{addr.country}</p>
                          <p className="text-xs font-sans text-[#706c64] mt-1">Phone: {addr.phone}</p>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-[#e8e4dc]/70">
                          {!addr.isDefault && (
                            <button
                              type="button"
                              onClick={() => handleSetDefaultAddress(addr._id)}
                              className="text-[10px] font-sans uppercase tracking-[0.2em] text-[#5a5e4b] hover:text-[#1c1b18] underline cursor-pointer"
                            >
                              Set as Default
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteAddress(addr._id)}
                            className="text-[10px] font-sans uppercase tracking-[0.2em] text-[#8a2222] hover:text-[#1c1b18] flex items-center gap-1 cursor-pointer ml-auto"
                          >
                            <Trash2 size={12} />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ADD ADDRESS MODAL */}
                {showAddressModal && (
                  <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                    <div className="bg-[#faf8f5] border border-[#e8e4dc] p-6 sm:p-8 max-w-lg w-full relative shadow-2xl space-y-4">
                      <div className="flex justify-between items-center border-b border-[#e8e4dc] pb-3">
                        <h3 className="font-serif text-xl text-[#1c1b18]">New Delivery Address</h3>
                        <button
                          type="button"
                          onClick={() => setShowAddressModal(false)}
                          className="text-xs text-[#706c64] hover:text-[#1c1b18]"
                        >
                          ✕
                        </button>
                      </div>

                      <form onSubmit={handleAddAddress} className="space-y-3 text-xs font-sans">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] uppercase tracking-[0.2em] text-[#5a5e4b] mb-1">
                              Full Name
                            </label>
                            <input
                              type="text"
                              required
                              value={newAddress.fullName}
                              onChange={(e) => setNewAddress({ ...newAddress, fullName: e.target.value })}
                              className="w-full bg-[#f3efe8] border border-[#e8e4dc] p-2 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase tracking-[0.2em] text-[#5a5e4b] mb-1">
                              Phone
                            </label>
                            <input
                              type="tel"
                              required
                              value={newAddress.phone}
                              onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                              className="w-full bg-[#f3efe8] border border-[#e8e4dc] p-2 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase tracking-[0.2em] text-[#5a5e4b] mb-1">
                            Address Line 1
                          </label>
                          <input
                            type="text"
                            required
                            value={newAddress.addressLine1}
                            onChange={(e) => setNewAddress({ ...newAddress, addressLine1: e.target.value })}
                            placeholder="House / Street / Area"
                            className="w-full bg-[#f3efe8] border border-[#e8e4dc] p-2 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase tracking-[0.2em] text-[#5a5e4b] mb-1">
                            Address Line 2 (Optional)
                          </label>
                          <input
                            type="text"
                            value={newAddress.addressLine2}
                            onChange={(e) => setNewAddress({ ...newAddress, addressLine2: e.target.value })}
                            placeholder="Apartment, suite, landmark"
                            className="w-full bg-[#f3efe8] border border-[#e8e4dc] p-2 focus:outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[10px] uppercase tracking-[0.2em] text-[#5a5e4b] mb-1">
                              City
                            </label>
                            <input
                              type="text"
                              required
                              value={newAddress.city}
                              onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                              placeholder="Lahore"
                              className="w-full bg-[#f3efe8] border border-[#e8e4dc] p-2 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase tracking-[0.2em] text-[#5a5e4b] mb-1">
                              Province
                            </label>
                            <input
                              type="text"
                              required
                              value={newAddress.province}
                              onChange={(e) => setNewAddress({ ...newAddress, province: e.target.value })}
                              placeholder="Punjab"
                              className="w-full bg-[#f3efe8] border border-[#e8e4dc] p-2 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase tracking-[0.2em] text-[#5a5e4b] mb-1">
                              Postal Code
                            </label>
                            <input
                              type="text"
                              required
                              value={newAddress.postalCode}
                              onChange={(e) => setNewAddress({ ...newAddress, postalCode: e.target.value })}
                              placeholder="54000"
                              className="w-full bg-[#f3efe8] border border-[#e8e4dc] p-2 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                          <input
                            type="checkbox"
                            id="isDefaultCheck"
                            checked={newAddress.isDefault}
                            onChange={(e) => setNewAddress({ ...newAddress, isDefault: e.target.checked })}
                          />
                          <label htmlFor="isDefaultCheck" className="text-xs text-[#706c64] cursor-pointer">
                            Set as default shipping address
                          </label>
                        </div>

                        <div className="pt-3 flex justify-end gap-3 border-t border-[#e8e4dc]">
                          <button
                            type="button"
                            onClick={() => setShowAddressModal(false)}
                            className="px-4 py-2 border border-[#e8e4dc] text-xs uppercase tracking-widest text-[#706c64]"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-5 py-2 bg-[#1c1b18] text-[#faf8f5] text-xs uppercase tracking-widest hover:bg-[#5a5e4b]"
                          >
                            Save Address
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* TAB CONTENT: SECURITY */}
            {activeTab === 'security' && (
              <div className="bg-[#faf8f5] border border-[#e8e4dc] p-6 sm:p-8 space-y-6 max-w-xl">
                <h3 className="font-serif text-xl text-[#1c1b18]">Change Password</h3>

                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1.5">
                      Current Password
                    </label>
                    <input
                      type="password"
                      required
                      value={changePasswordData.currentPassword}
                      onChange={(e) => setChangePasswordData({ ...changePasswordData, currentPassword: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-[#f3efe8] border border-[#e8e4dc] px-3.5 py-2.5 text-xs font-sans focus:outline-none focus:border-[#1c1b18]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1.5">
                      New Password (min 6 chars)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={changePasswordData.newPassword}
                      onChange={(e) => setChangePasswordData({ ...changePasswordData, newPassword: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-[#f3efe8] border border-[#e8e4dc] px-3.5 py-2.5 text-xs font-sans focus:outline-none focus:border-[#1c1b18]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] mb-1.5">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={changePasswordData.confirmPassword}
                      onChange={(e) => setChangePasswordData({ ...changePasswordData, confirmPassword: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-[#f3efe8] border border-[#e8e4dc] px-3.5 py-2.5 text-xs font-sans focus:outline-none focus:border-[#1c1b18]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="bg-[#1c1b18] text-[#faf8f5] text-xs font-sans uppercase tracking-[0.25em] px-6 py-2.5 hover:bg-[#5a5e4b] transition-colors cursor-pointer"
                  >
                    Update Password
                  </button>
                </form>
              </div>
            )}

          </div>
        )}

      </main>

      <Footer />
    </div>
  )
}
