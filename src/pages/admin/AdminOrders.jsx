import { useState, useEffect } from 'react'
import { 
  ShoppingBag, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  X, 
  CheckCircle, 
  AlertCircle,
  Truck,
  MapPin,
  Calendar,
  Clock,
  ExternalLink,
  CreditCard,
  Check,
  XCircle
} from 'lucide-react'
import AdminLayout from './AdminLayout'

const API_BASE = '/api'

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)
  
  // Filtering & Pagination State
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Order Details Modal State
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [verifyingPayment, setVerifyingPayment] = useState(false)

  const fetchOrders = () => {
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

    fetch(`${API_BASE}/admin/orders?${queryParams.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.orders)) {
          setOrders(data.orders)
          setTotalPages(data.totalPages || 1)
          setTotalCount(data.total || 0)
        } else {
          setErrorMsg(data.message || 'Failed to fetch order records.')
        }
      })
      .catch((err) => {
        console.error('Failed to fetch admin orders:', err)
        setErrorMsg('Error connecting to server database.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchOrders()
  }, [page, statusFilter])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setPage(1)
    fetchOrders()
  }

  const handleUpdateStatus = async (orderId, newStatus) => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return

    try {
      setUpdatingStatus(true)
      const res = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ orderStatus: newStatus })
      })

      const data = await res.json()

      if (res.ok && data.success && data.order) {
        setOrders((prev) =>
          prev.map((o) => (o._id === orderId || o.id === orderId ? { ...data.order, payment: o.payment } : o))
        )
        if (selectedOrder && (selectedOrder._id === orderId || selectedOrder.id === orderId)) {
          setSelectedOrder({ ...data.order, payment: selectedOrder.payment })
        }
      } else {
        alert(data.message || 'Failed to update order status.')
      }
    } catch (err) {
      console.error('Failed to update status:', err)
      alert('Error updating status on server.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  // Verify Payment directly from Order Details popup
  const handleVerifyPaymentFromOrder = async (paymentId) => {
    const token = localStorage.getItem('zahzan_token')
    if (!token || !paymentId) return

    if (!window.confirm('Are you sure you want to APPROVE & VERIFY this payment proof?')) return

    try {
      setVerifyingPayment(true)
      const res = await fetch(`${API_BASE}/admin/payments/${paymentId}/verify`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      })

      const data = await res.json()
      if (res.ok && data.success) {
        alert('Payment verified successfully! Order status advanced to Confirmed.')
        setSelectedOrder(null)
        fetchOrders()
      } else {
        alert(data.message || 'Failed to verify payment.')
      }
    } catch (err) {
      console.error('Error verifying payment:', err)
      alert('Error connecting to backend server.')
    } finally {
      setVerifyingPayment(false)
    }
  }

  // Reject Payment directly from Order Details popup
  const handleRejectPaymentFromOrder = async (paymentId) => {
    const token = localStorage.getItem('zahzan_token')
    if (!token || !paymentId) return

    if (!rejectionReason || !rejectionReason.trim()) {
      alert('Please enter a rejection reason (e.g. Invalid reference ID, incorrect amount, unclear receipt screenshot).')
      return
    }

    if (!window.confirm('Are you sure you want to REJECT this payment proof?')) return

    try {
      setVerifyingPayment(true)
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
        setSelectedOrder(null)
        setRejectionReason('')
        fetchOrders()
      } else {
        alert(data.message || 'Failed to reject payment.')
      }
    } catch (err) {
      console.error('Error rejecting payment:', err)
      alert('Error connecting to backend server.')
    } finally {
      setVerifyingPayment(false)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        
        {/* Page Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#262931] pb-5">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-[#8c9472] block">
              REAL DATABASE ORDER MANAGEMENT
            </span>
            <h1 className="font-serif text-3xl font-light text-white">
              Customer Orders ({totalCount})
            </h1>
          </div>
        </div>

        {/* SEARCH & FILTERS BAR */}
        <div className="bg-[#16181d] border border-[#262931] p-4 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Search Input Form */}
          <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by Order #, Customer Name, Email, Phone..."
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
            {['all', 'Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].map((st) => (
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

        {/* ORDERS TABLE */}
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-[#8c9472] border-t-transparent rounded-full animate-spin mx-auto" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#8a8e98] block">Loading database orders...</span>
          </div>
        ) : errorMsg ? (
          <div className="p-4 bg-[#2d1515] border border-[#5c2424] text-red-300 text-xs font-mono rounded-xs">
            {errorMsg}
          </div>
        ) : orders.length > 0 ? (
          <div className="bg-[#16181d] border border-[#262931] rounded-sm overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#262931] bg-[#121317] text-[#8a8e98] uppercase text-[10px]">
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Payment Method</th>
                    <th className="py-3 px-4">Total</th>
                    <th className="py-3 px-4">Order Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262931]">
                  {orders.map((ord) => {
                    const status = ord.orderStatus || 'Pending'
                    const payMethod = ord.paymentMethod || ord.payment?.paymentMethod || 'Cash on Delivery'
                    const isCOD = payMethod === 'Cash on Delivery'

                    return (
                      <tr key={ord._id || ord.id} className="hover:bg-[#1c1f26]">
                        <td className="py-3.5 px-4 font-semibold text-white">{ord.orderNumber}</td>
                        <td className="py-3.5 px-4 text-[#8a8e98]">
                          {new Date(ord.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-4 text-[#c2c5ce]">
                          <div className="font-medium text-white">{ord.customerName}</div>
                          <div className="text-[10px] text-[#707482]">{ord.customerEmail}</div>
                        </td>
                        <td className="py-3.5 px-4 text-[#c2c5ce]">
                          <span className="font-medium text-white block">{payMethod}</span>
                          <span className="text-[10px] text-[#8c9472]">
                            {isCOD ? 'COD (No Proof Required)' : ord.payment ? `Ref: ${ord.payment.transactionReference}` : 'Proof Submitted'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-serif text-sm text-white">
                          PKR {ord.total.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4">
                          <select
                            disabled={updatingStatus}
                            value={status}
                            onChange={(e) => handleUpdateStatus(ord._id || ord.id, e.target.value)}
                            className={`px-2.5 py-1 text-[10px] uppercase font-semibold border focus:outline-none cursor-pointer ${
                              status.toLowerCase() === 'cancelled'
                                ? 'bg-red-950 text-red-300 border-red-800'
                                : status.toLowerCase() === 'delivered'
                                ? 'bg-green-950 text-green-300 border-green-800'
                                : 'bg-[#222630] text-[#c2c5ce] border-[#343845]'
                            }`}
                          >
                            {['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].map((stOption) => (
                              <option key={stOption} value={stOption} className="bg-[#16181d] text-white">
                                {stOption}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrder(ord)
                              setRejectionReason('')
                            }}
                            className="inline-flex items-center gap-1 bg-[#222630] border border-[#343845] text-white text-[10px] uppercase tracking-wider px-3 py-1.5 hover:bg-[#8c9472] transition-colors cursor-pointer"
                          >
                            <Eye size={12} />
                            <span>Details</span>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* PAGINATION BAR */}
            <div className="p-4 border-t border-[#262931] bg-[#121317] flex items-center justify-between text-xs font-mono text-[#8a8e98]">
              <span>Showing Page {page} of {totalPages} ({totalCount} total orders)</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 bg-[#16181d] border border-[#262931] hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 bg-[#16181d] border border-[#262931] hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

          </div>
        ) : (
          <div className="py-16 text-center space-y-3 bg-[#16181d] border border-[#262931] p-8">
            <ShoppingBag size={36} className="mx-auto text-[#505462]" />
            <h4 className="font-serif text-2xl text-white font-light">NO ORDERS FOUND</h4>
            <p className="text-xs font-mono text-[#8a8e98]">Try broadening your search term or status filter.</p>
          </div>
        )}

        {/* ORDER DETAILS MODAL (WITH CLOUDINARY PAYMENT PROOF & VERIFICATION) */}
        {selectedOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <div className="bg-[#16181d] border border-[#262931] rounded-sm max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl text-xs font-mono">
              
              {/* Header */}
              <div className="p-6 border-b border-[#262931] flex items-center justify-between bg-[#121317]">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-[#8c9472] block">Order Detail Snapshot</span>
                  <h3 className="font-serif text-2xl text-white font-light">Order #{selectedOrder.orderNumber}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="text-[#8a8e98] hover:text-white p-1 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body Content */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                
                {/* Customer & Status Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#0f1012] p-4 border border-[#262931]">
                  <div>
                    <span className="text-[10px] text-[#8a8e98] uppercase block mb-1">Customer Profile</span>
                    <strong className="text-white text-sm block">{selectedOrder.customerName}</strong>
                    <span className="text-[#c2c5ce] block">{selectedOrder.customerEmail}</span>
                    <span className="text-[#c2c5ce] block">{selectedOrder.customerPhone}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#8a8e98] uppercase block mb-1">Status & Placed Date</span>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 text-[10px] uppercase font-bold bg-[#222630] border border-[#343845] text-white">
                        {selectedOrder.orderStatus}
                      </span>
                    </div>
                    <span className="text-[#707482]">
                      Date: {new Date(selectedOrder.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* PAYMENT INFORMATION & CLOUDINARY PROOF SECTION */}
                {(() => {
                  const payMethod = selectedOrder.paymentMethod || selectedOrder.payment?.paymentMethod || 'Cash on Delivery'
                  const isCOD = payMethod === 'Cash on Delivery'
                  const paymentObj = selectedOrder.payment
                  const proofUrl = paymentObj?.proofUrl
                  const payStatus = paymentObj?.status || selectedOrder.paymentStatus || (isCOD ? 'not_required' : 'pending')

                  return (
                    <div className="bg-[#0f1012] p-5 border border-[#262931] space-y-4">
                      <div className="flex items-center justify-between border-b border-[#262931] pb-3">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-[#8c9472] font-semibold block">
                            PAYMENT INFORMATION
                          </span>
                          <span className="text-white text-sm font-bold block mt-0.5">{payMethod}</span>
                        </div>

                        <span className={`px-2.5 py-0.5 text-[10px] uppercase font-bold border ${
                          payStatus === 'Verified' || payStatus === 'verified'
                            ? 'bg-green-950 text-green-300 border-green-800'
                            : payStatus === 'Rejected' || payStatus === 'rejected'
                            ? 'bg-red-950 text-red-300 border-red-800'
                            : isCOD || payStatus === 'not_required'
                            ? 'bg-[#222630] text-[#c2c5ce] border-[#343845]'
                            : 'bg-yellow-950 text-yellow-300 border-yellow-800'
                        }`}>
                          {isCOD ? 'Cash on Delivery (Not Required)' : payStatus}
                        </span>
                      </div>

                      {/* Advance Payment Details & Cloudinary Proof Display */}
                      {!isCOD ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4 text-xs font-mono text-[#c2c5ce]">
                            <div>
                              <span className="text-[10px] text-[#8a8e98] uppercase block">Transaction Reference ID</span>
                              <strong className="text-[#8c9472] font-mono text-sm">{paymentObj?.transactionReference || 'N/A'}</strong>
                            </div>
                            <div>
                              <span className="text-[10px] text-[#8a8e98] uppercase block">Payable Order Amount</span>
                              <strong className="text-white font-serif text-sm">PKR {selectedOrder.total?.toLocaleString()}</strong>
                            </div>
                          </div>

                          {/* CLOUDINARY SCREENSHOT VIEWER */}
                          <div className="space-y-2 pt-2 border-t border-[#262931]">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase text-[#8a8e98]">CLOUDINARY PAYMENT SCREENSHOT / RECEIPT</span>
                              {proofUrl && (
                                <a
                                  href={proofUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] uppercase text-[#8c9472] hover:underline flex items-center gap-1"
                                >
                                  <span>View Full Size Image</span>
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </div>

                            {proofUrl ? (
                              <div className="bg-[#16181d] border border-[#262931] p-3 text-center rounded-xs overflow-hidden max-h-72 flex items-center justify-center">
                                {proofUrl.toLowerCase().endsWith('.pdf') ? (
                                  <div className="py-6 space-y-2">
                                    <span className="text-white font-semibold block">PDF Document Receipt</span>
                                    <a
                                      href={proofUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-block bg-[#222630] border border-[#343845] text-white px-4 py-2 hover:bg-[#8c9472]"
                                    >
                                      Open PDF Document →
                                    </a>
                                  </div>
                                ) : (
                                  <img
                                    src={proofUrl}
                                    alt="Uploaded Payment Proof Screenshot"
                                    className="max-h-64 object-contain mx-auto border border-[#262931]"
                                  />
                                )}
                              </div>
                            ) : (
                              <div className="p-4 bg-[#1a1717] border border-[#3d2424] text-red-300 text-xs font-mono rounded-xs">
                                Payment Proof Screenshot: Not Available (No proof file uploaded for this transaction).
                              </div>
                            )}
                          </div>

                          {/* Inline Admin Verification Actions */}
                          {paymentObj && paymentObj.status === 'Pending' && (
                            <div className="space-y-3 pt-3 border-t border-[#262931]">
                              <div className="space-y-1">
                                <label className="block text-[10px] text-[#8a8e98] uppercase">
                                  Rejection Reason (Required ONLY if rejecting payment)
                                </label>
                                <input
                                  type="text"
                                  value={rejectionReason}
                                  onChange={(e) => setRejectionReason(e.target.value)}
                                  placeholder="e.g. Invalid reference ID, incorrect amount, unclear receipt"
                                  className="w-full bg-[#16181d] border border-[#262931] p-2.5 text-xs font-mono text-white placeholder-[#505462] focus:outline-none focus:border-red-500"
                                />
                              </div>

                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  disabled={verifyingPayment}
                                  onClick={() => handleRejectPaymentFromOrder(paymentObj._id || paymentObj.id)}
                                  className="flex-1 bg-red-950 border border-red-800 text-red-300 text-xs font-mono uppercase px-4 py-2 hover:bg-red-900 transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  {verifyingPayment ? 'Processing...' : 'REJECT PAYMENT'}
                                </button>

                                <button
                                  type="button"
                                  disabled={verifyingPayment}
                                  onClick={() => handleVerifyPaymentFromOrder(paymentObj._id || paymentObj.id)}
                                  className="flex-1 bg-[#8c9472] text-[#0f1012] font-bold text-xs font-mono uppercase px-5 py-2 hover:bg-white transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  {verifyingPayment ? 'Processing...' : 'APPROVE & VERIFY PAYMENT ✓'}
                                </button>
                              </div>
                            </div>
                          )}

                        </div>
                      ) : (
                        <div className="text-[#8a8e98] text-xs">
                          Payment Method is <strong>Cash on Delivery</strong>. No advance payment proof screenshot required.
                        </div>
                      )}

                    </div>
                  )
                })()}

                {/* Permanent Shipping Address Snapshot */}
                <div className="bg-[#0f1012] p-4 border border-[#262931] space-y-1">
                  <span className="text-[10px] text-[#8c9472] uppercase font-semibold block mb-1">PERMANENT SHIPPING SNAPSHOT</span>
                  <p className="text-[#c2c5ce] leading-relaxed">
                    <strong>{selectedOrder.shippingAddress?.fullName}</strong><br />
                    {selectedOrder.shippingAddress?.addressLine1} {selectedOrder.shippingAddress?.addressLine2}<br />
                    {selectedOrder.shippingAddress?.city}, {selectedOrder.shippingAddress?.state} {selectedOrder.shippingAddress?.postalCode}, {selectedOrder.shippingAddress?.country}<br />
                    Ph: {selectedOrder.shippingAddress?.phone}
                  </p>
                  {selectedOrder.shippingAddress?.deliveryInstructions && (
                    <div className="pt-2 text-yellow-300 italic text-[11px]">
                      Note: "{selectedOrder.shippingAddress.deliveryInstructions}"
                    </div>
                  )}
                </div>

                {/* Order Articles List */}
                <div className="space-y-3">
                  <span className="text-[10px] uppercase tracking-wider text-[#8a8e98] block">ORDERED ARTICLES ({selectedOrder.items?.length || 0})</span>
                  <div className="space-y-2">
                    {selectedOrder.items?.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-[#0f1012] border border-[#262931]">
                        <img src={item.image || 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=400&q=80'} alt={item.productName} className="w-12 h-16 object-cover bg-[#222]" />
                        <div className="flex-1 space-y-0.5">
                          <h4 className="font-serif text-sm text-white font-normal">{item.productName}</h4>
                          {item.sku && <span className="text-[9px] text-[#707482] block">SKU: {item.sku}</span>}
                          <span className="text-[#8a8e98] text-[11px]">Size: {item.size || 'M'} | Qty: {item.quantity} × PKR {item.unitPrice.toLocaleString()}</span>
                        </div>
                        <span className="font-serif text-sm text-white">PKR {item.totalPrice.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Price Calculation Breakdown */}
                <div className="bg-[#0f1012] p-4 border border-[#262931] space-y-2">
                  <div className="flex justify-between text-[#8a8e98]">
                    <span>Items Subtotal</span>
                    <span className="text-white">PKR {selectedOrder.subtotal?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[#8a8e98]">
                    <span>Shipping Fee</span>
                    <span className="text-white">PKR {selectedOrder.shippingCost?.toLocaleString()}</span>
                  </div>
                  <div className="border-t border-[#262931] pt-2 flex justify-between font-serif text-base text-white">
                    <span>Total Order Amount</span>
                    <span>PKR {selectedOrder.total?.toLocaleString()}</span>
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div className="p-4 border-t border-[#262931] bg-[#121317] flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="bg-[#222630] border border-[#343845] text-white text-xs uppercase px-5 py-2 hover:bg-[#8c9472] transition-colors cursor-pointer"
                >
                  Close Window
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  )
}
