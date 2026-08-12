import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const WishlistContext = createContext()

const API_BASE = '/api'

export function WishlistProvider({ children }) {
  const [products, setProducts] = useState([])
  const [wishlistIds, setWishlistIds] = useState([])
  const [isWishlistOpen, setIsWishlistOpen] = useState(false)

  const getAuthToken = () => {
    return localStorage.getItem('zahzan_token')
  }

  // Fetch products from backend API
  useEffect(() => {
    fetch(`${API_BASE}/products`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.products)) {
          setProducts(data.products)
        }
      })
      .catch((err) => console.error('Failed to fetch wishlist products:', err))
  }, [])

  // Fetch user wishlist from backend if authenticated; clear if not
  const fetchWishlist = useCallback(async () => {
    const token = getAuthToken()
    if (!token) {
      setWishlistIds([])
      return
    }

    try {
      const res = await fetch(`${API_BASE}/users/me/wishlist`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.wishlist)) {
          setWishlistIds(data.wishlist)
        }
      } else if (res.status === 401) {
        setWishlistIds([])
      }
    } catch (err) {
      console.error('Failed to fetch wishlist:', err)
      setWishlistIds([])
    }
  }, [])

  useEffect(() => {
    fetchWishlist()

    const handleStorageChange = () => {
      fetchWishlist()
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [fetchWishlist])

  const openWishlist = () => setIsWishlistOpen(true)
  const closeWishlist = () => setIsWishlistOpen(false)
  const toggleWishlistDrawer = () => setIsWishlistOpen((prev) => !prev)

  const toggleWishlist = async (productId) => {
    const token = getAuthToken()

    if (token) {
      try {
        const res = await fetch(`${API_BASE}/users/me/wishlist`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ productId })
        })

        const data = await res.json()
        if (res.ok && data.success && Array.isArray(data.wishlist)) {
          setWishlistIds(data.wishlist)
        }
      } catch (err) {
        console.error('Failed to toggle wishlist item:', err)
      }
    } else {
      // Local state fallback for unauthenticated guest session
      setWishlistIds((prev) => {
        const idStr = String(productId)
        const exists = prev.some((id) => String(id) === idStr)
        if (exists) {
          return prev.filter((id) => String(id) !== idStr)
        } else {
          return [...prev, productId]
        }
      })
    }
  }

  const isInWishlist = (productId) => {
    const idStr = String(productId)
    return wishlistIds.some((id) => String(id) === idStr)
  }

  const wishlistProducts = products.filter((p) => {
    const pId = String(p.id || p._id)
    return wishlistIds.some((id) => String(id) === pId)
  })

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
        isInWishlist,
        fetchWishlist
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
