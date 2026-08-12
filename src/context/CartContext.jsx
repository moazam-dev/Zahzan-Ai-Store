import { createContext, useContext, useState, useEffect } from 'react'

const CartContext = createContext()

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([
    {
      id: 1,
      name: 'Ivory Bloom',
      price: 18900,
      category: 'Lawn',
      image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
      size: 'M',
      quantity: 1
    },
    {
      id: 2,
      name: 'Noor',
      price: 21400,
      category: 'Ready to Wear',
      image: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80',
      size: 'S',
      quantity: 1
    }
  ])
  const [isCartOpen, setIsCartOpen] = useState(false)

  const openCart = () => setIsCartOpen(true)
  const closeCart = () => setIsCartOpen(false)
  const toggleCart = () => setIsCartOpen((prev) => !prev)

  const addToCart = (product, size = 'M') => {
    setCartItems((prevItems) => {
      const existingIndex = prevItems.findIndex(
        (item) => item.id === product.id && item.size === size
      )
      if (existingIndex > -1) {
        const updated = [...prevItems]
        updated[existingIndex].quantity += 1
        return updated
      }
      return [
        ...prevItems,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          category: product.category,
          image: product.image,
          size: size || product.sizes?.[0] || 'M',
          quantity: 1
        }
      ]
    })
    openCart()
  }

  const removeFromCart = (id, size) => {
    setCartItems((prevItems) =>
      prevItems.filter((item) => !(item.id === id && item.size === size))
    )
  }

  const updateQuantity = (id, size, delta) => {
    setCartItems((prevItems) =>
      prevItems
        .map((item) => {
          if (item.id === id && item.size === size) {
            const newQty = item.quantity + delta
            return newQty > 0 ? { ...item, quantity: newQty } : null
          }
          return item
        })
        .filter(Boolean)
    )
  }

  const clearCart = () => setCartItems([])

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)

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
        cartTotal
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
