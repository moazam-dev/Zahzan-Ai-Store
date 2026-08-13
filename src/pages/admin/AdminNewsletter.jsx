import { useState, useEffect } from 'react'
import { Mail, Download, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import AdminLayout from './AdminLayout'

const API_BASE = '/api'

export default function AdminNewsletter() {
  const [subscribers, setSubscribers] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const fetchSubscribers = () => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return

    setLoading(true)
    setErrorMsg(null)

    const queryParams = new URLSearchParams({
      page,
      limit: 15,
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
  }, [page])

  const handleExportCSV = () => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return

    fetch(`${API_BASE}/admin/newsletter/export`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'zahzan_newsletter_subscribers.csv'
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
              CLIENT ENGAGEMENT RECORDS
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

        {/* SEARCH BAR */}
        <div className="bg-[#16181d] border border-[#262931] p-4 rounded-sm">
          <form onSubmit={(e) => { e.preventDefault(); setPage(1); fetchSubscribers() }} className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subscribers by Email..."
                className="w-full bg-[#0f1012] border border-[#262931] p-2.5 pl-9 text-xs font-mono text-white placeholder-[#505462] focus:outline-none focus:border-[#8c9472]"
              />
              <Search size={14} className="absolute left-3 top-3.5 text-[#505462]" />
            </div>
            <button type="submit" className="bg-[#222630] border border-[#343845] text-white text-xs font-mono uppercase px-4 py-2.5 hover:bg-[#8c9472] transition-colors cursor-pointer">
              Search
            </button>
          </form>
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
                    <th className="py-3 px-4">Subscribed Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262931]">
                  {subscribers.map((sub) => (
                    <tr key={sub._id || sub.id} className="hover:bg-[#1c1f26]">
                      <td className="py-3.5 px-4 font-semibold text-white">{sub.email}</td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 text-[9px] uppercase font-bold bg-green-950 text-green-300 border border-green-800">
                          {sub.status || 'subscribed'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-[#8a8e98]">
                        {new Date(sub.subscribedAt || sub.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-[#262931] bg-[#121317] flex items-center justify-between text-xs font-mono text-[#8a8e98]">
              <span>Page {page} of {totalPages} ({totalCount} subscribers)</span>
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
            <h4 className="font-serif text-2xl text-white font-light">NO SUBSCRIBERS RECORDED YET</h4>
          </div>
        )}

      </div>
    </AdminLayout>
  )
}
