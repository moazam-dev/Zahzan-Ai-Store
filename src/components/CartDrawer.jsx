import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShoppingBag, X, Minus, Plus, Trash2, ArrowRight } from 'lucide-react'
import { useCart } from '../context/CartContext'
import CheckoutModal from './CheckoutModal'

export default function CartDrawer() {
  const { cartItems, isCartOpen, closeCart, removeFromCart, updateQuantity, cartCount, cartTotal } = useCart()
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const navigate = useNavigate()

  const getAuthToken = () => localStorage.getItem('zahzan_token')

  // ESC key listener & body scroll locking
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isCartOpen && !isCheckoutOpen) {
        closeCart()
      }
    }

    if (isCartOpen) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isCartOpen, isCheckoutOpen, closeCart])

  const handleCheckoutClick = () => {
    const token = getAuthToken()
    if (!token) {
      alert('Please sign in to complete your checkout.')
      closeCart()
      navigate('/account')
      return
    }
    setIsCheckoutOpen(true)
  }

  if (!isCartOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-[100] overflow-hidden" role="dialog" aria-modal="true">
        
        {/* DESKTOP 70% BACKDROP OVERLAY */}
        <div
          className="fixed inset-0 bg-black/25 backdrop-blur-[4px] transition-opacity duration-500 ease-out hidden md:block"
          onClick={closeCart}
          aria-hidden="true"
        />

        {/* RIGHT-SIDE CART DRAWER */}
        <aside
          className={`fixed top-0 right-0 h-full bg-[#faf8f5] text-[#1c1b18] shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col justify-between overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden
            w-full md:w-[30vw] md:min-w-[360px] md:max-w-[500px] md:border-l border-[#e8e4dc] z-10`}
        >
          
          {/* HEADER */}
          <div className="sticky top-0 z-20 bg-[#faf8f5]/95 backdrop-blur-xs px-6 py-5 sm:px-8 flex items-center justify-between border-b border-[#e8e4dc]/70">
            <div>
              <h2 className="font-serif text-xl sm:text-2xl font-light text-[#1c1b18] tracking-tight">
                YOUR BAG
              </h2>
              <span className="text-[10px] font-sans uppercase tracking-[0.25em] text-[#5a5e4b] block mt-0.5">
                {cartCount} {cartCount === 1 ? 'ITEM' : 'ITEMS'}
              </span>
            </div>

            <button
              type="button"
              onClick={closeCart}
              className="group flex items-center gap-2 text-xs uppercase tracking-[0.3em] font-medium text-[#1c1b18] py-2 px-3 hover:text-[#5a5e4b] transition-colors cursor-pointer"
              aria-label="Close cart drawer"
            >
              <span>CLOSE</span>
              <span className="text-base leading-none transition-transform group-hover:rotate-90 duration-300">×</span>
            </button>
          </div>

          {/* CART ITEMS LIST */}
          <div className="flex-1 px-6 py-6 sm:px-8 space-y-6 overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {cartItems.length > 0 ? (
              cartItems.map((item) => (
                <div
                  key={`${item.id || item.cartItemId}-${item.size}`}
                  className="flex items-start gap-4 pb-6 border-b border-[#e8e4dc]/70 last:border-0"
                >
                  {/* Product Thumbnail */}
                  <div className="w-20 h-24 sm:w-22 sm:h-28 flex-shrink-0 bg-[#f3efe8] overflow-hidden border border-[#e5e0d8]">
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                  </div>

                  {/* Details & Quantity Controls */}
                  <div className="flex-1 flex flex-col justify-between h-full space-y-2">
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[9px] font-sans uppercase tracking-[0.25em] text-[#5a5e4b] block">
                            {item.category}
                          </span>
                          <h4 className="font-serif text-lg text-[#1c1b18] font-normal leading-tight mt-0.5">
                            {item.name}
                          </h4>
                        </div>
                        <span className="text-xs font-sans font-medium text-[#1c1b18]">
                          PKR {(item.price * item.quantity).toLocaleString()}
                        </span>
                      </div>

                      {item.size && (
                        <span className="text-[11px] font-sans text-[#706c64] block mt-1">
                          Size: <span className="font-medium text-[#1c1b18]">{item.size}</span>
                        </span>
                      )}
                    </div>

                    {/* Quantity adjustment & Remove */}
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center border border-[#e8e4dc] bg-white rounded-xs">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id || item.cartItemId, item.size, -1)}
                          className="px-2.5 py-1 text-xs text-[#1c1b18] hover:bg-[#f3efe8] transition-colors cursor-pointer"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="px-3 text-xs font-mono font-medium text-[#1c1b18]">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id || item.cartItemId, item.size, 1)}
                          className="px-2.5 py-1 text-xs text-[#1c1b18] hover:bg-[#f3efe8] transition-colors cursor-pointer"
                          aria-label="Increase quantity"
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id || item.cartItemId, item.size)}
                        className="text-[11px] font-sans uppercase tracking-wider text-[#706c64] hover:text-[#1c1b18] underline transition-colors cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              
              /* EMPTY CART STATE */
              <div className="py-16 text-center space-y-4">
                <ShoppingBag size={36} className="mx-auto text-[#a09c94] stroke-1" />
                <div className="space-y-1">
                  <h3 className="font-serif text-2xl text-[#1c1b18] font-light">YOUR BAG IS EMPTY</h3>
                  <p className="text-xs font-sans text-[#706c64] font-light leading-relaxed max-w-xs mx-auto">
                    Discover pieces made for the way you move.
                  </p>
                </div>
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={closeCart}
                    className="group relative inline-flex items-center gap-3 text-xs uppercase tracking-[0.3em] font-medium text-[#1c1b18] py-2.5 px-6 border-b border-[#1c1b18] transition-all hover:bg-[#1c1b18] hover:text-[#faf8f5] cursor-pointer"
                  >
                    <span>CONTINUE SHOPPING</span>
                    <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* CART SUMMARY FOOTER & CHECKOUT */}
          {cartItems.length > 0 && (
            <div className="sticky bottom-0 bg-[#faf8f5] border-t border-[#e8e4dc] px-6 py-5 sm:px-8 space-y-4">
              
              <div className="flex items-center justify-between text-sm font-sans">
                <span className="uppercase tracking-[0.25em] text-[#5a5e4b] font-medium">SUBTOTAL</span>
                <span className="font-serif text-xl font-light text-[#1c1b18]">
                  PKR {cartTotal.toLocaleString()}
                </span>
              </div>

              <p className="text-[10px] font-sans text-[#706c64] italic">
                Taxes and international shipping calculated at checkout.
              </p>

              <button
                type="button"
                onClick={handleCheckoutClick}
                className="w-full group inline-flex items-center justify-center gap-3 text-xs uppercase tracking-[0.3em] font-medium text-white bg-[#1c1b18] py-4 px-6 transition-all duration-300 hover:bg-[#5a5e4b] cursor-pointer"
              >
                <span>CHECKOUT</span>
                <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </button>
            </div>
          )}

        </aside>

      </div>

      {/* REAL CHECKOUT MODAL */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        isBuyNow={false}
        onOrderSuccess={() => {
          setIsCheckoutOpen(false)
          closeCart()
        }}
      />
    </>
  )
}
