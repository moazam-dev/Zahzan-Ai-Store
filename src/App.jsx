import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Shop from './pages/Shop'
import Product from './pages/Product'
import Collections from './pages/Collections'
import { CartProvider } from './context/CartContext'
import { WishlistProvider } from './context/WishlistContext'
import CartDrawer from './components/CartDrawer'
import WishlistDrawer from './components/WishlistDrawer'

function App() {
  return (
    <WishlistProvider>
      <CartProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/product/:id" element={<Product />} />
            <Route path="/collections" element={<Collections />} />
          </Routes>
          <CartDrawer />
          <WishlistDrawer />
        </BrowserRouter>
      </CartProvider>
    </WishlistProvider>
  )
}

export default App
