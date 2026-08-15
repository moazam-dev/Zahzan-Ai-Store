'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { SlidersHorizontal, X } from 'lucide-react'
import AnnouncementBar from '../components/AnnouncementBar'
import Header from '../components/Header'
import Footer from '../components/Footer'
import ProductCard from '../components/ProductCard'
import { categories } from '../data/categories'

const API_BASE = '/api'

export default function Shop() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const categoryParam = searchParams.get('category')

  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  // Filter states
  const [selectedCategory, setSelectedCategory] = useState(categoryParam || 'All')
  const [selectedFabric, setSelectedFabric] = useState('All')
  const [selectedSize, setSelectedSize] = useState('All')
  const [maxPrice, setMaxPrice] = useState(30000)
  const [sortBy, setSortBy] = useState('featured') // 'featured' | 'newest' | 'price-asc' | 'price-desc'
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false)

  // Fetch products from backend API
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true)
        const res = await fetch(`${API_BASE}/products`)
        const data = await res.json()
        if (data.success && Array.isArray(data.products)) {
          setProducts(data.products)
        }
      } catch (err) {
        console.error('Failed to fetch products:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchProducts()
  }, [])

  // Sync category state if URL parameter changes
  useEffect(() => {
    if (categoryParam) {
      setSelectedCategory(categoryParam)
    }
  }, [categoryParam])

  // Derive unique fabrics and sizes from actual product data
  const fabricsList = useMemo(() => {
    const set = new Set()
    products.forEach((p) => {
      const desc = ((p.description || '') + ' ' + (p.fabric || '')).toLowerCase()
      if (desc.includes('lawn')) set.add('Lawn')
      if (desc.includes('cotton')) set.add('Cotton')
      if (desc.includes('silk') || desc.includes('handloom')) set.add('Silk')
      if (p.category === 'Unstitched') set.add('Handloom')
    })
    return ['All', ...Array.from(set)]
  }, [products])

  const sizesList = useMemo(() => {
    const set = new Set()
    products.forEach((p) => p.sizes?.forEach((s) => set.add(s)))
    return ['All', ...Array.from(set)]
  }, [products])

  const categoriesList = useMemo(() => {
    return ['All', ...categories.map((c) => c.name)]
  }, [])

  // Filter products dynamically
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // Category filter (case-insensitive check)
      if (selectedCategory !== 'All') {
        if (product.category.toLowerCase() !== selectedCategory.toLowerCase()) {
          return false
        }
      }
      // Fabric filter
      if (selectedFabric !== 'All') {
        const desc = (product.description || '').toLowerCase()
        const fab = selectedFabric.toLowerCase()
        if (!desc.includes(fab) && !(selectedFabric === 'Handloom' && product.category === 'Unstitched')) {
          return false
        }
      }
      // Size filter
      if (selectedSize !== 'All' && !product.sizes?.includes(selectedSize)) {
        return false
      }
      // Price filter
      if (product.price > maxPrice) {
        return false
      }
      return true
    })
  }, [products, selectedCategory, selectedFabric, selectedSize, maxPrice])

  // Sort products dynamically
  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts]
    if (sortBy === 'price-asc') {
      return list.sort((a, b) => a.price - b.price)
    }
    if (sortBy === 'price-desc') {
      return list.sort((a, b) => b.price - a.price)
    }
    if (sortBy === 'newest') {
      return list.sort((a, b) => (b.badge === 'NEW' ? 1 : -1))
    }
    return list
  }, [filteredProducts, sortBy])

  const hasActiveFilters = selectedCategory !== 'All' || selectedFabric !== 'All' || selectedSize !== 'All' || maxPrice < 30000

  const handleClearAll = () => {
    setSelectedCategory('All')
    setSelectedFabric('All')
    setSelectedSize('All')
    setMaxPrice(30000)
    setSortBy('featured')
    if (categoryParam) {
      router.push(pathname, { scroll: false })
    }
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] text-[#1c1b18]">
      <AnnouncementBar />
      <Header />

      {/* ========================================================================= */}
      {/* MAIN SHOP BROWSER: 20% LEFT FILTERS + 80% RIGHT PRODUCTS (DESKTOP) */}
      {/* ========================================================================= */}
      <main className="mx-auto max-w-[1440px] px-4 sm:px-8 lg:px-12 py-8">
        
        {/* MOBILE TOP CONTROLS: FILTER BUTTON & SORT */}
        <div className="lg:hidden flex items-center justify-between pb-6 mb-6 border-b border-[#e8e4dc]">
          <button
            type="button"
            onClick={() => setIsMobileFilterOpen(true)}
            className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] font-sans font-medium text-[#1c1b18] py-2 px-4 border border-[#1c1b18] rounded-xs cursor-pointer"
          >
            <SlidersHorizontal size={14} />
            <span>FILTER {hasActiveFilters && '•'}</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-sans uppercase tracking-widest text-[#5a5e4b]">SORT:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-xs font-sans text-[#1c1b18] uppercase tracking-wider focus:outline-none cursor-pointer"
            >
              <option value="featured">Featured</option>
              <option value="newest">Newest</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row items-start gap-10 lg:gap-14">
          
          {/* ========================================================================= */}
          {/* 20% DESKTOP LEFT FILTER PANEL */}
          {/* ========================================================================= */}
          <aside className="hidden lg:block w-[20%] min-w-[220px] max-w-[280px] sticky top-28 space-y-8 select-none">
            
            <div className="flex items-center justify-between pb-3 border-b border-[#e8e4dc]">
              <span className="text-[11px] font-sans font-medium uppercase tracking-[0.35em] text-[#1c1b18]">
                FILTERS
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[10px] font-sans uppercase tracking-wider text-[#5a5e4b] hover:text-[#1c1b18] underline transition-colors cursor-pointer"
                >
                  CLEAR ALL
                </button>
              )}
            </div>

            {/* FILTER GROUP 01: CATEGORY */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-[#5a5e4b] block mb-2">
                CATEGORY
              </span>
              {categoriesList.map((cat) => {
                const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase()
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat)
                      if (categoryParam) router.push(pathname, { scroll: false })
                    }}
                    className={`w-full flex items-center justify-between text-xs font-sans text-left transition-colors cursor-pointer ${
                      isSelected ? 'text-[#1c1b18] font-medium' : 'text-[#706c64] hover:text-[#1c1b18]'
                    }`}
                  >
                    <span>{cat}</span>
                    {isSelected && <span className="text-[#5a5e4b] text-xs">✓</span>}
                  </button>
                )
              })}
            </div>

            {/* FILTER GROUP 02: FABRIC */}
            <div className="space-y-2.5 pt-4 border-t border-[#e8e4dc]/70">
              <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-[#5a5e4b] block mb-2">
                FABRIC
              </span>
              {fabricsList.map((fab) => {
                const isSelected = selectedFabric === fab
                return (
                  <button
                    key={fab}
                    type="button"
                    onClick={() => setSelectedFabric(fab)}
                    className={`w-full flex items-center justify-between text-xs font-sans text-left transition-colors cursor-pointer ${
                      isSelected ? 'text-[#1c1b18] font-medium' : 'text-[#706c64] hover:text-[#1c1b18]'
                    }`}
                  >
                    <span>{fab}</span>
                    {isSelected && <span className="text-[#5a5e4b] text-xs">✓</span>}
                  </button>
                )
              })}
            </div>

            {/* FILTER GROUP 03: SIZE */}
            <div className="space-y-2.5 pt-4 border-t border-[#e8e4dc]/70">
              <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-[#5a5e4b] block mb-2">
                SIZE
              </span>
              <div className="flex flex-wrap gap-2 pt-1">
                {sizesList.map((sz) => {
                  const isSelected = selectedSize === sz
                  return (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setSelectedSize(sz)}
                      className={`px-3 py-1.5 text-[11px] font-sans uppercase tracking-wider transition-colors cursor-pointer border ${
                        isSelected
                          ? 'border-[#1c1b18] bg-[#1c1b18] text-[#faf8f5]'
                          : 'border-[#e8e4dc] bg-transparent text-[#706c64] hover:border-[#1c1b18] hover:text-[#1c1b18]'
                      }`}
                    >
                      {sz}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* FILTER GROUP 04: PRICE */}
            <div className="space-y-3 pt-4 border-t border-[#e8e4dc]/70">
              <div className="flex items-center justify-between text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-[#5a5e4b]">
                <span>MAX PRICE</span>
                <span className="text-[#1c1b18]">PKR {maxPrice.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min={15000}
                max={30000}
                step={1000}
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-full accent-[#1c1b18] cursor-pointer"
              />
            </div>

            {/* CLEAR ALL ACTION AT BOTTOM */}
            {hasActiveFilters && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="w-full py-2 border-b border-[#1c1b18] text-xs font-sans uppercase tracking-[0.25em] text-[#1c1b18] hover:text-[#5a5e4b] transition-colors cursor-pointer"
                >
                  CLEAR ALL FILTERS
                </button>
              </div>
            )}

          </aside>

          {/* ========================================================================= */}
          {/* 80% DESKTOP RIGHT PRODUCT AREA */}
          {/* ========================================================================= */}
          <section className="w-full lg:w-[80%] flex-1 space-y-6">
            
            {/* TOP BAR: DYNAMIC PIECE COUNT & DESKTOP SORT */}
            <div className="flex items-center justify-between pb-4 border-b border-[#e8e4dc]/70">
              <span className="text-[11px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b]">
                {sortedProducts.length} {sortedProducts.length === 1 ? 'PIECE' : 'PIECES'}
              </span>

              <div className="hidden lg:flex items-center gap-3">
                <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-[#5a5e4b]">
                  SORT BY:
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-transparent text-xs font-sans text-[#1c1b18] uppercase tracking-[0.2em] focus:outline-none cursor-pointer border-b border-[#1c1b18] pb-0.5"
                >
                  <option value="featured">Featured</option>
                  <option value="newest">Newest</option>
                  <option value="price-asc">Price — Low to High</option>
                  <option value="price-desc">Price — High to Low</option>
                </select>
              </div>
            </div>

            {/* EDITORIAL PRODUCT GRID (3 columns Desktop / 2 columns Mobile) */}
            {sortedProducts.length > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-8">
                {sortedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              
              /* NO MATCHING PRODUCTS STATE */
              <div className="py-20 text-center space-y-4">
                <h3 className="font-serif text-2xl text-[#1c1b18] font-light">NO PIECES MATCH YOUR SELECTION</h3>
                <p className="text-xs font-sans text-[#706c64] font-light max-w-sm mx-auto">
                  Try adjusting your filters or price range to explore more articles.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="group relative inline-flex items-center gap-3 text-xs uppercase tracking-[0.3em] font-medium text-[#1c1b18] py-2.5 px-6 border-b border-[#1c1b18] hover:text-[#5a5e4b] transition-colors cursor-pointer"
                  >
                    <span>RESET ALL FILTERS</span>
                  </button>
                </div>
              </div>
            )}

          </section>

        </div>

      </main>

      {/* ========================================================================= */}
      {/* FULL-HEIGHT MOBILE FILTER OVERLAY */}
      {/* ========================================================================= */}
      {isMobileFilterOpen && (
        <div className="fixed inset-0 z-[110] bg-[#faf8f5] flex flex-col justify-between p-6 overflow-y-auto lg:hidden">
          
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#e8e4dc]">
              <span className="text-xs font-sans font-medium uppercase tracking-[0.35em] text-[#1c1b18]">
                FILTERS
              </span>
              <button
                type="button"
                onClick={() => setIsMobileFilterOpen(false)}
                className="text-xs uppercase tracking-widest text-[#706c64] hover:text-[#1c1b18]"
              >
                CLOSE ×
              </button>
            </div>

            <div className="space-y-8 py-6">
              
              {/* Category */}
              <div>
                <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-[#5a5e4b] block mb-3">
                  CATEGORY
                </span>
                <div className="flex flex-wrap gap-2">
                  {categoriesList.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 text-xs font-sans uppercase tracking-wider border ${
                        selectedCategory.toLowerCase() === cat.toLowerCase()
                          ? 'border-[#1c1b18] bg-[#1c1b18] text-[#faf8f5]'
                          : 'border-[#e8e4dc] bg-transparent text-[#706c64]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fabric */}
              <div>
                <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-[#5a5e4b] block mb-3">
                  FABRIC
                </span>
                <div className="flex flex-wrap gap-2">
                  {fabricsList.map((fab) => (
                    <button
                      key={fab}
                      type="button"
                      onClick={() => setSelectedFabric(fab)}
                      className={`px-3 py-1.5 text-xs font-sans uppercase tracking-wider border ${
                        selectedFabric === fab
                          ? 'border-[#1c1b18] bg-[#1c1b18] text-[#faf8f5]'
                          : 'border-[#e8e4dc] bg-transparent text-[#706c64]'
                      }`}
                    >
                      {fab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Size */}
              <div>
                <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-[#5a5e4b] block mb-3">
                  SIZE
                </span>
                <div className="flex flex-wrap gap-2">
                  {sizesList.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setSelectedSize(sz)}
                      className={`px-3 py-1.5 text-xs font-sans uppercase tracking-wider border ${
                        selectedSize === sz
                          ? 'border-[#1c1b18] bg-[#1c1b18] text-[#faf8f5]'
                          : 'border-[#e8e4dc] bg-transparent text-[#706c64]'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>

          <div className="pt-4 border-t border-[#e8e4dc] space-y-3">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearAll}
                className="w-full py-2.5 text-xs font-sans uppercase tracking-[0.25em] text-[#706c64] border border-[#e8e4dc]"
              >
                Clear All
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMobileFilterOpen(false)}
              className="w-full py-3 bg-[#1c1b18] text-white text-xs font-sans uppercase tracking-[0.25em]"
            >
              Apply Filters ({sortedProducts.length})
            </button>
          </div>

        </div>
      )}

      <Footer />
    </div>
  )
}
