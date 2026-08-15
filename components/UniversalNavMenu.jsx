'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, ShoppingBag, User, ArrowRight, X, Plus, Minus, ChevronRight, HelpCircle, Truck, Ruler, MessageSquare } from 'lucide-react'
const logo = '/images/logo.png'
const editorialThumb = '/images/craftsmanship_hero.jpg'
import { categories } from '../data/categories'
import { useCart } from '../context/CartContext'

const API_BASE = '/api'

export default function UniversalNavMenu({ isOpen, onClose, initialView = 'nav' }) {
  const { cartCount } = useCart()
  const [currentView, setCurrentView] = useState(initialView) // 'nav' | 'search'
  const [isCollectionsExpanded, setIsCollectionsExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeHelpModal, setActiveHelpModal] = useState(null) // 'size' | 'shipping' | 'contact' | 'track' | null
  const [products, setProducts] = useState([])
  const searchInputRef = useRef(null)
  const drawerRef = useRef(null)
  const router = useRouter()

  useEffect(() => {
    if (isOpen && products.length === 0) {
      fetch(`${API_BASE}/products`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.products)) {
            setProducts(data.products)
          }
        })
        .catch((err) => console.error('Failed to fetch search products:', err))
    }
  }, [isOpen, products.length])

  // Reset view when menu opens
  useEffect(() => {
    if (isOpen) {
      setCurrentView(initialView)
      setSearchQuery('')
      // Lock body scroll
      document.body.style.overflow = 'hidden'
    } else {
      // Restore body scroll
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen, initialView])

  // ESC key listener to close menu
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        if (activeHelpModal) {
          setActiveHelpModal(null)
        } else if (currentView === 'search') {
          setCurrentView('nav')
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, activeHelpModal, currentView, onClose])

  // Autofocus search input when entering search view
  useEffect(() => {
    if (currentView === 'search') {
      setTimeout(() => searchInputRef.current?.focus(), 150)
    }
  }, [currentView])

  // Filter products for search
  const filteredProducts = searchQuery.trim()
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : []

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden" role="dialog" aria-modal="true">
      
      {/* ========================================================================= */}
      {/* DESKTOP 60% BACKDROP OVERLAY (Subtly Blurred & Dimmed on Desktop) */}
      {/* ========================================================================= */}
      <div
        className="fixed inset-0 bg-black/25 backdrop-blur-[4px] transition-opacity duration-500 ease-out hidden md:block"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ========================================================================= */}
      {/* UNIVERSAL DRAWER CONTAINER (40vw on Desktop / 100vw Fullscreen on Mobile) */}
      {/* ========================================================================= */}
      <aside
        ref={drawerRef}
        className={`fixed top-0 left-0 h-full bg-[#faf8f5] text-[#1c1b18] shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col justify-between overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden
          w-full md:w-[40vw] md:min-w-[420px] md:max-w-[680px] md:border-r border-[#e8e4dc] z-10`}
      >
        
        {/* ----------------------------------------------------------------------- */}
        {/* DRAWER HEADER: BRAND LOGO + ELEGANT CLOSE BUTTON */}
        {/* ----------------------------------------------------------------------- */}
        <div className="sticky top-0 z-20 bg-[#faf8f5]/95 backdrop-blur-xs px-6 py-5 sm:px-8 flex items-center justify-between border-b border-[#e8e4dc]/70">
          <Link href="/" onClick={onClose} className="flex items-center gap-2 group">
            <img src={logo} alt="ZAHZAN" className="h-12 sm:h-14 w-auto object-contain transition-transform group-hover:scale-105" />
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="group flex items-center gap-2 text-xs uppercase tracking-[0.3em] font-medium text-[#1c1b18] py-2 px-3 hover:text-[#5a5e4b] transition-colors cursor-pointer"
            aria-label="Close navigation menu"
          >
            <span>CLOSE</span>
            <span className="text-base leading-none transition-transform group-hover:rotate-90 duration-300">×</span>
          </button>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* MAIN CONTENT AREA: NAV VIEW OR SEARCH VIEW */}
        {/* ----------------------------------------------------------------------- */}
        <div className="flex-1 px-6 py-6 sm:px-8 sm:py-8 space-y-8">
          
          {currentView === 'nav' ? (
            <>
              {/* PRIMARY SHOP NAVIGATION */}
              <nav className="space-y-4" aria-label="Primary Navigation">
                
                {/* NEW ARRIVALS */}
                <Link
                  href="/collections"
                  onClick={onClose}
                  className="group flex items-center justify-between text-2xl sm:text-3xl font-serif font-light text-[#1c1b18] hover:text-[#5a5e4b] transition-colors py-1"
                >
                  <span>NEW ARRIVALS</span>
                  <span className="text-sm font-sans opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-[#5a5e4b]">→</span>
                </Link>

                {/* EXPANDABLE COLLECTIONS ACCORDION */}
                <div>
                  <button
                    type="button"
                    onClick={() => setIsCollectionsExpanded(!isCollectionsExpanded)}
                    className="w-full group flex items-center justify-between text-2xl sm:text-3xl font-serif font-light text-[#1c1b18] hover:text-[#5a5e4b] transition-colors py-1 cursor-pointer"
                    aria-expanded={isCollectionsExpanded}
                  >
                    <span>COLLECTIONS</span>
                    <span className="text-xl font-sans text-[#5a5e4b]">
                      {isCollectionsExpanded ? '−' : '+'}
                    </span>
                  </button>

                  {/* SUB-COLLECTIONS ACCORDION LIST */}
                  {isCollectionsExpanded && (
                    <div className="mt-3 ml-4 pl-4 border-l border-[#e8e4dc] space-y-2.5 animate-fadeIn">
                      {categories.map((cat) => (
                        <Link
                          key={cat.id}
                          href="/collections"
                          onClick={onClose}
                          className="block text-sm font-sans tracking-wider text-[#706c64] hover:text-[#1c1b18] hover:translate-x-1 transition-all py-1"
                        >
                          {cat.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* READY TO WEAR */}
                <Link
                  href="/shop"
                  onClick={onClose}
                  className="group flex items-center justify-between text-2xl sm:text-3xl font-serif font-light text-[#1c1b18] hover:text-[#5a5e4b] transition-colors py-1"
                >
                  <span>READY TO WEAR</span>
                  <span className="text-sm font-sans opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-[#5a5e4b]">→</span>
                </Link>

                {/* UNSTITCHED */}
                <Link
                  href="/shop"
                  onClick={onClose}
                  className="group flex items-center justify-between text-2xl sm:text-3xl font-serif font-light text-[#1c1b18] hover:text-[#5a5e4b] transition-colors py-1"
                >
                  <span>UNSTITCHED</span>
                  <span className="text-sm font-sans opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-[#5a5e4b]">→</span>
                </Link>

                {/* SALE */}
                <Link
                  href="/shop"
                  onClick={onClose}
                  className="group flex items-center justify-between text-2xl sm:text-3xl font-serif font-light text-[#1c1b18] hover:text-[#5a5e4b] transition-colors py-1"
                >
                  <span>SALE</span>
                  <span className="text-sm font-sans opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-[#5a5e4b]">→</span>
                </Link>

              </nav>

              {/* SECONDARY NAVIGATION: DISCOVER & HELP */}
              <div className="pt-6 border-t border-[#e8e4dc]/70 grid grid-cols-2 gap-6">
                
                {/* DISCOVER COLUMN */}
                <div>
                  <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block mb-3">
                    DISCOVER
                  </span>
                  <ul className="space-y-2 text-xs font-sans tracking-wide text-[#706c64]">
                    <li>
                      <a href="#craftsmanship" onClick={onClose} className="hover:text-[#1c1b18] transition-colors">
                        Our Story
                      </a>
                    </li>
                    <li>
                      <a href="#craftsmanship" onClick={onClose} className="hover:text-[#1c1b18] transition-colors">
                        Craftsmanship
                      </a>
                    </li>
                    <li>
                      <a href="#worn-and-loved" onClick={onClose} className="hover:text-[#1c1b18] transition-colors">
                        Worn & Loved
                      </a>
                    </li>
                  </ul>
                </div>

                {/* HELP COLUMN */}
                <div>
                  <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block mb-3">
                    HELP
                  </span>
                  <ul className="space-y-2 text-xs font-sans tracking-wide text-[#706c64]">
                    <li>
                      <button type="button" onClick={() => setActiveHelpModal('size')} className="hover:text-[#1c1b18] transition-colors text-left cursor-pointer">
                        Size Guide
                      </button>
                    </li>
                    <li>
                      <button type="button" onClick={() => setActiveHelpModal('shipping')} className="hover:text-[#1c1b18] transition-colors text-left cursor-pointer">
                        Shipping & Delivery
                      </button>
                    </li>
                    <li>
                      <button type="button" onClick={() => setActiveHelpModal('track')} className="hover:text-[#1c1b18] transition-colors text-left cursor-pointer">
                        Track Order
                      </button>
                    </li>
                    <li>
                      <button type="button" onClick={() => setActiveHelpModal('contact')} className="hover:text-[#1c1b18] transition-colors text-left cursor-pointer">
                        Contact Us
                      </button>
                    </li>
                  </ul>
                </div>

              </div>

              {/* RESTRAINED EDITORIAL CAMPAIGN IMAGE */}
              <div className="pt-4">
                <div className="relative group overflow-hidden bg-[#f3efe8] rounded-xs max-w-[260px] aspect-[16/9]">
                  <img
                    src={editorialThumb}
                    alt="Latest Editorial Campaign"
                    className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-3">
                    <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-white">
                      THE LATEST EDIT
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            
            /* ========================================================================= */
            /* SEARCH THE COLLECTION INLINE VIEW */
            /* ========================================================================= */
            <div className="space-y-6">
              
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentView('nav')}
                  className="text-xs uppercase tracking-[0.25em] font-sans text-[#5a5e4b] hover:text-[#1c1b18] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <span>← BACK TO MENU</span>
                </button>
              </div>

              <div>
                <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block mb-2">
                  SEARCH THE COLLECTION
                </span>

                <div className="relative border-b border-[#1c1b18] pb-2 flex items-center gap-3">
                  <Search size={18} className="text-[#5a5e4b]" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search articles, lawn, silk..."
                    className="w-full bg-transparent text-base sm:text-lg font-serif text-[#1c1b18] placeholder:text-[#a09c94] focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-xs text-[#706c64] hover:text-[#1c1b18] p-1"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* SEARCH RESULTS */}
              <div className="space-y-3 pt-2 max-h-[45vh] overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pr-2">
                {searchQuery.trim() === '' ? (
                  <p className="text-xs font-sans text-[#a09c94] italic">
                    Type to explore signature lawn, pret, and formal pieces...
                  </p>
                ) : filteredProducts.length > 0 ? (
                  filteredProducts.map((product) => {
                    const prodId = product.id || product._id
                    const prodImg = (product.images && product.images[0]) || product.image
                    return (
                      <div
                        key={prodId}
                        onClick={() => {
                          onClose()
                          router.push(`/product/${prodId}`)
                        }}
                        className="group flex items-center gap-4 p-2 rounded-xs hover:bg-[#f3efe8] transition-colors cursor-pointer"
                      >
                      <div className="flex-1">
                        <span className="text-[9px] font-sans uppercase tracking-[0.25em] text-[#5a5e4b] block">
                          {product.category}
                        </span>
                        <h4 className="font-serif text-base text-[#1c1b18] group-hover:text-[#5a5e4b] transition-colors">
                          {product.name}
                        </h4>
                        <p className="text-xs font-sans text-[#706c64]">
                          PKR {product.price.toLocaleString()}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-[#a09c94] group-hover:translate-x-1 transition-transform" />
                    </div>
                  )
                })
                ) : (
                  <p className="text-xs font-sans text-[#706c64] py-4">
                    No articles found matching "{searchQuery}".
                  </p>
                )}
              </div>

            </div>
          )}

        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* UTILITY FOOTER ROW: SEARCH | ACCOUNT | BAG */}
        {/* ----------------------------------------------------------------------- */}
        <div className="sticky bottom-0 bg-[#faf8f5] border-t border-[#e8e4dc] px-6 py-4 sm:px-8 grid grid-cols-3 gap-2 text-center text-xs font-sans font-medium uppercase tracking-[0.25em] text-[#1c1b18]">
          
          <button
            type="button"
            onClick={() => setCurrentView(currentView === 'search' ? 'nav' : 'search')}
            className="flex items-center justify-center gap-2 py-2 hover:text-[#5a5e4b] transition-colors cursor-pointer"
          >
            <Search size={14} />
            <span>SEARCH</span>
          </button>

          <Link
            href="/account"
            onClick={onClose}
            className="flex items-center justify-center gap-2 py-2 hover:text-[#5a5e4b] transition-colors"
          >
            <User size={14} />
            <span>ACCOUNT</span>
          </Link>

          <Link
            href="/shop"
            onClick={onClose}
            className="flex items-center justify-center gap-2 py-2 hover:text-[#5a5e4b] transition-colors"
          >
            <ShoppingBag size={14} />
            <span>BAG · {cartCount}</span>
          </Link>

        </div>

      </aside>

      {/* ========================================================================= */}
      {/* INTERACTIVE HELP MODALS (Size Guide / Shipping / Contact / Track Order) */}
      {/* ========================================================================= */}
      {activeHelpModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[#faf8f5] border border-[#e8e4dc] rounded-xs p-6 sm:p-8 max-w-md w-full relative shadow-2xl text-[#1c1b18]">
            
            <button
              type="button"
              onClick={() => setActiveHelpModal(null)}
              className="absolute top-4 right-4 text-xs tracking-widest text-[#706c64] hover:text-[#1c1b18] p-1 cursor-pointer"
            >
              ✕
            </button>

            {activeHelpModal === 'size' && (
              <div className="space-y-4">
                <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block">
                  SIZE & FIT GUIDE
                </span>
                <h3 className="font-serif text-2xl text-[#1c1b18]">Signature Sizing</h3>
                <div className="text-xs font-sans text-[#706c64] space-y-2 leading-relaxed">
                  <p>Our prêt pieces are tailored with a classic relaxed Pakistani silhouette.</p>
                  <div className="border border-[#e8e4dc] p-3 space-y-1.5 font-mono text-[11px]">
                    <div className="flex justify-between border-b border-[#e8e4dc] pb-1 font-bold">
                      <span>SIZE</span><span>CHEST</span><span>KAMEEZ LENGTH</span>
                    </div>
                    <div className="flex justify-between"><span>SMALL</span><span>36"</span><span>44"</span></div>
                    <div className="flex justify-between"><span>MEDIUM</span><span>39"</span><span>45"</span></div>
                    <div className="flex justify-between"><span>LARGE</span><span>42"</span><span>46"</span></div>
                  </div>
                </div>
              </div>
            )}

            {activeHelpModal === 'shipping' && (
              <div className="space-y-4">
                <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block">
                  DELIVERY & SHIPPING
                </span>
                <h3 className="font-serif text-2xl text-[#1c1b18]">Global Delivery</h3>
                <p className="text-xs font-sans text-[#706c64] leading-relaxed">
                  Nationwide orders are delivered within 3-5 business days via express courier. International worldwide shipping takes 5-7 business days.
                </p>
              </div>
            )}

            {activeHelpModal === 'track' && (
              <div className="space-y-4">
                <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block">
                  TRACK YOUR ORDER
                </span>
                <h3 className="font-serif text-2xl text-[#1c1b18]">Order Status</h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Enter Order # (e.g. ZAH-8921)"
                    className="w-full bg-[#f3efe8] border border-[#e8e4dc] p-2.5 text-xs font-sans focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      alert('Tracking details sent to your registered contact.')
                      setActiveHelpModal(null)
                    }}
                    className="w-full bg-[#1c1b18] text-[#faf8f5] text-xs font-sans uppercase tracking-[0.25em] py-2.5 hover:bg-[#5a5e4b] transition-colors cursor-pointer"
                  >
                    Track Shipment
                  </button>
                </div>
              </div>
            )}

            {activeHelpModal === 'contact' && (
              <div className="space-y-4">
                <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block">
                  CONCIERGE & SUPPORT
                </span>
                <h3 className="font-serif text-2xl text-[#1c1b18]">Contact Us</h3>
                <div className="text-xs font-sans text-[#706c64] space-y-2">
                  <p>Client Concierge: <span className="text-[#1c1b18] font-medium">+92 300 1234567</span></p>
                  <p>Email: <span className="text-[#1c1b18] font-medium">concierge@zahzan.com</span></p>
                  <p>Hours: Monday – Saturday, 10am – 7pm PKT</p>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  )
}
