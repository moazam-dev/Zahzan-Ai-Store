'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { 
  Heart, 
  ChevronLeft, 
  ChevronRight, 
  Minus, 
  Plus, 
  Ruler, 
  ChevronDown, 
  ChevronUp,
  Check
} from 'lucide-react'

import AnnouncementBar from '../components/AnnouncementBar'
import Header from '../components/Header'
import Footer from '../components/Footer'
import ProductCard from '../components/ProductCard'
import SizeGuideModal from '../components/SizeGuideModal'
import CheckoutModal from '../components/CheckoutModal'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'

const API_BASE = '/api'

export default function Product() {
  const { id } = useParams()
  const { addToCart } = useCart()
  const { isInWishlist, toggleWishlist } = useWishlist()
  const router = useRouter()

  const [product, setProduct] = useState(null)
  const [allProducts, setAllProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)

  // Scroll to top when product ID changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [id])

  // Fetch product details and all products for related list
  useEffect(() => {
    const fetchProductData = async () => {
      try {
        setLoading(true)
        const [prodRes, listRes] = await Promise.all([
          fetch(`${API_BASE}/products/${id}`),
          fetch(`${API_BASE}/products`)
        ])

        const prodData = await prodRes.json()
        if (prodData.success && (prodData.product || prodData.data)) {
          setProduct(prodData.product || prodData.data)
        } else {
          setProduct(null)
        }

        const listData = await listRes.json()
        if (listData.success && Array.isArray(listData.products)) {
          setAllProducts(listData.products)
        }
      } catch (err) {
        console.error('Failed to load product page data:', err)
        setProduct(null)
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      fetchProductData()
    }
  }, [id])

  // State management
  const [selectedSize, setSelectedSize] = useState('M')
  const [quantity, setQuantity] = useState(1)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false)
  const [isZoomed, setIsZoomed] = useState(false)
  const [zoomPos, setZoomPos] = useState({ x: 0, y: 0 })
  const [openDeliveryAccordion, setOpenDeliveryAccordion] = useState(false)

  // Reset state when product changes
  useEffect(() => {
    if (product?.sizes?.length > 0) {
      setSelectedSize(product.sizes[0])
    } else {
      setSelectedSize('M')
    }
    setQuantity(1)
    setActiveImageIndex(0)
  }, [product])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8f5] text-[#1c1b18] flex flex-col justify-between">
        <AnnouncementBar />
        <Header />
        <div className="py-24 text-center space-y-4">
          <p className="text-xs font-sans text-[#706c64] uppercase tracking-[0.25em]">LOADING ARTICLE...</p>
        </div>
        <Footer />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-[#faf8f5] text-[#1c1b18] flex flex-col justify-between">
        <AnnouncementBar />
        <Header />
        <div className="py-24 text-center space-y-4">
          <h2 className="font-serif text-3xl font-light">ARTICLE NOT FOUND</h2>
          <p className="text-xs font-sans text-[#706c64]">The requested garment could not be located.</p>
          <Link href="/shop" scroll={false} className="inline-block px-6 py-3 bg-[#1c1b18] text-[#faf8f5] text-xs font-sans uppercase tracking-[0.25em]">
            EXPLORE SHOP
          </Link>
        </div>
        <Footer />
      </div>
    )
  }

  const productId = product.id || product._id
  const isSaved = isInWishlist(productId)

  // Construct images array
  const galleryImages = (product.images && product.images.length > 0)
    ? product.images
    : (product.gallery && product.gallery.length > 0)
    ? product.gallery
    : [
        product.image || 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85',
        product.hoverImage || product.image || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85'
      ]

  const handlePrevImage = () => {
    setActiveImageIndex((prev) => (prev - 1 + galleryImages.length) % galleryImages.length)
  }

  const handleNextImage = () => {
    setActiveImageIndex((prev) => (prev + 1) % galleryImages.length)
  }

  // Handle image mouse move for desktop zoom
  const handleMouseMove = (e) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - left) / width) * 100
    const y = ((e.clientY - top) / height) * 100
    setZoomPos({ x, y })
  }

  // Handle Add to Bag
  const handleAddToCart = () => {
    addToCart(product, selectedSize, product.color || '', quantity)
  }

  // Handle Express Buy Now
  const handleBuyNow = () => {
    const token = localStorage.getItem('zahzan_token')
    if (!token) {
      alert('Please sign in to complete your purchase.')
      router.push('/account', { scroll: false })
      return
    }
    setIsCheckoutOpen(true)
  }

  // Related products (2 to 3 max, excluding current)
  const relatedProducts = allProducts
    .filter((p) => (p.id || p._id) !== productId)
    .slice(0, 3)

  const isSoldOut = product.stock === 0

  return (
    <div className="min-h-screen bg-[#faf8f5] text-[#1c1b18] font-sans selection:bg-[#5a5e4b] selection:text-white">
      <AnnouncementBar />
      <Header />

      {/* ========================================================================= */}
      {/* 01 — MAIN PRODUCT SECTION (GALLERY + PURCHASING INTERFACE) */}
      {/* Controlled max-width canvas */}
      {/* ========================================================================= */}
      <main className="mx-auto max-w-[1360px] px-4 sm:px-8 lg:px-12 py-6 sm:py-10">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* ===================================================================== */}
          {/* LEFT: THUMBNAILS + MAIN PRODUCT IMAGE (7 COLS DESKTOP) */}
          {/* ===================================================================== */}
          <div className="lg:col-span-7 flex flex-col-reverse lg:flex-row gap-4">
            
            {/* DESKTOP VERTICAL THUMBNAILS COLUMN */}
            <div className="hidden lg:flex flex-col gap-3 min-w-[76px]">
              {galleryImages.map((imgUrl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImageIndex(idx)}
                  className={`relative w-20 aspect-[3/4] overflow-hidden bg-[#f4f0e8] transition-all cursor-pointer ${
                    activeImageIndex === idx
                      ? 'border-2 border-[#1c1b18] opacity-100'
                      : 'border border-[#e8e4dc] opacity-70 hover:opacity-100'
                  }`}
                  aria-label={`View image ${idx + 1}`}
                >
                  <img
                    src={imgUrl}
                    alt={`${product.name} thumbnail ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>

            {/* MAIN DISPLAY IMAGE WITH HOVER ZOOM & NAVIGATION ARROWS */}
            <div className="relative flex-1 aspect-[3/4] bg-[#f4f0e8] overflow-hidden group select-none">
              
              <div
                className="w-full h-full cursor-crosshair overflow-hidden relative"
                onMouseEnter={() => setIsZoomed(true)}
                onMouseLeave={() => setIsZoomed(false)}
                onMouseMove={handleMouseMove}
              >
                <img
                  src={galleryImages[activeImageIndex]}
                  alt={product.name}
                  className={`w-full h-full object-cover transition-transform duration-300 ease-out ${
                    isZoomed ? 'scale-150' : 'scale-100'
                  }`}
                  style={
                    isZoomed
                      ? { transformOrigin: `${zoomPos.x}% ${zoomPos.y}%` }
                      : undefined
                  }
                />
              </div>

              {/* Edge navigation arrows on main image */}
              {galleryImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrevImage}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2 text-[#1c1b18] bg-[#faf8f5]/80 hover:bg-[#faf8f5] backdrop-blur-xs transition-opacity opacity-0 group-hover:opacity-100 cursor-pointer"
                    aria-label="Previous image"
                  >
                    <ChevronLeft size={20} />
                  </button>

                  <button
                    type="button"
                    onClick={handleNextImage}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[#1c1b18] bg-[#faf8f5]/80 hover:bg-[#faf8f5] backdrop-blur-xs transition-opacity opacity-0 group-hover:opacity-100 cursor-pointer"
                    aria-label="Next image"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}

              {/* Image counter indicator */}
              <div className="absolute bottom-3 right-3 text-[10px] font-sans uppercase tracking-[0.25em] text-[#1c1b18]/70 bg-[#faf8f5]/90 px-2.5 py-1 backdrop-blur-xs">
                0{activeImageIndex + 1} / 0{galleryImages.length}
              </div>

            </div>

            {/* MOBILE HORIZONTAL THUMBNAILS STRIP BELOW MAIN IMAGE */}
            <div className="flex lg:hidden gap-2 overflow-x-auto pb-1 pt-1 scrollbar-none">
              {galleryImages.map((imgUrl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImageIndex(idx)}
                  className={`relative w-16 aspect-[3/4] flex-shrink-0 overflow-hidden bg-[#f4f0e8] ${
                    activeImageIndex === idx ? 'border-2 border-[#1c1b18]' : 'border border-[#e8e4dc] opacity-70'
                  }`}
                >
                  <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

          </div>

          {/* ===================================================================== */}
          {/* RIGHT: PURCHASING INTERFACE (5 COLS DESKTOP) */}
          {/* ===================================================================== */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* CATEGORY & TITLE & WISHLIST HEART */}
            <div className="space-y-2 border-b border-[#e8e4dc] pb-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b]">
                  {product.category}
                </span>

                {/* WISHLIST HEART */}
                <button
                  type="button"
                  onClick={() => toggleWishlist(product.id)}
                  aria-label={isSaved ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
                  className="p-1.5 text-[#1c1b18] hover:text-[#5a5e4b] transition-colors cursor-pointer"
                >
                  <Heart
                    size={22}
                    fill={isSaved ? '#1c1b18' : 'none'}
                    className={isSaved ? 'text-[#1c1b18]' : 'text-[#1c1b18]/70 hover:text-[#1c1b18]'}
                  />
                </button>
              </div>

              <h1 className="font-serif text-3xl sm:text-4xl font-light text-[#1c1b18] tracking-tight leading-snug">
                {product.name}
              </h1>

              {/* PRICE */}
              <div className="flex items-baseline gap-3 pt-1">
                <span className="text-2xl font-sans font-medium text-[#1c1b18]">
                  PKR {product.price.toLocaleString()}
                </span>
                {product.originalPrice && (
                  <span className="text-base font-sans text-[#706c64] line-through font-light">
                    PKR {product.originalPrice.toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            {/* SHORT PRODUCT DESCRIPTION (2-3 LINES MAX) */}
            <p className="text-xs font-sans text-[#706c64] font-light leading-relaxed tracking-wide">
              {product.quickDescription || product.description}
            </p>

            {/* QUICK PRODUCT DETAILS (FABRIC / COLOR / WORK) */}
            <div className="py-3 border-y border-[#e8e4dc] grid grid-cols-3 gap-2 text-left">
              <div>
                <span className="text-[9px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] block">
                  FABRIC
                </span>
                <span className="text-xs font-sans text-[#1c1b18] font-normal block mt-0.5">
                  {product.fabric || 'Cotton Lawn'}
                </span>
              </div>

              <div>
                <span className="text-[9px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] block">
                  COLOR
                </span>
                <span className="text-xs font-sans text-[#1c1b18] font-normal block mt-0.5">
                  {product.color || 'Ivory'}
                </span>
              </div>

              <div>
                <span className="text-[9px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] block">
                  WORK
                </span>
                <span className="text-xs font-sans text-[#1c1b18] font-normal block mt-0.5">
                  {product.work || 'Embroidered'}
                </span>
              </div>
            </div>

            {/* SIZE SELECTOR & SIZE GUIDE */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-[#1c1b18]">
                  SELECT SIZE
                </span>
                <button
                  type="button"
                  onClick={() => setIsSizeGuideOpen(true)}
                  className="flex items-center gap-1 text-[10px] font-sans font-medium uppercase tracking-[0.2em] text-[#5a5e4b] hover:text-[#1c1b18] underline transition-colors cursor-pointer"
                >
                  <Ruler size={12} />
                  <span>SIZE GUIDE</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {product.sizes.map((sz) => {
                  const isSelected = selectedSize === sz
                  return (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setSelectedSize(sz)}
                      className={`min-w-[44px] px-3.5 py-2 text-xs font-sans font-medium uppercase transition-all duration-150 cursor-pointer ${
                        isSelected
                          ? 'border-b-2 border-[#1c1b18] text-[#1c1b18] bg-[#f4f0e8]/80 font-semibold'
                          : 'border border-[#e8e4dc] text-[#706c64] hover:border-[#1c1b18] hover:text-[#1c1b18]'
                      }`}
                    >
                      {sz}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* QUANTITY SELECTOR */}
            <div className="space-y-2">
              <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-[#1c1b18] block">
                QUANTITY
              </span>
              <div className="inline-flex items-center border border-[#e8e4dc] bg-[#faf8f5]">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="p-2.5 text-[#1c1b18] hover:bg-[#f4f0e8] transition-colors cursor-pointer"
                  aria-label="Decrease quantity"
                >
                  <Minus size={14} />
                </button>
                <span className="w-10 text-center text-xs font-sans font-medium text-[#1c1b18]">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="p-2.5 text-[#1c1b18] hover:bg-[#f4f0e8] transition-colors cursor-pointer"
                  aria-label="Increase quantity"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* AVAILABILITY INDICATOR */}
            <div className="text-[10px] font-sans uppercase tracking-[0.25em] text-[#5a5e4b] flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isSoldOut ? 'bg-red-500' : 'bg-[#5a5e4b]'}`} />
              <span>
                {isSoldOut 
                  ? 'SOLD OUT' 
                  : product.stock && product.stock <= 3 
                  ? `LOW STOCK — ONLY ${product.stock} LEFT` 
                  : 'IN STOCK'}
              </span>
            </div>

            {/* PRIMARY ACTIONS: ADD TO BAG & BUY NOW */}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isSoldOut}
                onClick={handleAddToCart}
                className={`w-full min-h-[48px] py-3.5 px-4 text-xs font-sans font-medium uppercase tracking-[0.25em] transition-colors cursor-pointer border ${
                  isSoldOut
                    ? 'bg-[#e8e4dc] text-[#706c64] border-transparent cursor-not-allowed'
                    : 'bg-[#1c1b18] text-[#faf8f5] border-[#1c1b18] hover:bg-[#3a3b36]'
                }`}
              >
                {isSoldOut ? 'SOLD OUT' : 'ADD TO BAG +'}
              </button>

              <button
                type="button"
                disabled={isSoldOut}
                onClick={handleBuyNow}
                className={`w-full min-h-[48px] py-3.5 px-4 text-xs font-sans font-medium uppercase tracking-[0.25em] transition-colors cursor-pointer border ${
                  isSoldOut
                    ? 'bg-[#e8e4dc] text-[#706c64] border-transparent cursor-not-allowed'
                    : 'bg-[#faf8f5] text-[#1c1b18] border-[#1c1b18] hover:bg-[#1c1b18] hover:text-[#faf8f5]'
                }`}
              >
                BUY NOW →
              </button>
            </div>

            {/* DELIVERY / TRUST REASSURANCE */}
            <div className="pt-3 border-t border-[#e8e4dc] space-y-2 text-xs font-sans text-[#706c64] font-light">
              <div className="flex items-center justify-between">
                <div>
                  <strong className="font-medium text-[#1c1b18] uppercase tracking-wider text-[10px] block">DELIVERY</strong>
                  <span>Nationwide delivery available (2–4 business days)</span>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setOpenDeliveryAccordion((prev) => !prev)}
                  className="w-full flex items-center justify-between pt-2 text-[10px] uppercase tracking-wider font-medium text-[#5a5e4b] hover:text-[#1c1b18] cursor-pointer"
                >
                  <span>RETURN & EXCHANGE POLICY</span>
                  {openDeliveryAccordion ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {openDeliveryAccordion && (
                  <p className="pt-2 text-[11px] leading-relaxed text-[#706c64]">
                    We offer hassle-free exchanges within 7 days of receipt for unused items with original tags attached.
                  </p>
                )}
              </div>
            </div>

          </div>

        </div>

      </main>

      {/* ========================================================================= */}
      {/* 02 — CLEAN PRODUCT DETAILS SECTION */}
      {/* ========================================================================= */}
      <section className="mx-auto max-w-[1360px] px-4 sm:px-8 lg:px-12 py-12 border-t border-[#e8e4dc] my-8">
        
        <div className="max-w-4xl space-y-8">
          
          {/* SECTION TITLE */}
          <div className="space-y-1">
            <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b]">
              SPECIFICATIONS
            </span>
            <h2 className="font-serif text-2xl font-light text-[#1c1b18]">
              PRODUCT DETAILS
            </h2>
          </div>

          {/* BREAKDOWN GRID: SHIRT / TROUSER / DUPATTA */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs font-sans text-[#706c64] font-light border-b border-[#e8e4dc] pb-8">
            <div className="space-y-1">
              <h3 className="font-medium text-[#1c1b18] uppercase tracking-wider text-[10px]">
                SHIRT
              </h3>
              <p className="leading-relaxed">
                {product.breakdown?.shirt || 'Embroidered lawn front and sleeves, dyed back with worked neck patti.'}
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-medium text-[#1c1b18] uppercase tracking-wider text-[10px]">
                TROUSER
              </h3>
              <p className="leading-relaxed">
                {product.breakdown?.trouser || 'Solid dyed cambric trouser.'}
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-medium text-[#1c1b18] uppercase tracking-wider text-[10px]">
                DUPATTA
              </h3>
              <p className="leading-relaxed">
                {product.breakdown?.dupatta || 'Embroidered drape dupatta.'}
              </p>
            </div>
          </div>

          {/* SIZE & FIT + CARE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs font-sans text-[#706c64] font-light">
            <div className="space-y-1">
              <h3 className="font-medium text-[#1c1b18] uppercase tracking-wider text-[10px]">
                SIZE & FIT
              </h3>
              <p className="leading-relaxed">
                {product.modelInfo || "Model Height: 5'8\" | Model wears: Size S"}
              </p>
              <p className="leading-relaxed text-[11px] text-[#706c64]">
                Relaxed fluid fit tailored for standard Pakistani sizing.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-medium text-[#1c1b18] uppercase tracking-wider text-[10px]">
                CARE INSTRUCTIONS
              </h3>
              <ul className="space-y-1 leading-relaxed list-disc list-inside">
                {product.careInstructions?.map((item, idx) => (
                  <li key={idx}>{item}</li>
                )) || (
                  <>
                    <li>Dry clean recommended</li>
                    <li>Cold hand wash separately</li>
                    <li>Iron low on reverse side</li>
                  </>
                )}
              </ul>
            </div>
          </div>

        </div>

      </section>

      {/* ========================================================================= */}
      {/* 03 — YOU MAY ALSO LIKE (2 TO 3 PRODUCTS ONLY) */}
      {/* ========================================================================= */}
      <section className="mx-auto max-w-[1360px] px-4 sm:px-8 lg:px-12 py-12 border-t border-[#e8e4dc]">
        
        <div className="space-y-8">
          <div className="flex items-center justify-between pb-2 border-b border-[#e8e4dc]">
            <span className="text-[11px] font-sans font-medium uppercase tracking-[0.35em] text-[#1c1b18]">
              YOU MAY ALSO LIKE
            </span>
            <Link
              href="/shop"
              scroll={false}
              className="text-xs font-sans uppercase tracking-[0.2em] text-[#5a5e4b] hover:text-[#1c1b18] underline transition-colors"
            >
              VIEW COLLECTION →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {relatedProducts.map((relProduct) => (
              <ProductCard key={relProduct.id} product={relProduct} />
            ))}
          </div>
        </div>

      </section>

      {/* SIZE GUIDE MODAL */}
      <SizeGuideModal
        isOpen={isSizeGuideOpen}
        onClose={() => setIsSizeGuideOpen(false)}
      />

      {/* BUY NOW CHECKOUT MODAL */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        isBuyNow={true}
        buyNowProduct={product}
        buyNowSize={selectedSize}
        buyNowColor={product?.color || ''}
        buyNowQuantity={quantity}
        onOrderSuccess={() => setIsCheckoutOpen(false)}
      />

      {/* FOOTER */}
      <Footer />
    </div>
  )
}
