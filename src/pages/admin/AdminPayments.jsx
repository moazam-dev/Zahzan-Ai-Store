import { useState, useEffect } from 'react'
import { 
  CreditCard, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  X, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  ExternalLink,
  DollarSign,
  Clock,
  Building,
  Smartphone
} from 'lucide-react'
import AdminLayout from './AdminLayout'

const API_BASE = '/api'

export default function AdminPayments() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)
  
  // Filtering & Pagination State
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Pending')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Inspection Modal State
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [processingAction, setProcessingAction] = useState(false)

  const fetchPayments = () => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return

    setLoading(true)
    setErrorMsg(null)

    const queryParams = new URLSearchParams({
      page,
      limit: 10,
      status: statusFilter,
      search: search.trim()
    })

    fetch(`${API_BASE}/admin/payments?${queryParams.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.payments)) {
          setPayments(data.payments)
          setTotalPages(data.totalPages || 1)
          setTotalCount(data.total || 0)
        } else {
          setErrorMsg(data.message || 'Failed to fetch payment records.')
        }
      })
      .catch((err) => {
        console.error('Failed to fetch admin payments:', err)
        setErrorMsg('Error connecting to database.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchPayments()
  }, [page, statusFilter])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setPage(1)
    fetchPayments()
  }

  const handleVerifyPayment = async (paymentId) => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return
    if (!window.confirm('Are you sure you want to APPROVE and VERIFY this payment proof?')) return

    try {
      setProcessingAction(true)
      const res = await fetch(`${API_BASE}/admin/payments/${paymentId}/verify`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      })

      const data = await res.json()
      if (res.ok && data.success) {
        alert('Payment proof verified successfully!')
        setSelectedPayment(null)
        fetchPayments()
      } else {
        alert(data.message || 'Failed to verify payment.')
      }
    } catch (err) {
      console.error('Error verifying payment:', err)
      alert('Error updating payment status.')
    } finally {
      setProcessingAction(false)
    }
  }

  const handleRejectPayment = async (paymentId) => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return

    if (!rejectionReason || !rejectionReason.trim()) {
      alert('Please enter a rejection reason (e.g. Invalid reference ID, incorrect amount, unclear receipt).')
      return
    }

    if (!window.confirm('Are you sure you want to REJECT this payment proof?')) return

    try {
      setProcessingAction(true)
      const res = await fetch(`${API_BASE}/admin/payments/${paymentId}/reject`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        alert('Payment proof rejected.')
        setSelectedPayment(null)
        setRejectionReason('')
        fetchPayments()
      } else {
        alert(data.message || 'Failed to reject payment.')
      }
    } catch (err) {
      console.error('Error rejecting payment:', err)
      alert('Error rejecting payment on server.')
    } finally {
      setProcessingAction(false)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        
        {/* Page Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#262931] pb-5">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-[#8c9472] block">
              MANUAL PAYMENT AUDIT & VERIFICATION
            </span>
            <h1 className="font-serif text-3xl font-light text-white">
              Payment Submissions ({totalCount})
            </h1>
          </div>
        </div>

        {/* SEARCH & FILTER BAR */}
        <div className="bg-[#16181d] border border-[#262931] p-4 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by Order #, Transaction Ref, Customer Email..."
                className="w-full bg-[#0f1012] border border-[#262931] p-2.5 pl-9 text-xs font-mono text-white placeholder-[#505462] focus:outline-none focus:border-[#8c9472]"
              />
              <Search size={14} className="absolute left-3 top-3.5 text-[#505462]" />
            </div>
            <button
              type="submit"
              className="bg-[#222630] border border-[#343845] text-white text-xs font-mono uppercase tracking-wider px-4 py-2.5 hover:bg-[#8c9472] transition-colors cursor-pointer"
            >
              Search
            </button>
          </form>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 md:pb-0">
            {['all', 'Pending', 'Verified', 'Rejected'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setStatusFilter(st)
                  setPage(1)
                }}
                className={`px-3.5 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded-xs border transition-colors cursor-pointer flex-shrink-0 ${
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

        {/* PAYMENTS TABLE */}
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-[#8c9472] border-t-transparent rounded-full animate-spin mx-auto" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#8a8e98] block">Fetching payment records...</span>
          </div>
        ) : errorMsg ? (
          <div className="p-4 bg-[#2d1515] border border-[#5c2424] text-red-300 text-xs font-mono rounded-xs">
            {errorMsg}
          </div>
        ) : payments.length > 0 ? (
          <div className="bg-[#16181d] border border-[#262931] rounded-sm overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#262931] bg-[#121317] text-[#8a8e98] uppercase text-[10px]">
                    <th className="py-3 px-4">Submitted Date</th>
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">Channel & Reference</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Payable Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262931]">
                  {payments.map((pay) => {
                    const status = pay.status || 'Pending'
                    const orderNum = pay.orderId?.orderNumber || 'N/A'
                    const clientName = pay.userId ? `${pay.userId.firstName} ${pay.userId.lastName}` : 'Guest'
                    const clientEmail = pay.userId?.email || ''

                    return (
                      <tr key={pay._id || pay.id} className="hover:bg-[#1c1f26]">
                        <td className="py-3.5 px-4 text-[#8a8e98]">
                          {new Date(pay.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-white">
                          {orderNum}
                        </td>
                        <td className="py-3.5 px-4 text-[#c2c5ce]">
                          <span className="font-semibold text-white block">{pay.paymentMethod}</span>
                          <span className="text-[10px] text-[#8c9472] font-mono block">Ref: {pay.transactionReference}</span>
                        </td>
                        <td className="py-3.5 px-4 text-[#c2c5ce]">
                          <div className="font-medium text-white">{clientName}</div>
                          <div className="text-[10px] text-[#707482]">{clientEmail}</div>
                        </td>
                        <td className="py-3.5 px-4 font-serif text-sm text-white">
                          PKR {pay.amount.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-0.5 text-[9px] uppercase font-bold border ${
                            status === 'Verified'
                              ? 'bg-green-950 text-green-300 border-green-800'
                              : status === 'Rejected'
                              ? 'bg-red-950 text-red-300 border-red-800'
                              : 'bg-yellow-950 text-yellow-300 border-yellow-800'
                          }`}>
                            {status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPayment(pay)
                              setRejectionReason(pay.rejectionReason || '')
                            }}
                            className="inline-flex items-center gap-1 bg-[#222630] border border-[#343845] text-white text-[10px] uppercase tracking-wider px-3 py-1.5 hover:bg-[#8c9472] transition-colors cursor-pointer"
                          >
                            <Eye size={12} />
                            <span>Inspect & Verify</span>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-[#262931] bg-[#121317] flex items-center justify-between text-xs font-mono text-[#8a8e98]">
              <span>Page {page} of {totalPages} ({totalCount} payment records)</span>
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
            <CreditCard size={36} className="mx-auto text-[#505462]" />
            <h4 className="font-serif text-2xl text-white font-light">NO PAYMENT RECORDS FOUND</h4>
            <p className="text-xs font-mono text-[#8a8e98]">Try selecting a different status filter or search query.</p>
          </div>
        )}

        {/* INSPECT & VERIFY PAYMENT MODAL */}
        {selectedPayment && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
            <div className="bg-[#16181d] border border-[#262931] rounded-sm max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl text-xs font-mono">
              
              {/* Modal Header */}
              <div className="p-6 border-b border-[#262931] flex items-center justify-between bg-[#121317]">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-[#8c9472] block">Payment Verification Audit</span>
                  <h3 className="font-serif text-2xl text-white font-light">
                    Order #{selectedPayment.orderId?.orderNumber || 'N/A'} — PKR {selectedPayment.amount.toLocaleString()}
                  </h3>
                </div>
                <button type="button" onClick={() => setSelectedPayment(null)} className="text-[#8a8e98] hover:text-white p-1 cursor-pointer">
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                
                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#0f1012] p-4 border border-[#262931]">
                  <div className="space-y-1">
                    <span className="text-[10px] text-[#8a8e98] uppercase block">Client Information</span>
                    <strong className="text-white block">
                      {selectedPayment.userId ? `${selectedPayment.userId.firstName} ${selectedPayment.userId.lastName}` : 'Client'}
                    </strong>
                    <span className="text-[#c2c5ce] block">{selectedPayment.userId?.email}</span>
                    <span className="text-[#c2c5ce] block">{selectedPayment.userId?.phone}</span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-[#8a8e98] uppercase block">Transaction Reference</span>
                    <span className="text-white block font-bold">{selectedPayment.paymentMethod}</span>
                    <span className="text-[#8c9472] font-mono font-bold block">Ref: {selectedPayment.transactionReference}</span>
                    <span className="text-[#707482] text-[10px]">Submitted: {new Date(selectedPayment.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                {/* PAYMENT PROOF VIEWER */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-[#8c9472] font-semibold">
                      SUBMITTED PAYMENT PROOF RECEIPT
                    </span>
                    <a
                      href={selectedPayment.proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] uppercase text-[#8c9472] hover:underline flex items-center gap-1"
                    >
                      <span>Open File in New Tab</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>

                  <div className="bg-[#0f1012] border border-[#262931] p-3 text-center rounded-xs overflow-hidden max-h-80 flex items-center justify-center">
                    {selectedPayment.proofUrl?.toLowerCase().endsWith('.pdf') ? (
                      <div className="py-8 space-y-2">
                        <span className="text-sm font-semibold text-white block">PDF Document Receipt</span>
                        <a
                          href={selectedPayment.proofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block bg-[#222630] border border-[#343845] text-white px-4 py-2 hover:bg-[#8c9472]"
                        >
                          View PDF Receipt →
                        </a>
                      </div>
                    ) : (
                      <img
                        src={selectedPayment.proofUrl}
                        alt="Payment Proof Screenshot"
                        className="max-h-72 object-contain mx-auto border border-[#262931]"
                      />
                    )}
                  </div>
                </div>

                {/* Status & Rejection Form */}
                <div className="space-y-3 pt-2 border-t border-[#262931]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#8a8e98] uppercase">Current Payment Status:</span>
                    <span className={`px-2.5 py-0.5 text-[10px] uppercase font-bold border ${
                      selectedPayment.status === 'Verified' ? 'bg-green-950 text-green-300 border-green-800' : selectedPayment.status === 'Rejected' ? 'bg-red-950 text-red-300 border-red-800' : 'bg-yellow-950 text-yellow-300 border-yellow-800'
                    }`}>
                      {selectedPayment.status}
                    </span>
                  </div>

                  {selectedPayment.status === 'Pending' && (
                    <div className="space-y-2 pt-2">
                      <label className="block text-[10px] text-[#8a8e98] uppercase">
                        Rejection Reason (Required ONLY if rejecting payment)
                      </label>
                      <input
                        type="text"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="e.g. Invalid transaction ID, incorrect amount transferred, unclear receipt screenshot"
                        className="w-full bg-[#0f1012] border border-[#262931] p-3 text-xs font-mono text-white placeholder-[#505462] focus:outline-none focus:border-red-500"
                      />
                    </div>
                  )}
                </div>

              </div>

              {/* Modal Footer Actions */}
              <div className="p-4 border-t border-[#262931] bg-[#121317] flex flex-col sm:flex-row items-center justify-between gap-3">
                <button type="button" onClick={() => setSelectedPayment(null)} className="bg-[#222630] border border-[#343845] text-white px-5 py-2 hover:bg-[#3c4254] cursor-pointer w-full sm:w-auto">
                  Close Window
                </button>

                {selectedPayment.status === 'Pending' && (
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                      type="button"
                      disabled={processingAction}
                      onClick={() => handleRejectPayment(selectedPayment._id || selectedPayment.id)}
                      className="flex-1 sm:flex-none bg-red-950 border border-red-800 text-red-300 text-xs uppercase px-5 py-2 hover:bg-red-900 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {processingAction ? 'Processing...' : 'REJECT PAYMENT'}
                    </button>

                    <button
                      type="button"
                      disabled={processingAction}
                      onClick={() => handleVerifyPayment(selectedPayment._id || selectedPayment.id)}
                      className="flex-1 sm:flex-none bg-[#8c9472] text-[#0f1012] font-bold text-xs uppercase px-6 py-2 hover:bg-white transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {processingAction ? 'Processing...' : 'APPROVE & VERIFY PAYMENT ✓'}
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  )
}
