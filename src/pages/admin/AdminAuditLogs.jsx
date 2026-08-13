import { useState, useEffect } from 'react'
import { ShieldCheck, Filter, ChevronLeft, ChevronRight, Clock, User, Info } from 'lucide-react'
import AdminLayout from './AdminLayout'

const API_BASE = '/api'

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)

  const [actionFilter, setActionFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const fetchAuditLogs = () => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return

    setLoading(true)
    setErrorMsg(null)

    const queryParams = new URLSearchParams({
      page,
      limit: 15,
      action: actionFilter
    })

    fetch(`${API_BASE}/admin/audit-logs?${queryParams.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.logs)) {
          setLogs(data.logs)
          setTotalPages(data.totalPages || 1)
          setTotalCount(data.total || 0)
        } else {
          setErrorMsg(data.message || 'Failed to fetch system audit logs.')
        }
      })
      .catch((err) => {
        console.error('Error fetching audit logs:', err)
        setErrorMsg('Error connecting to database.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchAuditLogs()
  }, [page, actionFilter])

  const actionTypes = [
    'all',
    'ADMIN_LOGIN',
    'PRODUCT_CREATED',
    'PRODUCT_UPDATED',
    'PRODUCT_DELETED',
    'STOCK_UPDATED',
    'ORDER_STATUS_CHANGED',
    'CUSTOMER_STATUS_UPDATED',
    'NEWSLETTER_EXPORTED'
  ]

  return (
    <AdminLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#262931] pb-5">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-[#8c9472] block">
              IMMUTABLE SECURITY TRAILS
            </span>
            <h1 className="font-serif text-3xl font-light text-white">
              System Audit Logs ({totalCount})
            </h1>
          </div>
        </div>

        {/* ACTION FILTER BAR */}
        <div className="bg-[#16181d] border border-[#262931] p-4 rounded-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-[#8c9472]" />
            <span className="text-xs font-mono uppercase text-[#8a8e98]">Filter by Action:</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {actionTypes.map((act) => (
              <button
                key={act}
                type="button"
                onClick={() => { setActionFilter(act); setPage(1) }}
                className={`px-3 py-1.5 text-[10px] font-mono uppercase rounded-xs border transition-colors cursor-pointer flex-shrink-0 ${
                  actionFilter === act ? 'bg-[#8c9472] text-[#0f1012] font-bold border-[#8c9472]' : 'bg-[#0f1012] text-[#8a8e98] border-[#262931] hover:text-white'
                }`}
              >
                {act}
              </button>
            ))}
          </div>
        </div>

        {/* AUDIT LOGS TABLE */}
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-[#8c9472] border-t-transparent rounded-full animate-spin mx-auto" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#8a8e98] block">Retrieving audit trails...</span>
          </div>
        ) : errorMsg ? (
          <div className="p-4 bg-[#2d1515] border border-[#5c2424] text-red-300 text-xs font-mono rounded-xs">
            {errorMsg}
          </div>
        ) : logs.length > 0 ? (
          <div className="bg-[#16181d] border border-[#262931] rounded-sm overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#262931] bg-[#121317] text-[#8a8e98] uppercase text-[10px]">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Admin Operator</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Entity</th>
                    <th className="py-3 px-4">Details & Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262931]">
                  {logs.map((log) => (
                    <tr key={log._id || log.id} className="hover:bg-[#1c1f26]">
                      <td className="py-3.5 px-4 text-[#8a8e98] whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-white font-medium whitespace-nowrap">
                        {log.adminId ? `${log.adminId.firstName || ''} ${log.adminId.lastName || ''}`.trim() : 'System'}
                        {log.adminId?.email && <span className="text-[10px] text-[#707482] block">{log.adminId.email}</span>}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 text-[9px] uppercase font-bold bg-[#222630] border border-[#343845] text-[#8c9472]">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-[#c2c5ce]">
                        {log.entity} {log.entityId ? `#${log.entityId}` : ''}
                      </td>
                      <td className="py-3.5 px-4 text-[11px] text-[#8a8e98] font-mono">
                        {log.metadata ? JSON.stringify(log.metadata) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-[#262931] bg-[#121317] flex items-center justify-between text-xs font-mono text-[#8a8e98]">
              <span>Page {page} of {totalPages} ({totalCount} audit logs)</span>
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
            <ShieldCheck size={36} className="mx-auto text-[#505462]" />
            <h4 className="font-serif text-2xl text-white font-light">NO AUDIT LOGS FOUND</h4>
          </div>
        )}

      </div>
    </AdminLayout>
  )
}
