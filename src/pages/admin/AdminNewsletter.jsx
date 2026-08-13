import { useState, useEffect } from 'react'
import { Mail, Download, Search, ChevronLeft, ChevronRight, Filter } from 'lucide-react'
import AdminLayout from './AdminLayout'

const API_BASE = '/api'

export default function AdminNewsletter() {
  const [subscribers, setSubscribers] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'subscribed' | 'unsubscribed'
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Real Database Stats
  const [stats, setStats] = useState({
    totalSubscribers: 0,
    activeSubscribers: 0,
    unsubscribedSubscribers: 0
  })

  const fetchSubscribers = () => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return

    setLoading(true)
    setErrorMsg(null)

    const queryParams = new URLSearchParams({
      page,
      limit: 15,
      status: statusFilter,
      search: search.trim()
    })

    fetch(`${API_BASE}/admin/newsletter?${queryParams.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.subscribers)) {
          setSubscribers(data.subscribers)
          setTotalPages(data.totalPages || 1)
          setTotalCount(data.total || 0)
          if (data.stats) {
            setStats(data.stats)
          }
        } else {
          setErrorMsg(data.message || 'Failed to fetch newsletter subscribers.')
        }
      })
      .catch((err) => {
        console.error('Error fetching subscribers:', err)
        setErrorMsg('Error connecting to database.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchSubscribers()
  }, [page, statusFilter])

  const handleExportCSV = () => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return

    const queryParams = new URLSearchParams({
      status: statusFilter,
      search: search.trim()
    })

    fetch(`${API_BASE}/admin/newsletter/export?${queryParams.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `zahzan_subscribers_${Date.now()}.csv`
        document.body.appendChild(a)
        a.click()
        a.remove()
      })
      .catch((err) => console.error('Error downloading CSV export:', err))
  }

  return (
    <AdminLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#262931] pb-5">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-[#8c9472] block">
              CLIENT ENGAGEMENT & NEWSLETTER AUDIENCE
            </span>
            <h1 className="font-serif text-3xl font-light text-white">
              Newsletter Subscribers ({totalCount})
            </h1>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            className="self-start sm:self-auto flex items-center gap-2 bg-[#8c9472] text-[#0f1012] text-xs font-mono font-bold uppercase tracking-wider px-5 py-2.5 hover:bg-white transition-colors cursor-pointer"
          >
            <Download size={16} />
            <span>Export Subscribers CSV</span>
          </button>
        </div>

        {/* REAL DATABASE STATS CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#16181d] p-4 border border-[#262931] rounded-sm font-mono">
            <span className="text-[10px] uppercase text-[#8a8e98] block">Total Subscribers</span>
            <strong className="text-2xl font-serif text-white font-light mt-1 block">{stats.totalSubscribers}</strong>
          </div>
          <div className="bg-[#16181d] p-4 border border-[#262931] rounded-sm font-mono">
            <span className="text-[10px] uppercase text-[#8c9472] block">Active Subscribed</span>
            <strong className="text-2xl font-serif text-green-400 font-light mt-1 block">{stats.activeSubscribers}</strong>
          </div>
          <div className="bg-[#16181d] p-4 border border-[#262931] rounded-sm font-mono">
            <span className="text-[10px] uppercase text-red-400 block">Unsubscribed</span>
            <strong className="text-2xl font-serif text-red-300 font-light mt-1 block">{stats.unsubscribedSubscribers}</strong>
          </div>
        </div>

        {/* SEARCH & FILTERS BAR */}
        <div className="bg-[#16181d] border border-[#262931] p-4 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <form onSubmit={(e) => { e.preventDefault(); setPage(1); fetchSubscribers(); }} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subscribers by email..."
                className="w-full bg-[#0f1012] border border-[#262931] p-2.5 pl-9 text-xs font-mono text-white placeholder-[#505462] focus:outline-none focus:border-[#8c9472]"
              />
              <Search size={14} className="absolute left-3 top-3.5 text-[#505462]" />
            </div>
            <button type="submit" className="bg-[#222630] border border-[#343845] text-white text-xs font-mono uppercase px-4 py-2.5 hover:bg-[#8c9472] transition-colors cursor-pointer">
              Search
            </button>
          </form>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {['all', 'subscribed', 'unsubscribed'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setStatusFilter(st)
                  setPage(1)
                }}
                className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded-xs border transition-colors cursor-pointer flex-shrink-0 ${
                  statusFilter === st
                    ? 'bg-[#8c9472] text-[#0f1012] font-bold border-[#8c9472]'
                    : 'bg-[#0f1012] text-[#8a8e98] border-[#262931] hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

        </div>

        {/* SUBSCRIBERS TABLE */}
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-[#8c9472] border-t-transparent rounded-full animate-spin mx-auto" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#8a8e98] block">Fetching subscribers from database...</span>
          </div>
        ) : errorMsg ? (
          <div className="p-4 bg-[#2d1515] border border-[#5c2424] text-red-300 text-xs font-mono rounded-xs">
            {errorMsg}
          </div>
        ) : subscribers.length > 0 ? (
          <div className="bg-[#16181d] border border-[#262931] rounded-sm overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#262931] bg-[#121317] text-[#8a8e98] uppercase text-[10px]">
                    <th className="py-3 px-4">Subscriber Email</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Subscribed Date</th>
                    <th className="py-3 px-4">Unsubscribed Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262931]">
                  {subscribers.map((sub) => {
                    const isSubscribed = sub.status === 'subscribed'
                    return (
                      <tr key={sub._id || sub.id} className="hover:bg-[#1c1f26]">
                        <td className="py-3.5 px-4 font-semibold text-white">{sub.email}</td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 text-[9px] uppercase font-bold border ${
                            isSubscribed
                              ? 'bg-green-950 text-green-300 border-green-800'
                              : 'bg-red-950 text-red-300 border-red-800'
                          }`}>
                            {sub.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-[#8c9472] uppercase font-mono text-[10px]">
                          {sub.source || 'footer'}
                        </td>
                        <td className="py-3.5 px-4 text-[#8a8e98]">
                          {new Date(sub.subscribedAt || sub.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-[#707482]">
                          {sub.unsubscribedAt ? new Date(sub.unsubscribedAt).toLocaleString() : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-[#262931] bg-[#121317] flex items-center justify-between text-xs font-mono text-[#8a8e98]">
              <span>Page {page} of {totalPages} ({totalCount} matching subscribers)</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 bg-[#16181d] border border-[#262931] disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 bg-[#16181d] border border-[#262931] disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-16 text-center space-y-3 bg-[#16181d] border border-[#262931] p-8">
            <Mail size={36} className="mx-auto text-[#505462]" />
            <h4 className="font-serif text-2xl text-white font-light">NO SUBSCRIBERS FOUND</h4>
            <p className="text-xs font-mono text-[#8a8e98]">Try broadening your search query or status filter.</p>
          </div>
        )}

      </div>
    </AdminLayout>
  )
}
