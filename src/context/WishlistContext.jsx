import { createContext, useContext, useState, useEffect } from 'react'
import { products } from '../data/products'

const WishlistContext = createContext()

const LOCAL_STORAGE_KEY = 'zahzan_wishlist_ids'

export function WishlistProvider({ children }) {
  const [wishlistIds, setWishlistIds] = useState(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
      return saved ? JSON.parse(saved) : [1, 3] // Default initial saved items (Ivory Bloom, Mehr)
    } catch {
      return [1, 3]
    }
  })
  const [isWishlistOpen, setIsWishlistOpen] = useState(false)

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(wishlistIds))
    } catch (e) {
      console.error('Failed to save wishlist to localStorage', e)
    }
  }, [wishlistIds])

  const openWishlist = () => setIsWishlistOpen(true)
  const closeWishlist = () => setIsWishlistOpen(false)
  const toggleWishlistDrawer = () => setIsWishlistOpen((prev) => !prev)

  const toggleWishlist = (productId) => {
    setWishlistIds((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId)
      } else {
        return [...prev, productId]
      }
    })
  }

  const isInWishlist = (productId) => wishlistIds.includes(productId)

  const wishlistProducts = products.filter((p) => wishlistIds.includes(p.id))
  const wishlistCount = wishlistIds.length

  return (
    <WishlistContext.Provider
      value={{
        wishlistIds,
        wishlistProducts,
        wishlistCount,
        isWishlistOpen,
        openWishlist,
        closeWishlist,
        toggleWishlistDrawer,
        toggleWishlist,
        isInWishlist
      }}
    >
      {children}
    </WishlistContext.Provider>
  )
}

export function useWishlist() {
  const context = useContext(WishlistContext)
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider')
  }
  return context
}
