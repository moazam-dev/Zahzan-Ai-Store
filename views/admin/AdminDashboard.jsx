'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
  ShoppingBag, 
  DollarSign, 
  Users, 
  Package, 
  AlertTriangle, 
  Mail, 
  ArrowUpRight, 
  RefreshCw,
  Clock,
  Sparkles,
  Camera,
  BookOpen
} from 'lucide-react'
import AdminLayout from './AdminLayout'

const API_BASE = '/api'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)

  const fetchDashboardStats = () => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return

    setLoading(true)
    setErrorMsg(null)

    fetch(`${API_BASE}/admin/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.stats) {
          setStats(data.stats)
        } else {
          setErrorMsg(data.message || 'Failed to load system dashboard stats.')
        }
      })
      .catch((err) => {
        console.error('Failed to fetch dashboard stats:', err)
        setErrorMsg('Error connecting to backend database server.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchDashboardStats()
  }, [])

  return (
    <AdminLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#262931] pb-5">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-[#8c9472] block">
              REAL-TIME DATABASE ANALYTICS
            </span>
            <h1 className="font-serif text-3xl font-light text-white">
              System Dashboard
            </h1>
          </div>

          <button
            type="button"
            onClick={fetchDashboardStats}
            className="self-start sm:self-auto flex items-center gap-2 bg-[#16181d] border border-[#262931] text-xs font-mono uppercase tracking-wider text-[#8a8e98] hover:text-white px-4 py-2 hover:border-[#8c9472] transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh Analytics</span>
          </button>
        </div>

        {/* Loading / Error States */}
        {loading && !stats ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-[#8c9472] border-t-transparent rounded-full animate-spin mx-auto" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#8a8e98] block">Aggregating database statistics...</span>
          </div>
        ) : errorMsg ? (
          <div className="p-4 bg-[#2d1515] border border-[#5c2424] text-red-300 text-xs font-mono rounded-xs">
            {errorMsg}
          </div>
        ) : stats ? (
          <>
            {/* TOP METRICS CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              
              {/* REVENUE CARD */}
              <div className="bg-[#16181d] border border-[#262931] p-5 rounded-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#8a8e98]">Net Sales Revenue</span>
                  <div className="p-2 bg-[#222630] text-[#8c9472] rounded-xs">
                    <DollarSign size={16} />
                  </div>
                </div>
                <div>
                  <h3 className="font-serif text-2xl font-light text-white">
                    PKR {stats.revenue ? stats.revenue.toLocaleString() : '0'}
                  </h3>
                  <span className="text-[10px] text-[#8a8e98] font-mono block mt-1">Calculated from completed orders</span>
                </div>
              </div>

              {/* ORDERS CARD */}
              <div className="bg-[#16181d] border border-[#262931] p-5 rounded-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#8a8e98]">Total Orders</span>
                  <div className="p-2 bg-[#222630] text-[#8c9472] rounded-xs">
                    <ShoppingBag size={16} />
                  </div>
                </div>
                <div>
                  <h3 className="font-serif text-2xl font-light text-white">
                    {stats.orders.total}
                  </h3>
                  <span className="text-[10px] text-[#8a8e98] font-mono block mt-1">
                    {stats.orders.pending} Pending • {stats.orders.confirmed} Confirmed
                  </span>
                </div>
              </div>

              {/* CUSTOMERS CARD */}
              <div className="bg-[#16181d] border border-[#262931] p-5 rounded-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#8a8e98]">Registered Clients</span>
                  <div className="p-2 bg-[#222630] text-[#8c9472] rounded-xs">
                    <Users size={16} />
                  </div>
                </div>
                <div>
                  <h3 className="font-serif text-2xl font-light text-white">
                    {stats.customers.total}
                  </h3>
                  <span className="text-[10px] text-[#8a8e98] font-mono block mt-1">Customer profiles in database</span>
                </div>
              </div>

              {/* INVENTORY CARD */}
              <div className="bg-[#16181d] border border-[#262931] p-5 rounded-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#8a8e98]">Active Catalog</span>
                  <div className="p-2 bg-[#222630] text-[#8c9472] rounded-xs">
                    <Package size={16} />
                  </div>
                </div>
                <div>
                  <h3 className="font-serif text-2xl font-light text-white">
                    {stats.inventory.totalProducts} Products
                  </h3>
                  <span className="text-[10px] text-[#8a8e98] font-mono block mt-1">
                    {stats.inventory.lowStockCount} Low stock • {stats.inventory.outOfStockCount} Sold out
                  </span>
                </div>
              </div>

            </div>

            {/* ORDER STATUS BREAKDOWN GRID */}
            <div className="space-y-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#8a8e98] block">
                ORDER STATUS AGGREGATION
              </span>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Pending', count: stats.orders.pending, color: 'text-yellow-400 border-yellow-900/40' },
                  { label: 'Confirmed', count: stats.orders.confirmed, color: 'text-blue-400 border-blue-900/40' },
                  { label: 'Processing', count: stats.orders.processing, color: 'text-purple-400 border-purple-900/40' },
                  { label: 'Shipped', count: stats.orders.shipped, color: 'text-indigo-400 border-indigo-900/40' },
                  { label: 'Delivered', count: stats.orders.delivered, color: 'text-green-400 border-green-900/40' },
                  { label: 'Cancelled', count: stats.orders.cancelled, color: 'text-red-400 border-red-900/40' }
                ].map((st) => (
                  <div key={st.label} className={`bg-[#16181d] border ${st.color} p-3.5 rounded-xs space-y-1`}>
                    <span className="text-[9px] font-mono uppercase tracking-widest text-[#8a8e98] block">{st.label}</span>
                    <span className={`text-xl font-serif font-light ${st.color}`}>{st.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* TWO-COLUMN TABLES: RECENT ORDERS & INVENTORY / NEWSLETTER */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* RECENT ORDERS TABLE (2 COLS) */}
              <div className="lg:col-span-2 bg-[#16181d] border border-[#262931] p-6 rounded-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[#262931] pb-3">
                  <h3 className="font-serif text-lg font-light text-white">Recent Customer Orders</h3>
                  <Link href="/admin/orders" className="text-[10px] font-mono uppercase tracking-widest text-[#8c9472] hover:underline flex items-center gap-1">
                    <span>View All Orders</span>
                    <ArrowUpRight size={12} />
                  </Link>
                </div>

                {stats.recentOrders && stats.recentOrders.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="border-b border-[#262931] text-[#8a8e98] uppercase text-[10px]">
                          <th className="py-2.5 px-3">Order #</th>
                          <th className="py-2.5 px-3">Customer</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#262931]">
                        {stats.recentOrders.map((ord) => (
                          <tr key={ord._id || ord.id} className="hover:bg-[#1c1f26]">
                            <td className="py-3 px-3 font-semibold text-white">{ord.orderNumber}</td>
                            <td className="py-3 px-3 text-[#c2c5ce]">
                              <div>{ord.customerName}</div>
                              <div className="text-[10px] text-[#707482]">{ord.customerEmail}</div>
                            </td>
                            <td className="py-3 px-3">
                              <span className="px-2 py-0.5 text-[9px] uppercase font-semibold bg-[#222630] border border-[#343845] text-[#c2c5ce]">
                                {ord.orderStatus}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-serif text-sm text-white">PKR {ord.total.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs font-mono text-[#707482]">No orders placed in database yet.</div>
                )}
              </div>

              {/* SIDE COLUMN: INVENTORY ALERTS & SAFE MODULE STATUS */}
              <div className="space-y-6">
                
                {/* LOW STOCK ALERTS */}
                <div className="bg-[#16181d] border border-[#262931] p-6 rounded-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-[#262931] pb-3">
                    <h3 className="font-serif text-lg font-light text-white flex items-center gap-2">
                      <AlertTriangle size={16} className="text-yellow-400" />
                      <span>Low Stock Alerts</span>
                    </h3>
                    <Link href="/admin/products" className="text-[10px] font-mono uppercase tracking-widest text-[#8c9472] hover:underline">
                      Manage
                    </Link>
                  </div>

                  {stats.inventory.lowStockProducts && stats.inventory.lowStockProducts.length > 0 ? (
                    <div className="space-y-3">
                      {stats.inventory.lowStockProducts.map((p) => (
                        <div key={p._id || p.id} className="flex items-center justify-between p-2.5 bg-[#0f1012] border border-[#262931] text-xs font-mono">
                          <div>
                            <span className="text-white block font-medium">{p.name}</span>
                            <span className="text-[10px] text-[#707482] block">SKU: {p.sku}</span>
                          </div>
                          <span className={`px-2 py-0.5 text-[10px] font-semibold ${p.stock === 0 ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-yellow-950 text-yellow-400 border border-yellow-800'}`}>
                            {p.stock === 0 ? 'SOLD OUT' : `${p.stock} LEFT`}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-xs font-mono text-[#707482]">All products have healthy inventory levels.</div>
                  )}
                </div>

                {/* UNCONFIGURED MODULES SAFE STATUS */}
                <div className="bg-[#16181d] border border-[#262931] p-6 rounded-sm space-y-3">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#8a8e98] block">SYSTEM MODULES STATUS</span>
                  
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between p-2.5 bg-[#0f1012] border border-[#262931]">
                      <div className="flex items-center gap-2 text-[#c2c5ce]">
                        <Mail size={14} className="text-[#8c9472]" />
                        <span>Newsletter Subscribers</span>
                      </div>
                      <span className="text-white font-bold">{stats.newsletter.totalSubscribers}</span>
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-[#0f1012] border border-[#262931] text-[#707482]">
                      <div className="flex items-center gap-2">
                        <Sparkles size={14} />
                        <span>AI Virtual Try-On</span>
                      </div>
                      <span className="text-[10px] uppercase font-mono">Not Configured</span>
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-[#0f1012] border border-[#262931] text-[#707482]">
                      <div className="flex items-center gap-2">
                        <BookOpen size={14} />
                        <span>Story Submissions</span>
                      </div>
                      <span className="text-[10px] uppercase font-mono">Not Configured</span>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          </>
        ) : null}

      </div>
    </AdminLayout>
  )
}
