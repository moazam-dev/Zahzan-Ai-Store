'use client'

import { useState, useEffect } from 'react'
import { 
  Users, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  X, 
  ShoppingBag, 
  MapPin, 
  UserCheck, 
  UserX 
} from 'lucide-react'
import AdminLayout from './AdminLayout'

const API_BASE = '/api'

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)
  
  // Search & Pagination
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Selected Customer Modal
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerAddresses, setCustomerAddresses] = useState([])
  const [customerOrders, setCustomerOrders] = useState([])
  const [detailsLoading, setDetailsLoading] = useState(false)

  const fetchCustomers = () => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return

    setLoading(true)
    setErrorMsg(null)

    const queryParams = new URLSearchParams({
      page,
      limit: 10,
      search: search.trim()
    })

    fetch(`${API_BASE}/admin/customers?${queryParams.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.customers)) {
          setCustomers(data.customers)
          setTotalPages(data.totalPages || 1)
          setTotalCount(data.total || 0)
        } else {
          setErrorMsg(data.message || 'Failed to fetch customer records.')
        }
      })
      .catch((err) => {
        console.error('Failed to fetch customers:', err)
        setErrorMsg('Error connecting to backend database.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchCustomers()
  }, [page])

  const openCustomerDetails = async (cust) => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return

    setSelectedCustomer(cust)
    setCustomerAddresses([])
    setCustomerOrders([])
    setDetailsLoading(true)

    try {
      const res = await fetch(`${API_BASE}/admin/customers/${cust._id || cust.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        setCustomerAddresses(data.addresses || [])
        setCustomerOrders(data.orders || [])
      }
    } catch (err) {
      console.error('Error fetching customer details:', err)
    } finally {
      setDetailsLoading(false)
    }
  }

  const handleToggleCustomerStatus = async (cust) => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return

    const newStatus = !cust.isActive
    if (!window.confirm(`Are you sure you want to ${newStatus ? 'activate' : 'deactivate'} ${cust.firstName}'s account?`)) return

    try {
      const res = await fetch(`${API_BASE}/admin/customers/${cust._id || cust.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: newStatus })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setCustomers((prev) =>
          prev.map((c) => (c._id === cust._id ? { ...c, isActive: newStatus } : c))
        )
        if (selectedCustomer && selectedCustomer._id === cust._id) {
          setSelectedCustomer({ ...selectedCustomer, isActive: newStatus })
        }
      }
    } catch (err) {
      console.error('Error updating customer status:', err)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#262931] pb-5">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-[#8c9472] block">
              CLIENT DATABASE RECORDS
            </span>
            <h1 className="font-serif text-3xl font-light text-white">
              Registered Clients ({totalCount})
            </h1>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="bg-[#16181d] border border-[#262931] p-4 rounded-sm">
          <form onSubmit={(e) => { e.preventDefault(); setPage(1); fetchCustomers() }} className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clients by Name, Email, Phone..."
                className="w-full bg-[#0f1012] border border-[#262931] p-2.5 pl-9 text-xs font-mono text-white placeholder-[#505462] focus:outline-none focus:border-[#8c9472]"
              />
              <Search size={14} className="absolute left-3 top-3.5 text-[#505462]" />
            </div>
            <button type="submit" className="bg-[#222630] border border-[#343845] text-white text-xs font-mono uppercase px-4 py-2.5 hover:bg-[#8c9472] transition-colors cursor-pointer">
              Search
            </button>
          </form>
        </div>

        {/* CUSTOMERS TABLE */}
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-[#8c9472] border-t-transparent rounded-full animate-spin mx-auto" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#8a8e98] block">Fetching customer records...</span>
          </div>
        ) : errorMsg ? (
          <div className="p-4 bg-[#2d1515] border border-[#5c2424] text-red-300 text-xs font-mono rounded-xs">
            {errorMsg}
          </div>
        ) : customers.length > 0 ? (
          <div className="bg-[#16181d] border border-[#262931] rounded-sm overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#262931] bg-[#121317] text-[#8a8e98] uppercase text-[10px]">
                    <th className="py-3 px-4">Client Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">Registered Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262931]">
                  {customers.map((cust) => (
                    <tr key={cust._id || cust.id} className="hover:bg-[#1c1f26]">
                      <td className="py-3.5 px-4 font-semibold text-white">
                        {cust.firstName} {cust.lastName}
                      </td>
                      <td className="py-3.5 px-4 text-[#c2c5ce]">{cust.email}</td>
                      <td className="py-3.5 px-4 text-[#8a8e98]">{cust.phone || 'N/A'}</td>
                      <td className="py-3.5 px-4 text-[#8a8e98]">
                        {new Date(cust.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 text-[9px] uppercase font-bold border ${
                          cust.isActive !== false ? 'bg-green-950 text-green-300 border-green-800' : 'bg-red-950 text-red-300 border-red-800'
                        }`}>
                          {cust.isActive !== false ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openCustomerDetails(cust)}
                          className="inline-flex items-center gap-1 bg-[#222630] border border-[#343845] text-white text-[10px] uppercase px-3 py-1.5 hover:bg-[#8c9472] transition-colors cursor-pointer"
                        >
                          <Eye size={12} />
                          <span>View Profile</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleCustomerStatus(cust)}
                          className="p-1.5 bg-[#0f1012] border border-[#262931] text-[#8a8e98] hover:text-white transition-colors rounded-xs cursor-pointer"
                          title={cust.isActive !== false ? 'Deactivate' : 'Activate'}
                        >
                          {cust.isActive !== false ? <UserX size={14} className="text-red-400" /> : <UserCheck size={14} className="text-green-400" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-[#262931] bg-[#121317] flex items-center justify-between text-xs font-mono text-[#8a8e98]">
              <span>Page {page} of {totalPages} ({totalCount} total clients)</span>
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
            <Users size={36} className="mx-auto text-[#505462]" />
            <h4 className="font-serif text-2xl text-white font-light">NO CLIENTS FOUND</h4>
          </div>
        )}

        {/* CUSTOMER PROFILE MODAL */}
        {selectedCustomer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
            <div className="bg-[#16181d] border border-[#262931] rounded-sm max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl text-xs font-mono">
              
              <div className="p-6 border-b border-[#262931] flex items-center justify-between bg-[#121317]">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-[#8c9472] block">Client Dossier</span>
                  <h3 className="font-serif text-2xl text-white font-light">
                    {selectedCustomer.firstName} {selectedCustomer.lastName}
                  </h3>
                </div>
                <button type="button" onClick={() => setSelectedCustomer(null)} className="text-[#8a8e98] hover:text-white p-1 cursor-pointer">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                {/* Details */}
                <div className="grid grid-cols-2 gap-4 bg-[#0f1012] p-4 border border-[#262931]">
                  <div>
                    <span className="text-[10px] text-[#8a8e98] uppercase block mb-1">Contact Email</span>
                    <strong className="text-white block">{selectedCustomer.email}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#8a8e98] uppercase block mb-1">Phone Number</span>
                    <strong className="text-white block">{selectedCustomer.phone || 'Not provided'}</strong>
                  </div>
                </div>

                {/* Saved Addresses */}
                <div className="space-y-3">
                  <span className="text-[10px] uppercase tracking-wider text-[#8c9472] block">SAVED ADDRESS BOOK ({customerAddresses.length})</span>
                  {customerAddresses.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {customerAddresses.map((addr) => (
                        <div key={addr._id} className="p-3 bg-[#0f1012] border border-[#262931] space-y-1">
                          <span className="text-[10px] font-bold text-white uppercase block">{addr.label || addr.recipientName}</span>
                          <p className="text-[#c2c5ce] leading-relaxed">
                            {addr.addressLine1}, {addr.city}, {addr.province} {addr.postalCode}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 bg-[#0f1012] border border-[#262931] text-[#707482]">No saved addresses in profile.</div>
                  )}
                </div>

                {/* Order History */}
                <div className="space-y-3">
                  <span className="text-[10px] uppercase tracking-wider text-[#8c9472] block">CLIENT ORDER HISTORY ({customerOrders.length})</span>
                  {customerOrders.length > 0 ? (
                    <div className="space-y-2">
                      {customerOrders.map((ord) => (
                        <div key={ord._id} className="flex items-center justify-between p-3 bg-[#0f1012] border border-[#262931]">
                          <div>
                            <span className="font-semibold text-white block">{ord.orderNumber}</span>
                            <span className="text-[10px] text-[#707482] block">{new Date(ord.createdAt).toLocaleDateString()}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-serif text-sm text-white block">PKR {ord.total.toLocaleString()}</span>
                            <span className="text-[9px] uppercase font-bold text-[#8c9472]">{ord.orderStatus}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 bg-[#0f1012] border border-[#262931] text-[#707482]">No orders placed by this customer yet.</div>
                  )}
                </div>

              </div>

              <div className="p-4 border-t border-[#262931] bg-[#121317] flex justify-end">
                <button type="button" onClick={() => setSelectedCustomer(null)} className="bg-[#222630] border border-[#343845] text-white px-5 py-2 hover:bg-[#8c9472] cursor-pointer">
                  Close Dossier
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  )
}
