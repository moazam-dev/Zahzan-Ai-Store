'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Heart, X, ShoppingBag } from 'lucide-react'
import { useWishlist } from '../context/WishlistContext'
import { useCart } from '../context/CartContext'

export default function WishlistDrawer() {
  const { wishlistProducts, wishlistCount, isWishlistOpen, closeWishlist, toggleWishlist } = useWishlist()
  const { addToCart, openCart } = useCart()
  const router = useRouter()

  // ESC key listener & body scroll locking
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isWishlistOpen) {
        closeWishlist()
      }
    }

    if (isWishlistOpen) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isWishlistOpen, closeWishlist])

  const handleAddToCart = (product) => {
    addToCart(product)
    closeWishlist()
    openCart()
  }

  if (!isWishlistOpen) return null

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden" role="dialog" aria-modal="true">
      
      {/* ========================================================================= */}
      {/* DESKTOP 70% BACKDROP OVERLAY (Subtly Blurred & Dimmed on Desktop) */}
      {/* ========================================================================= */}
      <div
        className="fixed inset-0 bg-black/25 backdrop-blur-[4px] transition-opacity duration-500 ease-out hidden md:block"
        onClick={closeWishlist}
        aria-hidden="true"
      />

      {/* ========================================================================= */}
      {/* RIGHT-SIDE WISHLIST DRAWER (30vw Desktop / 100vw Fullscreen Mobile) */}
      {/* ========================================================================= */}
      <aside
        className={`fixed top-0 right-0 h-full bg-[#faf8f5] text-[#1c1b18] shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col justify-between overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden
          w-full md:w-[30vw] md:min-w-[360px] md:max-w-[500px] md:border-l border-[#e8e4dc] z-10`}
      >
        
        {/* ----------------------------------------------------------------------- */}
        {/* WISHLIST HEADER: TITLE + SAVED COUNT + ELEGANT CLOSE BUTTON */}
        {/* ----------------------------------------------------------------------- */}
        <div className="sticky top-0 z-20 bg-[#faf8f5]/95 backdrop-blur-xs px-6 py-5 sm:px-8 flex items-center justify-between border-b border-[#e8e4dc]/70">
          <div>
            <h2 className="font-serif text-xl sm:text-2xl font-light text-[#1c1b18] tracking-tight">
              WISHLIST
            </h2>
            <span className="text-[10px] font-sans uppercase tracking-[0.25em] text-[#5a5e4b] block mt-0.5">
              {wishlistCount} {wishlistCount === 1 ? 'SAVED' : 'SAVED'}
            </span>
          </div>

          <button
            type="button"
            onClick={closeWishlist}
            className="group flex items-center gap-2 text-xs uppercase tracking-[0.3em] font-medium text-[#1c1b18] py-2 px-3 hover:text-[#5a5e4b] transition-colors cursor-pointer"
            aria-label="Close wishlist drawer"
          >
            <span>CLOSE</span>
            <span className="text-base leading-none transition-transform group-hover:rotate-90 duration-300">×</span>
          </button>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* WISHLIST PRODUCT LIST */}
        {/* ----------------------------------------------------------------------- */}
        <div className="flex-1 px-6 py-6 sm:px-8 space-y-6 overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {wishlistProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-1 gap-6">
              {wishlistProducts.map((product) => {
                const prodId = product.id || product._id
                const prodImg = (product.images && product.images[0]) || product.image
                return (
                  <div
                    key={prodId}
                    className="group relative flex items-start gap-4 pb-6 border-b border-[#e8e4dc]/70 last:border-0"
                  >
                    {/* Product Thumbnail */}
                    <div
                      onClick={() => {
                        closeWishlist()
                        router.push(`/product/${prodId}`, { scroll: false })
                      }}
                      className="w-20 h-24 sm:w-24 sm:h-30 flex-shrink-0 bg-[#f3efe8] overflow-hidden border border-[#e5e0d8] cursor-pointer"
                    >
                      <img src={prodImg} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>

                    {/* Details & Actions */}
                    <div className="flex-1 flex flex-col justify-between h-full space-y-3">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[9px] font-sans uppercase tracking-[0.25em] text-[#5a5e4b] block">
                              {product.category}
                            </span>
                            <h4
                              onClick={() => {
                                closeWishlist()
                                router.push(`/product/${prodId}`, { scroll: false })
                              }}
                              className="font-serif text-lg text-[#1c1b18] font-normal leading-tight mt-0.5 hover:text-[#5a5e4b] transition-colors cursor-pointer"
                            >
                              {product.name}
                            </h4>
                          </div>

                          {/* Heart Remove Toggle */}
                          <button
                            type="button"
                            onClick={() => toggleWishlist(prodId)}
                            className="p-1 text-[#1c1b18] hover:text-[#5a5e4b] transition-colors cursor-pointer"
                            aria-label={`Remove ${product.name} from wishlist`}
                          >
                            <Heart size={16} fill="#1c1b18" />
                          </button>
                        </div>

                        <span className="text-xs font-sans font-medium text-[#1c1b18] block mt-1">
                          PKR {product.price.toLocaleString()}
                        </span>
                      </div>

                      {/* Add to Bag Button */}
                      <div>
                        <button
                          type="button"
                          onClick={() => handleAddToCart(product)}
                          className="w-full bg-[#1c1b18] text-[#faf8f5] text-[10px] font-sans uppercase tracking-[0.25em] py-2.5 px-4 hover:bg-[#5a5e4b] transition-colors cursor-pointer"
                        >
                          ADD TO BAG +
                        </button>
                      </div>

                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            
            /* EMPTY WISHLIST STATE */
            <div className="py-16 text-center space-y-4">
              <Heart size={36} className="mx-auto text-[#a09c94] stroke-1" />
              <div className="space-y-1">
                <h3 className="font-serif text-2xl text-[#1c1b18] font-light">YOUR WISHLIST IS EMPTY</h3>
                <p className="text-xs font-sans text-[#706c64] font-light leading-relaxed max-w-xs mx-auto">
                  Keep the pieces you love close.
                </p>
              </div>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => {
                    closeWishlist()
                    router.push('/shop', { scroll: false })
                  }}
                  className="group relative inline-flex items-center gap-3 text-xs uppercase tracking-[0.3em] font-medium text-[#1c1b18] py-2.5 px-6 border-b border-[#1c1b18] transition-all hover:bg-[#1c1b18] hover:text-[#faf8f5] cursor-pointer"
                >
                  <span>EXPLORE THE COLLECTION</span>
                  <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* WISHLIST FOOTER STATEMENT */}
        {/* ----------------------------------------------------------------------- */}
        <div className="sticky bottom-0 bg-[#faf8f5] border-t border-[#e8e4dc] px-6 py-4 sm:px-8 text-center">
          <span className="text-[10px] font-sans text-[#5a5e4b] uppercase tracking-[0.25em] italic block">
            A private edit of pieces you love.
          </span>
        </div>

      </aside>

    </div>
  )
}
