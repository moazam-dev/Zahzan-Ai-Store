'use client'

import { useState, useEffect } from 'react'
import { 
  Package, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  X, 
  Check, 
  ChevronLeft, 
  ChevronRight,
  Power,
  RefreshCw
} from 'lucide-react'
import AdminLayout from './AdminLayout'

const API_BASE = '/api'

export default function AdminProducts() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Filters & Pagination
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'active' | 'deactivated'
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // Modal state
  const [showProductModal, setShowProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [saving, setSaving] = useState(false)

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: 'Ready to Wear',
    price: '',
    stock: '',
    description: '',
    fabric: 'Pure Silk',
    work: 'Hand Embroidery',
    color: 'Ivory',
    sizes: ['S', 'M', 'L', 'XL'],
    image: '',
    hoverImage: ''
  })

  const fetchProducts = () => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return

    setLoading(true)
    setErrorMsg(null)

    const queryParams = new URLSearchParams({
      page,
      limit: 12,
      category: categoryFilter,
      status: statusFilter,
      search: search.trim()
    })

    fetch(`${API_BASE}/admin/products?${queryParams.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.products)) {
          setProducts(data.products)
          setTotalPages(data.totalPages || 1)
        } else {
          setErrorMsg(data.message || 'Failed to fetch products.')
        }
      })
      .catch((err) => {
        console.error('Failed to fetch admin products:', err)
        setErrorMsg('Error connecting to database.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchProducts()
  }, [page, categoryFilter, statusFilter])

  const openAddModal = () => {
    setEditingProduct(null)
    const randomSku = `ZHZ-PROD-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 100)}`
    setFormData({
      name: '',
      sku: randomSku,
      category: 'Ready to Wear',
      price: '25000',
      stock: '10',
      description: 'Handcrafted luxury ensemble featuring intricate embroidery and refined silk fabric.',
      fabric: 'Pure Silk',
      work: 'Hand Embroidery',
      color: 'Ivory',
      sizes: ['S', 'M', 'L', 'XL'],
      image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85',
      hoverImage: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85'
    })
    setShowProductModal(true)
  }

  const openEditModal = (prod) => {
    setEditingProduct(prod)
    setFormData({
      name: prod.name || '',
      sku: prod.sku || '',
      category: prod.category || 'Ready to Wear',
      price: prod.price !== undefined ? String(prod.price) : '',
      stock: prod.stock !== undefined ? String(prod.stock) : '',
      description: prod.description || '',
      fabric: prod.fabric || 'Pure Silk',
      work: prod.work || 'Hand Embroidery',
      color: prod.color || (prod.colors?.[0]?.name) || 'Ivory',
      sizes: prod.sizes || ['S', 'M', 'L', 'XL'],
      image: prod.images?.[0] || prod.image || '',
      hoverImage: prod.images?.[1] || prod.hoverImage || ''
    })
    setShowProductModal(true)
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault()
    const token = localStorage.getItem('zahzan_token')
    if (!token) return

    setSaving(true)
    setErrorMsg(null)

    const isEdit = Boolean(editingProduct)
    const url = isEdit
      ? `${API_BASE}/admin/products/${editingProduct._id || editingProduct.id}`
      : `${API_BASE}/admin/products`

    const method = isEdit ? 'PUT' : 'POST'

    const payload = {
      ...formData,
      price: Number(formData.price),
      stock: Number(formData.stock),
      images: [formData.image, formData.hoverImage].filter(Boolean)
    }

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setSuccessMsg(isEdit ? 'Product updated successfully.' : 'Product created successfully.')
        setShowProductModal(false)
        fetchProducts()
        setTimeout(() => setSuccessMsg(null), 3000)
      } else {
        setErrorMsg(data.message || 'Failed to save product.')
      }
    } catch (err) {
      console.error('Error saving product:', err)
      setErrorMsg('Error communicating with database.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (prod) => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return

    const prodId = prod._id || prod.id
    const newStatus = !prod.isActive
    const confirmText = newStatus
      ? `Reactivate product "${prod.name}"?`
      : `Deactivate product "${prod.name}"? (It will be hidden from public catalog)`

    if (!window.confirm(confirmText)) return

    try {
      const res = await fetch(`${API_BASE}/admin/products/${prodId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: newStatus })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setSuccessMsg(`Product "${prod.name}" ${newStatus ? 'activated' : 'deactivated'} successfully.`)
        fetchProducts()
        setTimeout(() => setSuccessMsg(null), 3000)
      } else {
        setErrorMsg(data.message || 'Failed to update product status.')
      }
    } catch (err) {
      console.error('Error toggling product status:', err)
      setErrorMsg('Error communicating with server.')
    }
  }

  const handlePermanentDelete = async (prod) => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) return
    const prodId = prod._id || prod.id

    if (!window.confirm(`PERMANENT DELETE: Are you sure you want to permanently delete "${prod.name}"? This action cannot be undone.`)) return

    try {
      const res = await fetch(`${API_BASE}/admin/products/${prodId}?permanent=true`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setSuccessMsg(`Product "${prod.name}" permanently deleted from database.`)
        fetchProducts()
        setTimeout(() => setSuccessMsg(null), 3000)
      } else {
        setErrorMsg(data.message || 'Failed to delete product.')
      }
    } catch (err) {
      console.error('Error deleting product:', err)
      setErrorMsg('Error deleting product from database.')
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-8 max-w-7xl mx-auto">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#262931] pb-5">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-[#8c9472] block">
              STOREFRONT PRODUCT CATALOG & INVENTORY MANAGEMENT
            </span>
            <h1 className="font-serif text-3xl font-light text-white">
              Product Management Catalog
            </h1>
          </div>

          <button
            type="button"
            onClick={openAddModal}
            className="self-start sm:self-auto flex items-center gap-2 bg-[#8c9472] text-[#0f1012] text-xs font-mono uppercase font-bold tracking-wider px-5 py-2.5 hover:bg-white transition-colors cursor-pointer"
          >
            <Plus size={16} />
            <span>Create New Product</span>
          </button>
        </div>

        {/* Feedback Banners */}
        {successMsg && (
          <div className="p-3 bg-[#172d17] border border-[#2d5e2d] text-green-300 text-xs font-mono rounded-xs flex items-center gap-2">
            <Check size={14} />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="p-3 bg-[#2d1515] border border-[#5c2424] text-red-300 text-xs font-mono rounded-xs">
            {errorMsg}
          </div>
        )}

        {/* SEARCH & FILTERS BAR */}
        <div className="bg-[#16181d] border border-[#262931] p-4 rounded-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <form onSubmit={(e) => { e.preventDefault(); setPage(1); fetchProducts(); }} className="flex-1 flex items-center gap-2 w-full">
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products by Name, SKU, Description..."
                className="w-full bg-[#0f1012] border border-[#262931] p-2.5 pl-9 text-xs font-mono text-white placeholder-[#505462] focus:outline-none focus:border-[#8c9472]"
              />
              <Search size={14} className="absolute left-3 top-3.5 text-[#505462]" />
            </div>
            <button
              type="submit"
              className="bg-[#222630] border border-[#343845] text-white text-xs font-mono uppercase px-4 py-2.5 hover:bg-[#8c9472] transition-colors cursor-pointer"
            >
              Search
            </button>
          </form>

          {/* Category & Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {['all', 'Ready to Wear', 'Couture', 'Formals', 'Unstitched'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => { setCategoryFilter(cat); setPage(1); }}
                className={`px-3 py-1.5 text-[10px] font-mono uppercase rounded-xs border transition-colors cursor-pointer ${
                  categoryFilter === cat ? 'bg-[#8c9472] text-[#0f1012] font-bold border-[#8c9472]' : 'bg-[#0f1012] text-[#8a8e98] border-[#262931]'
                }`}
              >
                {cat}
              </button>
            ))}

            <div className="h-4 w-[1px] bg-[#262931] hidden sm:block mx-1" />

            {['all', 'active', 'deactivated'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => { setStatusFilter(st); setPage(1); }}
                className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded-xs border transition-colors cursor-pointer ${
                  statusFilter === st ? 'bg-amber-700 text-white font-bold border-amber-500' : 'bg-[#0f1012] text-[#8a8e98] border-[#262931]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* PRODUCTS GRID */}
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-[#8c9472] border-t-transparent rounded-full animate-spin mx-auto" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#8a8e98] block">Fetching product catalog from database...</span>
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((prod) => {
              const mainImg = prod.images?.[0] || prod.image || 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=800&q=85'
              const isActive = prod.isActive !== false
              return (
                <div key={prod._id || prod.id} className={`bg-[#16181d] border rounded-sm overflow-hidden flex flex-col justify-between group transition-all ${
                  isActive ? 'border-[#262931]' : 'border-red-900/50 bg-[#161416]'
                }`}>
                  <div>
                    <div className="relative aspect-[3/4] bg-[#0f1012] overflow-hidden">
                      <img src={mainImg} alt={prod.name} className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${!isActive ? 'grayscale opacity-60' : ''}`} />
                      
                      {/* Category Badge */}
                      <div className="absolute top-2 left-2 bg-[#0f1012]/80 backdrop-blur-xs px-2 py-0.5 text-[9px] font-mono text-white uppercase tracking-widest border border-[#262931]">
                        {prod.category}
                      </div>
                      
                      {/* Active Status Badge */}
                      <div className={`absolute top-2 right-2 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest border ${
                        isActive
                          ? 'bg-green-950/90 text-green-300 border-green-800'
                          : 'bg-red-950/90 text-red-300 border-red-800'
                      }`}>
                        {isActive ? 'ACTIVE' : 'DEACTIVATED'}
                      </div>

                      {/* Stock Badge */}
                      <div className="absolute bottom-2 left-2 bg-[#0f1012]/90 px-2 py-0.5 text-[9px] font-mono text-[#8c9472] uppercase border border-[#262931]">
                        {prod.stock === 0 ? 'OUT OF STOCK' : `STOCK: ${prod.stock}`}
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      <span className="text-[9px] font-mono text-[#8a8e98] block uppercase">SKU: {prod.sku}</span>
                      <h3 className="font-serif text-lg font-normal text-white leading-snug">{prod.name}</h3>
                      <span className="font-serif text-base text-[#8c9472] block">PKR {(prod.price || 0).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* ACTION CONTROLS: EDIT, TOGGLE STATUS, PERMANENT DELETE */}
                  <div className="p-3 border-t border-[#262931] mt-3 grid grid-cols-3 gap-2 bg-[#121317]">
                    <button
                      type="button"
                      onClick={() => openEditModal(prod)}
                      className="col-span-1 flex items-center justify-center gap-1 bg-[#222630] border border-[#343845] text-white text-[10px] font-mono uppercase tracking-wider py-1.5 hover:bg-[#8c9472] hover:text-[#0f1012] transition-colors cursor-pointer"
                      title="Edit Product Details"
                    >
                      <Edit size={11} />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleStatus(prod)}
                      className={`col-span-1 flex items-center justify-center gap-1 border text-[10px] font-mono uppercase tracking-wider py-1.5 transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-amber-950/60 border-amber-800 text-amber-300 hover:bg-amber-900'
                          : 'bg-green-950/60 border-green-800 text-green-300 hover:bg-green-900'
                      }`}
                      title={isActive ? 'Deactivate Product' : 'Activate Product'}
                    >
                      <Power size={11} />
                      <span>{isActive ? 'Deactivate' : 'Activate'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePermanentDelete(prod)}
                      className="col-span-1 flex items-center justify-center gap-1 bg-red-950/60 border border-red-900 text-red-300 text-[10px] font-mono uppercase tracking-wider py-1.5 hover:bg-red-900 transition-colors cursor-pointer"
                      title="Permanently Delete Product"
                    >
                      <Trash2 size={11} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="py-16 text-center space-y-3 bg-[#16181d] border border-[#262931] p-8">
            <Package size={36} className="mx-auto text-[#505462]" />
            <h4 className="font-serif text-2xl text-white font-light">NO PRODUCTS MATCHING FILTER</h4>
            <p className="text-xs font-mono text-[#8a8e98]">Try broadening your search term or category/status filters.</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border border-[#262931] bg-[#16181d] flex items-center justify-between text-xs font-mono text-[#8a8e98]">
            <span>Page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 bg-[#0f1012] border border-[#262931] disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 bg-[#0f1012] border border-[#262931] disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* PRODUCT FORM MODAL */}
        {showProductModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
            <div className="bg-[#16181d] border border-[#262931] rounded-sm max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl text-xs font-mono">
              
              <div className="p-6 border-b border-[#262931] flex items-center justify-between bg-[#121317]">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-[#8c9472] block">Catalog Record</span>
                  <h3 className="font-serif text-2xl text-white font-light">
                    {editingProduct ? 'Edit Storefront Product' : 'Create New Database Product'}
                  </h3>
                </div>
                <button type="button" onClick={() => setShowProductModal(false)} className="text-[#8a8e98] hover:text-white p-1 cursor-pointer">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleFormSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-[#8a8e98] uppercase mb-1">Product Title *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-[#0f1012] border border-[#262931] p-2.5 text-xs text-white focus:outline-none focus:border-[#8c9472]"
                      placeholder="e.g. Ivory Bloom"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-[#8a8e98] uppercase mb-1">SKU *</label>
                    <input
                      type="text"
                      required
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      className="w-full bg-[#0f1012] border border-[#262931] p-2.5 text-xs text-white focus:outline-none focus:border-[#8c9472]"
                      placeholder="e.g. ZHZ-IVORY-01"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] text-[#8a8e98] uppercase mb-1">Category *</label>
                    <input
                      type="text"
                      required
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full bg-[#0f1012] border border-[#262931] p-2.5 text-xs text-white focus:outline-none focus:border-[#8c9472]"
                      placeholder="Ready to Wear"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-[#8a8e98] uppercase mb-1">Price (PKR) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full bg-[#0f1012] border border-[#262931] p-2.5 text-xs text-white focus:outline-none focus:border-[#8c9472]"
                      placeholder="18900"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-[#8a8e98] uppercase mb-1">Database Stock *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                      className="w-full bg-[#0f1012] border border-[#262931] p-2.5 text-xs text-white focus:outline-none focus:border-[#8c9472]"
                      placeholder="8"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-[#8a8e98] uppercase mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-[#0f1012] border border-[#262931] p-2.5 text-xs text-white focus:outline-none focus:border-[#8c9472]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-[#8a8e98] uppercase mb-1">Primary Image URL</label>
                    <input
                      type="text"
                      value={formData.image}
                      onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                      className="w-full bg-[#0f1012] border border-[#262931] p-2.5 text-xs text-white focus:outline-none focus:border-[#8c9472]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-[#8a8e98] uppercase mb-1">Hover Image URL</label>
                    <input
                      type="text"
                      value={formData.hoverImage}
                      onChange={(e) => setFormData({ ...formData, hoverImage: e.target.value })}
                      className="w-full bg-[#0f1012] border border-[#262931] p-2.5 text-xs text-white focus:outline-none focus:border-[#8c9472]"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-[#262931] flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowProductModal(false)}
                    className="bg-[#222630] border border-[#343845] text-white px-4 py-2 hover:bg-[#3c4254] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-[#8c9472] text-[#0f1012] font-bold px-6 py-2 hover:bg-white cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'SAVING...' : 'SAVE PRODUCT TO DATABASE'}
                  </button>
                </div>
              </form>

            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  )
}
