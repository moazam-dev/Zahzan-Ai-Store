'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const CartContext = createContext()

const API_BASE = '/api'

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const openCart = () => setIsCartOpen(true)
  const closeCart = () => setIsCartOpen(false)
  const toggleCart = () => setIsCartOpen((prev) => !prev)

  const getAuthToken = () => {
    return localStorage.getItem('zahzan_token')
  }

  // Fetch cart from backend if user is authenticated
  const fetchCart = useCallback(async () => {
    const token = getAuthToken()
    if (!token) {
      setCartItems([])
      return
    }

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
    fetchCart()

    const handleStorageChange = () => {
      fetchCart()
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [fetchCart])

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
