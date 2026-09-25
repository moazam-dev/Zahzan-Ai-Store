'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const CartContext = createContext()

const API_BASE = '/api'

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // True once the first cart read has finished, so the persistence effect
  // below never writes an empty cart over a stored one during hydration.
  const [guestCartHydrated, setGuestCartHydrated] = useState(false)

  const openCart = () => setIsCartOpen(true)
  const closeCart = () => setIsCartOpen(false)
  const toggleCart = () => setIsCartOpen((prev) => !prev)

  const getAuthToken = () => {
    return localStorage.getItem('zahzan_token')
  }

  // ---------------------------------------------------------------------
  // Guest cart persistence (guest checkout, 2026-08-20)
  //
  // A signed-out shopper's cart used to live in React state alone, so it
  // vanished on every refresh. That was survivable while checkout required an
  // account -- the cart was a preview and the real one lived on the server --
  // but now that a guest can actually order, a cart lost to a refresh is a
  // lost order. It is persisted to localStorage instead, and merged into the
  // server cart the first time the shopper signs in.
  //
  // Only identifying fields plus display copies are stored. Nothing here is
  // trusted at checkout: the order route re-reads price, name and stock from
  // the products table, so a hand-edited localStorage cart cannot change what
  // someone is charged.
  // ---------------------------------------------------------------------
  const GUEST_CART_KEY = 'zahzan_guest_cart'

  const readGuestCart = () => {
    try {
      const raw = localStorage.getItem(GUEST_CART_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      // Corrupt or unreadable (private mode, quota, hand-edited) -- an empty
      // cart is a safe answer; never throw out of the cart provider.
      return []
    }
  }

  const writeGuestCart = (items) => {
    try {
      localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items))
    } catch {
      /* storage unavailable or full -- the in-memory cart still works */
    }
  }

  const clearGuestCart = () => {
    try {
      localStorage.removeItem(GUEST_CART_KEY)
    } catch {
      /* ignore */
    }
  }

  /**
   * Pushes a stored guest cart into the newly signed-in customer's server
   * cart, then forgets it. Runs from fetchCart, so it happens on the first
   * cart read after login without every login path (email, register, Google,
   * Facebook) needing to know about it.
   *
   * Failures are swallowed per line on purpose: a line that no longer fits
   * (product deactivated, size sold out) must not block the rest of the cart
   * or the sign-in itself. The server is the authority on what may be added.
   */
  const mergeGuestCartIntoServer = async (token) => {
    const guestItems = readGuestCart()
    if (guestItems.length === 0) return

    // Cleared FIRST so a failure mid-merge cannot replay the same lines on the
    // next call and silently double someone's quantities.
    clearGuestCart()

    for (const item of guestItems) {
      try {
        await fetch(`${API_BASE}/cart/items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            productId: item.productId || item.id,
            quantity: item.quantity,
            selectedSize: item.size,
            selectedColor: item.color || ''
          })
        })
      } catch (err) {
        console.error('Failed to merge a guest cart line:', err)
      }
    }
  }

  // Fetch cart from backend if user is authenticated
  const fetchCart = useCallback(async () => {
    const token = getAuthToken()
    if (!token) {
      // Signed out: the guest cart IS the cart. This used to clear it, which
      // is what made a refresh empty the basket.
      setCartItems(readGuestCart())
      return
    }

    await mergeGuestCartIntoServer(token)

    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/cart`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (res.ok) {
        const data = await res.json()
        if (data.success && data.cart) {
          setCartItems(data.cart.items || [])
        }
      } else if (res.status === 401) {
        // Token invalid / expired
        setCartItems([])
      }
    } catch (err) {
      console.error('Error fetching cart:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch cart on mount and listen for storage changes (e.g. login/logout in another tab/component)
  useEffect(() => {
    fetchCart().finally(() => setGuestCartHydrated(true))

    const handleStorageChange = () => {
      fetchCart()
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [fetchCart])

  // Persist the guest cart on every change (guest checkout, 2026-08-20).
  //
  // Gated on `guestCartHydrated` so the very first render -- when cartItems is
  // still the initial [] and localStorage has not been read yet -- cannot
  // write an empty array over a cart the shopper left behind earlier. Only
  // runs while signed out; a signed-in customer's cart lives on the server.
  useEffect(() => {
    if (!guestCartHydrated) return
    if (getAuthToken()) return
    writeGuestCart(cartItems)
  }, [cartItems, guestCartHydrated])

  // Add item to cart
  const addToCart = async (product, size = 'M', color = '', quantity = 1) => {
    const productId = product._id || product.id
    const selectedSize = size || product.sizes?.[0] || 'M'
    const token = getAuthToken()

    if (token) {
      try {
        setLoading(true)
        const res = await fetch(`${API_BASE}/cart/items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            productId,
            quantity,
            selectedSize,
            selectedColor: color
          })
        })

        const data = await res.json()
        if (res.ok && data.success) {
          setCartItems(data.cart.items || [])
          setError(null)
          openCart()
        } else {
          alert(data.message || 'Failed to add product to cart.')
        }
      } catch (err) {
        console.error('Failed to add to cart:', err)
        alert('Network error adding to cart.')
      } finally {
        setLoading(false)
      }
    } else {
      // Unauthenticated local state fallback
      setCartItems((prevItems) => {
        const existingIndex = prevItems.findIndex(
          (item) => (item.id === productId || item.productId === productId) && item.size === selectedSize
        )
        if (existingIndex > -1) {
          const updated = [...prevItems]
          const currentQty = updated[existingIndex].quantity
          if (product.stock && currentQty + quantity > product.stock) {
            alert(`Cannot add more items. Available stock is ${product.stock}.`)
            return prevItems
          }
          updated[existingIndex].quantity += quantity
          return updated
        }
        return [
          ...prevItems,
          {
            id: productId,
            productId: productId,
            name: product.name,
            price: product.price,
            category: product.category,
            image: product.images?.[0] || product.image,
            size: selectedSize,
            quantity: quantity,
            stock: product.stock
          }
        ]
      })
      openCart()
    }
  }

  // Remove item from cart
  const removeFromCart = async (id, size) => {
    const token = getAuthToken()

    if (token) {
      try {
        setLoading(true)
        const query = size ? `?size=${encodeURIComponent(size)}` : ''
        const res = await fetch(`${API_BASE}/cart/items/${id}${query}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        const data = await res.json()
        if (res.ok && data.success) {
          setCartItems(data.cart.items || [])
        }
      } catch (err) {
        console.error('Failed to remove item:', err)
      } finally {
        setLoading(false)
      }
    } else {
      setCartItems((prevItems) =>
        prevItems.filter((item) => !((item.id === id || item.productId === id) && item.size === size))
      )
    }
  }

  // Update item quantity
  const updateQuantity = async (id, size, delta) => {
    const token = getAuthToken()

    if (token) {
      try {
        setLoading(true)
        const res = await fetch(`${API_BASE}/cart/items/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            delta,
            selectedSize: size
          })
        })

        const data = await res.json()
        if (res.ok && data.success) {
          setCartItems(data.cart.items || [])
        } else {
          alert(data.message || 'Failed to update item quantity.')
        }
      } catch (err) {
        console.error('Failed to update quantity:', err)
      } finally {
        setLoading(false)
      }
    } else {
      setCartItems((prevItems) =>
        prevItems
          .map((item) => {
            if ((item.id === id || item.productId === id) && item.size === size) {
              const newQty = item.quantity + delta
              if (item.stock && newQty > item.stock) {
                alert(`Cannot add more items. Available stock is ${item.stock}.`)
                return item
              }
              return newQty > 0 ? { ...item, quantity: newQty } : null
            }
            return item
          })
          .filter(Boolean)
      )
    }
  }

  // Clear cart
  const clearCart = async () => {
    const token = getAuthToken()

    if (token) {
      try {
        setLoading(true)
        const res = await fetch(`${API_BASE}/cart`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
        if (res.ok) {
          setCartItems([])
        }
      } catch (err) {
        console.error('Failed to clear cart:', err)
      } finally {
        setLoading(false)
      }
    } else {
      setCartItems([])
    }
  }

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const cartTotal = cartItems.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0)

  return (
    <CartContext.Provider
      value={{
        cartItems,
        isCartOpen,
        openCart,
        closeCart,
        toggleCart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartCount,
        cartTotal,
        fetchCart,
        loading,
        error
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
