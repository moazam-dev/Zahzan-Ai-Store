'use client'

import { useState, useEffect, useRef } from 'react'
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
  RefreshCw,
  Upload
} from 'lucide-react'
import AdminLayout from './AdminLayout'
import { parseModelInfo } from '../../lib/productFields'
import { categories } from '../../data/categories'

const API_BASE = '/api'

// The exact class strings the product modal already used, lifted to constants
// so the expanded form stays visually identical to the rest of the admin panel
// without repeating them across forty-odd inputs.
const INPUT_CLASS =
  'w-full bg-[#0f1012] border border-[#262931] p-2.5 text-xs text-white focus:outline-none focus:border-[#8c9472]'
const LABEL_CLASS = 'block text-[10px] text-[#8a8e98] uppercase mb-1'
const SECTION_TITLE_CLASS =
  'block text-[10px] font-mono uppercase tracking-[0.25em] text-[#8c9472] border-b border-[#262931] pb-2 mb-3'
const ADD_ROW_CLASS =
  'mt-2 text-[10px] uppercase tracking-wider text-[#8c9472] border border-[#343845] px-3 py-2 hover:bg-[#222630] cursor-pointer'
const REMOVE_ROW_CLASS =
  'w-9 py-2 text-xs text-white bg-[#222630] border border-[#343845] hover:bg-[#5c2b2b] cursor-pointer shrink-0'
// Column captions for the repeatable rows. Each row is several unlabelled
// inputs in a line, which is ambiguous without these -- the first product
// edited after this form shipped had its hex changed and its NAME left as the
// old value, because there was nothing saying which box was which.
const ROW_HEADER_CLASS = 'text-[10px] text-[#8a8e98] uppercase tracking-wider'

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
  //
  // Every field the customer Product Page renders is editable here -- that is
  // the whole point of the Product Management Expansion (2026-08-20). Nothing
  // product-specific is defaulted: a value the admin has not typed is stored
  // empty and rendered as a blank on the product page, never as an invented
  // placeholder like 'Pure Silk'.
  const EMPTY_FORM = {
    // Basic information
    name: '',
    sku: '',
    slug: '',
    category: '',
    price: '',
    originalPrice: '',
    badge: '',
    description: '',
    quickDescription: '',
    // Fabric & work -- the FABRIC and WORK cells on the product page
    fabric: '',
    work: '',
    // Colours -- the product page's COLOR cell and its colour selector.
    // `image` is optional and preserved for products that already carry one.
    colors: [{ name: '', hex: '', image: '' }],
    // Size & stock. Each row is one size and its own inventory; the product
    // page's size selector renders exactly these sizes and disables any whose
    // stock is 0. Product-level `stock` is derived from the sum.
    sizeRows: [{ size: '', stock: '' }],
    // Fallback total, used only for a product with no size rows at all.
    stock: '',
    // Product details -- the SHIRT / TROUSER / DUPATTA trio
    breakdownShirt: '',
    breakdownTrouser: '',
    breakdownDupatta: '',
    // Model details -- composed into the page's single SIZE & FIT line
    modelHeight: '',
    modelSize: '',
    fitNote: '',
    // Care instructions -- the bulleted list on the product page
    careInstructions: [''],
    // Ordered gallery. images[0] is the card/primary image and images[1] is
    // the card hover image -- both API routes re-derive the product's `image`
    // and `hover_image` columns from these two positions, and the product
    // page renders the whole array as its gallery. Starts with two empty
    // slots so the form always shows the primary/hover pair.
    images: ['', '']
  }

  const [formData, setFormData] = useState(EMPTY_FORM)

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
    // Only the SKU is pre-filled, because it must be unique and is a machine
    // identifier rather than a product fact. Every other field starts blank:
    // the previous placeholder price, description, fabric, work, colour and
    // stock photos were invented product data that shipped to customers
    // verbatim whenever an admin did not overwrite them.
    const randomSku = `ZHZ-PROD-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 100)}`
    setFormData({ ...EMPTY_FORM, sku: randomSku })
    setShowProductModal(true)
  }

  const openEditModal = (prod) => {
    setEditingProduct(prod)

    // Per-size inventory, if this product has any. A product that predates the
    // size_stock column (or has had it cleared) opens with its size list and
    // blank stock cells, so the admin can fill them in without losing the
    // sizes the product already sells.
    const storedSizeStock =
      prod.sizeStock && typeof prod.sizeStock === 'object' ? prod.sizeStock : {}
    const sizeStockKeys = Object.keys(storedSizeStock)

    const sizeRows = sizeStockKeys.length
      ? sizeStockKeys.map((size) => ({ size, stock: String(storedSizeStock[size]) }))
      : (prod.sizes || []).map((size) => ({ size, stock: '' }))

    // modelHeight/modelSize are the structured inputs behind the page's single
    // "Model Height: ... | Model wears: ..." line. Products created before
    // those columns existed only have the composed line, so it is parsed back
    // into its two parts on a best-effort basis -- see parseModelInfo.
    const parsedModel = parseModelInfo(prod.modelInfo)

    setFormData({
      ...EMPTY_FORM,
      name: prod.name || '',
      sku: prod.sku || '',
      slug: prod.slug || '',
      category: prod.category || '',
      price: prod.price !== undefined ? String(prod.price) : '',
      originalPrice: prod.originalPrice !== undefined ? String(prod.originalPrice) : '',
      badge: prod.badge || '',
      description: prod.description || '',
      quickDescription: prod.quickDescription || '',
      fabric: prod.fabric || '',
      work: prod.work || '',
      colors: prod.colors?.length
        ? prod.colors.map((c) => ({
            name: c?.name || '',
            hex: c?.hex || '',
            image: c?.image || ''
          }))
        : prod.color
          ? [{ name: prod.color, hex: '', image: '' }]
          : [{ name: '', hex: '', image: '' }],
      sizeRows: sizeRows.length ? sizeRows : [{ size: '', stock: '' }],
      stock: prod.stock !== undefined ? String(prod.stock) : '',
      breakdownShirt: prod.breakdown?.shirt || '',
      breakdownTrouser: prod.breakdown?.trouser || '',
      breakdownDupatta: prod.breakdown?.dupatta || '',
      modelHeight: prod.modelHeight || parsedModel.height,
      modelSize: prod.modelSize || parsedModel.size,
      fitNote: prod.fitNote || '',
      careInstructions: prod.careInstructions?.length ? [...prod.careInstructions] : [''],
      // Load the FULL stored gallery, not just the first two entries -- this
      // previously sliced to [0] and [1], so editing any product silently
      // discarded its third image onward on save.
      images: prod.images?.length
        ? [...prod.images]
        : [prod.image || '', prod.hoverImage || '']
    })
    setShowProductModal(true)
  }

  // --- Repeatable row editors ----------------------------------------------
  // Colours, size/stock pairs and care instructions are all "add a row, fill
  // it, remove it" lists. Each keeps at least one row on screen so there is
  // always something to type into; a row left blank is dropped at submit time
  // rather than stored as an empty value.

  const updateRow = (field, index, patch) => {
    setFormData((prev) => {
      const rows = [...prev[field]]
      rows[index] = typeof patch === 'object' ? { ...rows[index], ...patch } : patch
      return { ...prev, [field]: rows }
    })
  }

  const addRow = (field, blank) => {
    setFormData((prev) => ({ ...prev, [field]: [...prev[field], blank] }))
  }

  const removeRow = (field, index, blank) => {
    setFormData((prev) => {
      const rows = prev[field].filter((_, i) => i !== index)
      return { ...prev, [field]: rows.length ? rows : [blank] }
    })
  }

  // Product-level stock is the sum of the per-size rows whenever any size has
  // been given a stock number, which is exactly what the backend stores. Shown
  // read-only so the admin can see the two agree.
  const filledSizeRows = formData.sizeRows.filter((row) => row.size.trim() !== '')
  const isSizeTrackedForm = filledSizeRows.length > 0
  const derivedTotalStock = filledSizeRows.reduce(
    (total, row) => total + (Number(row.stock) || 0),
    0
  )

  // --- Image upload --------------------------------------------------------
  // Files go to Supabase Storage's public `product-images` bucket via
  // POST /api/admin/products/upload, which hands back a stable public URL.
  // That URL is what lands in the gallery row -- the form still stores URLs,
  // so a hand-pasted external URL keeps working exactly as before.

  const [uploading, setUploading] = useState(null) // row index, 'new', or null
  const rowFileInputs = useRef({})
  const newFilesInput = useRef(null)

  const uploadImageFile = async (file) => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) throw new Error('Not signed in')

    const body = new FormData()
    body.append('image', file)

    const res = await fetch(`${API_BASE}/admin/products/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      throw new Error(data.message || data.error || 'Upload failed')
    }
    return data.url
  }

  const handleRowFile = async (index, file) => {
    if (!file) return
    setUploading(index)
    setErrorMsg(null)
    try {
      const url = await uploadImageFile(file)
      updateImageAt(index, url)
    } catch (error) {
      setErrorMsg(error.message)
    } finally {
      setUploading(null)
      if (rowFileInputs.current[index]) rowFileInputs.current[index].value = ''
    }
  }

  // Multi-select append: each file becomes its own gallery row, in the order
  // the operator picked them.
  const handleNewFiles = async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setUploading('new')
    setErrorMsg(null)
    try {
      for (const file of files) {
        const url = await uploadImageFile(file)
        setFormData((prev) => {
          const images = [...prev.images]
          const blank = images.findIndex((entry) => !entry.trim())
          if (blank === -1) images.push(url)
          else images[blank] = url
          return { ...prev, images }
        })
      }
    } catch (error) {
      setErrorMsg(error.message)
    } finally {
      setUploading(null)
      if (newFilesInput.current) newFilesInput.current.value = ''
    }
  }

  // --- Gallery row editing -------------------------------------------------
  // Position carries meaning here (0 = primary, 1 = hover, all = gallery
  // order on the product page), so reordering is a real operation, not a
  // cosmetic one.

  const updateImageAt = (index, value) => {
    setFormData((prev) => {
      const images = [...prev.images]
      images[index] = value
      return { ...prev, images }
    })
  }

  const addImageRow = () => {
    setFormData((prev) => ({ ...prev, images: [...prev.images, ''] }))
  }

  const removeImageAt = (index) => {
    setFormData((prev) => {
      const images = prev.images.filter((_, i) => i !== index)
      // Never collapse below the primary/hover pair, so those two labelled
      // slots are always present to type into.
      while (images.length < 2) images.push('')
      return { ...prev, images }
    })
  }

  const moveImage = (index, direction) => {
    setFormData((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.images.length) return prev
      const images = [...prev.images]
      ;[images[index], images[target]] = [images[target], images[index]]
      return { ...prev, images }
    })
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

    // Blank rows are the admin's "I added a row and changed my mind", not
    // data, so they are dropped here rather than stored as empty values.
    const colors = formData.colors
      .filter((c) => c.name.trim() !== '')
      .map((c) => ({
        name: c.name.trim(),
        // An unset hex stays unset. The product page renders such a colour as
        // a named chip rather than inventing a swatch colour for it.
        hex: c.hex.trim() || null,
        ...(c.image.trim() ? { image: c.image.trim() } : {})
      }))

    const careInstructions = formData.careInstructions
      .map((line) => line.trim())
      .filter(Boolean)

    // Per-size inventory as the `{ size: count }` map the API stores. Sent as
    // `{}` when no size row was filled in, which turns size tracking off and
    // hands authority back to the product-level total below.
    const sizeStock = {}
    for (const row of formData.sizeRows) {
      const size = row.size.trim()
      if (size === '') continue
      sizeStock[size] = Number(row.stock) || 0
    }

    const payload = {
      name: formData.name,
      sku: formData.sku,
      category: formData.category,
      description: formData.description,
      quickDescription: formData.quickDescription,
      price: Number(formData.price),
      // Optional numerics are omitted rather than sent as NaN when left blank.
      ...(formData.originalPrice.trim() !== ''
        ? { originalPrice: Number(formData.originalPrice) }
        : { originalPrice: null }),
      ...(formData.slug.trim() !== '' ? { slug: formData.slug.trim() } : {}),
      badge: formData.badge,
      fabric: formData.fabric,
      work: formData.work,
      colors,
      // The single `color` column still backs the product page's COLOR cell
      // for anything that reads it directly, so it tracks the first colour.
      color: colors[0]?.name || '',
      sizeStock,
      // Only meaningful when sizeStock is empty; the API ignores it otherwise
      // and derives the total from the per-size counts instead.
      stock: isSizeTrackedForm ? derivedTotalStock : Number(formData.stock),
      breakdown: {
        shirt: formData.breakdownShirt,
        trouser: formData.breakdownTrouser,
        dupatta: formData.breakdownDupatta
      },
      modelHeight: formData.modelHeight,
      modelSize: formData.modelSize,
      fitNote: formData.fitNote,
      careInstructions,
      // Both routes derive image/hover_image from images[0]/images[1], so no
      // separate image or hoverImage key is sent.
      images: formData.images.map((url) => url.trim()).filter(Boolean)
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
            {['all', ...categories.map((c) => c.name)].map((cat) => (
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
              // No stock-photo fallback: a product with no image reads as one,
              // rather than borrowing a photograph of a different garment.
              const mainImg = prod.images?.[0] || prod.image || ''
              const isActive = prod.isActive !== false
              return (
                <div key={prod._id || prod.id} className={`bg-[#16181d] border rounded-sm overflow-hidden flex flex-col justify-between group transition-all ${
                  isActive ? 'border-[#262931]' : 'border-red-900/50 bg-[#161416]'
                }`}>
                  <div>
                    <div className="relative aspect-[3/4] bg-[#0f1012] overflow-hidden">
                      {mainImg ? (
                        <img src={mainImg} alt={prod.name} className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${!isActive ? 'grayscale opacity-60' : ''}`} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[9px] font-mono uppercase tracking-widest text-[#6b6f7a]">
                          No image
                        </div>
                      )}
                      
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
            {/* Widened from max-w-2xl: the form now carries the whole product
                record (colours, per-size stock, product/model details), and
                those repeatable rows need the width to stay readable. Same
                surface, border, radius and type as before. */}
            <div className="bg-[#16181d] border border-[#262931] rounded-sm max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl text-xs font-mono">
              
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

              <form onSubmit={handleFormSubmit} className="p-6 overflow-y-auto space-y-8 flex-1">

                {/* ============================================================ */}
                {/* BASIC INFORMATION */}
                {/* ============================================================ */}
                <section>
                  <span className={SECTION_TITLE_CLASS}>Basic Information</span>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={LABEL_CLASS}>Product Title *</label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className={INPUT_CLASS}
                          placeholder="e.g. Ivory Bloom"
                        />
                      </div>

                      <div>
                        <label className={LABEL_CLASS}>SKU *</label>
                        <input
                          type="text"
                          required
                          value={formData.sku}
                          onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                          className={INPUT_CLASS}
                          placeholder="e.g. ZHZ-IVORY-01"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={LABEL_CLASS}>Category *</label>
                        <select
                          required
                          value={formData.category}
                          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                          className={INPUT_CLASS}
                        >
                          <option value="" disabled>Select a category</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.name}>{c.name}</option>
                          ))}
                          {/* A product saved under an older category keeps it
                              visible here until the admin picks a new one. */}
                          {formData.category && !categories.some((c) => c.name === formData.category) && (
                            <option value={formData.category}>{formData.category}</option>
                          )}
                        </select>
                      </div>

                      <div>
                        <label className={LABEL_CLASS}>
                          Slug <span className="text-[#6b6f7a] normal-case">(optional — generated from name + SKU)</span>
                        </label>
                        <input
                          type="text"
                          value={formData.slug}
                          onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                          className={INPUT_CLASS}
                          placeholder="ivory-bloom"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className={LABEL_CLASS}>Price (PKR) *</label>
                        <input
                          type="number"
                          required
                          min="0"
                          value={formData.price}
                          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                          className={INPUT_CLASS}
                          placeholder="18900"
                        />
                      </div>

                      <div>
                        <label className={LABEL_CLASS}>Was Price (PKR)</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.originalPrice}
                          onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value })}
                          className={INPUT_CLASS}
                          placeholder="Leave blank if not on sale"
                        />
                        {/* The old label said "Compare-at Price", which is
                            Shopify's term for this and meant nothing here.
                            Showing the actual rendered result removes the
                            guesswork about what the number does. */}
                        <p className="mt-1 text-[10px] text-[#6b6f7a] normal-case">
                          {formData.originalPrice.trim() && Number(formData.originalPrice) > 0 ? (
                            <>
                              Product page shows{' '}
                              <span className="text-[#8c9472]">
                                PKR {(Number(formData.price) || 0).toLocaleString()}
                              </span>{' '}
                              <span className="line-through">
                                PKR {Number(formData.originalPrice).toLocaleString()}
                              </span>
                            </>
                          ) : (
                            'The struck-through original price. Blank = no sale price shown.'
                          )}
                        </p>
                      </div>

                      <div>
                        <label className={LABEL_CLASS}>Badge</label>
                        <input
                          type="text"
                          value={formData.badge}
                          onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                          className={INPUT_CLASS}
                          placeholder="e.g. NEW"
                        />
                      </div>
                    </div>

                    <div>
                      <label className={LABEL_CLASS}>
                        Short Description <span className="text-[#6b6f7a] normal-case">(the 2–3 lines under the price)</span>
                      </label>
                      <textarea
                        rows={2}
                        value={formData.quickDescription}
                        onChange={(e) => setFormData({ ...formData, quickDescription: e.target.value })}
                        className={INPUT_CLASS}
                      />
                    </div>

                    <div>
                      <label className={LABEL_CLASS}>Description</label>
                      <textarea
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>
                </section>

                {/* ============================================================ */}
                {/* FABRIC & WORK -- the product page's FABRIC and WORK cells */}
                {/* ============================================================ */}
                <section>
                  <span className={SECTION_TITLE_CLASS}>Fabric &amp; Work</span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={LABEL_CLASS}>Fabric</label>
                      <input
                        type="text"
                        value={formData.fabric}
                        onChange={(e) => setFormData({ ...formData, fabric: e.target.value })}
                        className={INPUT_CLASS}
                        placeholder="e.g. Pure Lawn"
                      />
                    </div>

                    <div>
                      <label className={LABEL_CLASS}>Work</label>
                      <input
                        type="text"
                        value={formData.work}
                        onChange={(e) => setFormData({ ...formData, work: e.target.value })}
                        className={INPUT_CLASS}
                        placeholder="e.g. Tonal Needlework"
                      />
                    </div>
                  </div>
                </section>

                {/* ============================================================ */}
                {/* COLORS -- exactly the colours this product is sold in */}
                {/* ============================================================ */}
                <section>
                  <div className="flex items-center justify-between border-b border-[#262931] pb-2 mb-3">
                    <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#8c9472]">Colors</span>
                    <span className="text-[10px] text-[#6b6f7a]">
                      Only these appear on the product page · hex is optional
                    </span>
                  </div>

                  {/* Column captions -- widths mirror the inputs below. */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-9 shrink-0" />
                    <span className={`flex-1 ${ROW_HEADER_CLASS}`}>Color Name *</span>
                    <span className={`w-28 shrink-0 ${ROW_HEADER_CLASS}`}>Hex Code</span>
                    <span className={`w-40 shrink-0 ${ROW_HEADER_CLASS}`}>Image URL</span>
                    <span className="w-9 shrink-0" />
                  </div>

                  <div className="space-y-2">
                    {formData.colors.map((colorRow, index) => (
                      <div key={index} className="flex items-center gap-2">
                        {/* Live preview of the swatch the customer will see. */}
                        {colorRow.hex.trim() ? (
                          <span
                            className="w-9 h-9 shrink-0 border border-[#262931]"
                            style={{ backgroundColor: colorRow.hex }}
                          />
                        ) : (
                          <span className="w-9 h-9 shrink-0 border border-dashed border-[#262931] bg-[#0f1012]" />
                        )}

                        <input
                          type="text"
                          value={colorRow.name}
                          onChange={(e) => updateRow('colors', index, { name: e.target.value })}
                          className={`${INPUT_CLASS} flex-1`}
                          placeholder="Color name — e.g. Olive Green"
                        />

                        <input
                          type="text"
                          value={colorRow.hex}
                          onChange={(e) => updateRow('colors', index, { hex: e.target.value })}
                          className={`${INPUT_CLASS} w-28 shrink-0`}
                          placeholder="#556B2F"
                        />

                        <input
                          type="text"
                          value={colorRow.image}
                          onChange={(e) => updateRow('colors', index, { image: e.target.value })}
                          className={`${INPUT_CLASS} w-40 shrink-0`}
                          placeholder="Optional"
                        />

                        <button
                          type="button"
                          onClick={() => removeRow('colors', index, { name: '', hex: '', image: '' })}
                          title="Remove color"
                          className={REMOVE_ROW_CLASS}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => addRow('colors', { name: '', hex: '', image: '' })}
                    className={ADD_ROW_CLASS}
                  >
                    + Add Color
                  </button>
                </section>

                {/* ============================================================ */}
                {/* SIZE & STOCK -- per-size inventory */}
                {/* ============================================================ */}
                <section>
                  <div className="flex items-center justify-between border-b border-[#262931] pb-2 mb-3">
                    <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#8c9472]">Size &amp; Stock</span>
                    <span className="text-[10px] text-[#6b6f7a]">
                      A size with 0 stock shows as sold out and cannot be ordered
                    </span>
                  </div>

                  {/* Column captions -- widths mirror the inputs below. */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-32 shrink-0 ${ROW_HEADER_CLASS}`}>Size</span>
                    <span className={`flex-1 ${ROW_HEADER_CLASS}`}>Stock for this size</span>
                    <span className="w-9 shrink-0" />
                  </div>

                  <div className="space-y-2">
                    {formData.sizeRows.map((sizeRow, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={sizeRow.size}
                          onChange={(e) => updateRow('sizeRows', index, { size: e.target.value })}
                          className={`${INPUT_CLASS} w-32 shrink-0`}
                          placeholder="e.g. M"
                        />

                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={sizeRow.stock}
                          onChange={(e) => updateRow('sizeRows', index, { stock: e.target.value })}
                          className={`${INPUT_CLASS} flex-1`}
                          placeholder="0"
                        />

                        <button
                          type="button"
                          onClick={() => removeRow('sizeRows', index, { size: '', stock: '' })}
                          title="Remove size"
                          className={REMOVE_ROW_CLASS}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 mt-2">
                    <button
                      type="button"
                      onClick={() => addRow('sizeRows', { size: '', stock: '' })}
                      className={ADD_ROW_CLASS}
                    >
                      + Add Size
                    </button>
                  </div>

                  {/* Total stock. Derived and read-only once any size row is
                      filled in, because the backend stores the sum -- an
                      editable field here would just disagree with it. */}
                  <div className="mt-4 max-w-xs">
                    <label className={LABEL_CLASS}>
                      Total Stock {isSizeTrackedForm ? '(sum of sizes above)' : '*'}
                    </label>
                    {isSizeTrackedForm ? (
                      <div className={`${INPUT_CLASS} text-[#8c9472]`}>{derivedTotalStock}</div>
                    ) : (
                      <input
                        type="number"
                        required
                        min="0"
                        value={formData.stock}
                        onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                        className={INPUT_CLASS}
                        placeholder="8"
                      />
                    )}
                  </div>
                </section>

                {/* ============================================================ */}
                {/* PRODUCT DETAILS -- the SHIRT / TROUSER / DUPATTA trio */}
                {/* ============================================================ */}
                <section>
                  <span className={SECTION_TITLE_CLASS}>Product Details</span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className={LABEL_CLASS}>Shirt</label>
                      <textarea
                        rows={3}
                        value={formData.breakdownShirt}
                        onChange={(e) => setFormData({ ...formData, breakdownShirt: e.target.value })}
                        className={INPUT_CLASS}
                      />
                    </div>

                    <div>
                      <label className={LABEL_CLASS}>Trouser</label>
                      <textarea
                        rows={3}
                        value={formData.breakdownTrouser}
                        onChange={(e) => setFormData({ ...formData, breakdownTrouser: e.target.value })}
                        className={INPUT_CLASS}
                      />
                    </div>

                    <div>
                      <label className={LABEL_CLASS}>Dupatta</label>
                      <textarea
                        rows={3}
                        value={formData.breakdownDupatta}
                        onChange={(e) => setFormData({ ...formData, breakdownDupatta: e.target.value })}
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>
                </section>

                {/* ============================================================ */}
                {/* MODEL DETAILS -- composed into the page's SIZE & FIT line */}
                {/* ============================================================ */}
                <section>
                  <span className={SECTION_TITLE_CLASS}>Model Details</span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={LABEL_CLASS}>Model Height</label>
                      <input
                        type="text"
                        value={formData.modelHeight}
                        onChange={(e) => setFormData({ ...formData, modelHeight: e.target.value })}
                        className={INPUT_CLASS}
                        placeholder={`e.g. 5'8"`}
                      />
                    </div>

                    <div>
                      <label className={LABEL_CLASS}>Model Wears Size</label>
                      <input
                        type="text"
                        value={formData.modelSize}
                        onChange={(e) => setFormData({ ...formData, modelSize: e.target.value })}
                        className={INPUT_CLASS}
                        placeholder="e.g. S"
                      />
                    </div>
                  </div>

                  {/* Exactly what the product page will render, so the admin
                      can see the composed line before saving. */}
                  {(formData.modelHeight.trim() || formData.modelSize.trim()) && (
                    <p className="mt-2 text-[10px] text-[#6b6f7a]">
                      Product page will show:{' '}
                      <span className="text-[#8c9472]">
                        {[
                          formData.modelHeight.trim() ? `Model Height: ${formData.modelHeight.trim()}` : '',
                          formData.modelSize.trim() ? `Model wears: ${formData.modelSize.trim()}` : ''
                        ]
                          .filter(Boolean)
                          .join(' | ')}
                      </span>
                    </p>
                  )}

                  <div className="mt-4">
                    <label className={LABEL_CLASS}>
                      Fit Note <span className="text-[#6b6f7a] normal-case">(the line beneath the model details)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.fitNote}
                      onChange={(e) => setFormData({ ...formData, fitNote: e.target.value })}
                      className={INPUT_CLASS}
                      placeholder="e.g. Relaxed fluid fit tailored for standard Pakistani sizing."
                    />
                  </div>
                </section>

                {/* ============================================================ */}
                {/* CARE INSTRUCTIONS -- the bulleted list on the product page */}
                {/* ============================================================ */}
                <section>
                  <span className={SECTION_TITLE_CLASS}>Care Instructions</span>

                  <div className="space-y-2">
                    {formData.careInstructions.map((line, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="w-4 shrink-0 text-center text-[10px] text-[#6b6f7a]">•</span>
                        <input
                          type="text"
                          value={line}
                          onChange={(e) => updateRow('careInstructions', index, e.target.value)}
                          className={`${INPUT_CLASS} flex-1`}
                          placeholder="e.g. Dry clean recommended"
                        />
                        <button
                          type="button"
                          onClick={() => removeRow('careInstructions', index, '')}
                          title="Remove instruction"
                          className={REMOVE_ROW_CLASS}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => addRow('careInstructions', '')}
                    className={ADD_ROW_CLASS}
                  >
                    + Add Instruction
                  </button>
                </section>

                {/* ============================================================ */}
                {/* IMAGES -- unchanged gallery editor */}
                {/* ============================================================ */}
                <section>
                  <div className="flex items-center justify-between border-b border-[#262931] pb-2 mb-3">
                    <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#8c9472]">Images</span>
                    <span className="text-[10px] text-[#6b6f7a]">
                      First = primary · Second = hover · All shown in the product gallery
                    </span>
                  </div>

                  <div className="space-y-2">
                    {formData.images.map((url, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-[10px] uppercase text-[#8a8e98]">
                          {index === 0 ? 'Primary' : index === 1 ? 'Hover' : `Image ${index + 1}`}
                        </span>

                        {url.trim() ? (
                          <img
                            src={url}
                            alt=""
                            className="w-9 h-9 shrink-0 object-cover border border-[#262931] bg-[#0f1012]"
                            onError={(e) => {
                              e.currentTarget.style.visibility = 'hidden'
                            }}
                          />
                        ) : (
                          <span className="w-9 h-9 shrink-0 border border-dashed border-[#262931] bg-[#0f1012]" />
                        )}

                        <input
                          type="text"
                          value={url}
                          placeholder="Upload a file, or paste https://..."
                          onChange={(e) => updateImageAt(index, e.target.value)}
                          className="flex-1 bg-[#0f1012] border border-[#262931] p-2.5 text-xs text-white focus:outline-none focus:border-[#8c9472]"
                        />

                        <input
                          ref={(el) => { rowFileInputs.current[index] = el }}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => handleRowFile(index, e.target.files?.[0])}
                        />
                        <button
                          type="button"
                          onClick={() => rowFileInputs.current[index]?.click()}
                          disabled={uploading !== null}
                          title="Upload image file"
                          className="px-2 py-2 text-xs text-white bg-[#222630] border border-[#343845] hover:bg-[#3c4254] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {uploading === index ? <RefreshCw size={12} className="animate-spin" /> : <Upload size={12} />}
                        </button>

                        <button
                          type="button"
                          onClick={() => moveImage(index, -1)}
                          disabled={index === 0}
                          title="Move up"
                          className="px-2 py-2 text-xs text-white bg-[#222630] border border-[#343845] hover:bg-[#3c4254] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveImage(index, 1)}
                          disabled={index === formData.images.length - 1}
                          title="Move down"
                          className="px-2 py-2 text-xs text-white bg-[#222630] border border-[#343845] hover:bg-[#3c4254] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeImageAt(index)}
                          title="Remove"
                          className="px-2 py-2 text-xs text-white bg-[#222630] border border-[#343845] hover:bg-[#5c2b2b] cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  <input
                    ref={newFilesInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => handleNewFiles(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => newFilesInput.current?.click()}
                    disabled={uploading !== null}
                    className={`${ADD_ROW_CLASS} disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {uploading === 'new' ? 'Uploading…' : '↑ Upload Image Files'}
                  </button>

                  <button
                    type="button"
                    onClick={addImageRow}
                    className={ADD_ROW_CLASS}
                  >
                    + Add Image
                  </button>
                </section>

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
