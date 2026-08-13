import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation, Outlet } from 'react-router-dom'
import { 
  LayoutDashboard, 
  ShoppingBag, 
  Users, 
  Package, 
  Mail, 
  ShieldCheck, 
  LogOut, 
  ChevronRight,
  Menu,
  X,
  FileText
} from 'lucide-react'

const API_BASE = '/api'

export default function AdminLayout({ children }) {
  const [adminUser, setAdminUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const getAuthToken = () => localStorage.getItem('zahzan_token')

  useEffect(() => {
    const token = getAuthToken()
    if (!token) {
      navigate('/admin/login')
      return
    }

    // Verify Admin Auth with Backend
    fetch(`${API_BASE}/admin/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.user && data.user.role === 'admin') {
          setAdminUser(data.user)
        } else {
          localStorage.removeItem('zahzan_token')
          navigate('/admin/login')
        }
      })
      .catch((err) => {
        console.error('Admin authorization failed:', err)
        navigate('/admin/login')
      })
      .finally(() => setLoading(false))
  }, [navigate])

  const handleLogout = () => {
    localStorage.removeItem('zahzan_token')
    navigate('/admin/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#141518] text-[#e1e3e8] flex items-center justify-center font-sans">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#5a5e4b] border-t-transparent rounded-full animate-spin mx-auto" />
          <span className="text-xs uppercase tracking-[0.25em] text-[#8a8e98] block">Authenticating Admin Access...</span>
        </div>
      </div>
    )
  }

  const navItems = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Orders', path: '/admin/orders', icon: ShoppingBag },
    { label: 'Payments', path: '/admin/payments', icon: ShieldCheck },
    { label: 'Products', path: '/admin/products', icon: Package },
    { label: 'Customers', path: '/admin/customers', icon: Users },
    { label: 'Newsletter', path: '/admin/newsletter', icon: Mail },
    { label: 'Audit Logs', path: '/admin/audit-logs', icon: ShieldCheck }
  ]

  return (
    <div className="min-h-screen bg-[#0f1012] text-[#e1e3e8] font-sans flex flex-col md:flex-row">
      
      {/* SIDEBAR DESKTOP */}
      <aside className="w-64 bg-[#16181d] border-r border-[#262931] hidden md:flex flex-col justify-between flex-shrink-0 min-h-screen">
        <div>
          {/* Logo & Header */}
          <div className="p-6 border-b border-[#262931]">
            <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-[#8a8e98] block">
              ZAHZAN EXECUTIVE
            </span>
            <h1 className="font-serif text-xl font-normal text-white mt-1">
              Admin Portal
            </h1>
          </div>

          {/* Navigation */}
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center justify-between px-4 py-3 text-xs uppercase tracking-[0.2em] font-medium rounded-sm transition-all ${
                    isActive
                      ? 'bg-[#222630] text-white border-l-2 border-[#8c9472]'
                      : 'text-[#8a8e98] hover:bg-[#1c1f26] hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </div>
                  {isActive && <ChevronRight size={14} className="text-[#8c9472]" />}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Footer Admin Profile & Logout */}
        <div className="p-4 border-t border-[#262931] bg-[#121317]">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-white block">{adminUser?.name || 'Administrator'}</span>
              <span className="text-[10px] text-[#8a8e98] font-mono block truncate max-w-[130px]">{adminUser?.email}</span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="p-2 text-[#8a8e98] hover:text-red-400 hover:bg-[#222630] transition-colors rounded-sm cursor-pointer"
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* MOBILE TOP BAR */}
      <div className="md:hidden bg-[#16181d] border-b border-[#262931] px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div>
          <span className="text-[9px] font-mono uppercase tracking-widest text-[#8a8e98] block">ZAHZAN</span>
          <h2 className="font-serif text-lg text-white font-normal">Admin Portal</h2>
        </div>

        <button
          type="button"
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          className="p-2 text-white hover:bg-[#222630] rounded-sm cursor-pointer"
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* MOBILE DROPDOWN MENU */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-[#16181d] border-b border-[#262931] p-4 space-y-2 sticky top-[57px] z-20">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 text-xs uppercase tracking-widest font-medium rounded-sm ${
                  isActive ? 'bg-[#222630] text-white border-l-2 border-[#8c9472]' : 'text-[#8a8e98]'
                }`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            )
          })}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-xs uppercase tracking-widest font-medium text-red-400 border-t border-[#262931] pt-3"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 bg-[#0f1012] p-4 sm:p-8 overflow-y-auto">
        {children || <Outlet />}
      </main>

    </div>
  )
}
