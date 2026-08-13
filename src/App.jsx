import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Shop from './pages/Shop'
import Product from './pages/Product'
import Collections from './pages/Collections'
import Account from './pages/Account'

// Admin Pages
import AdminLogin from './pages/admin/AdminLogin'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminOrders from './pages/admin/AdminOrders'
import AdminPayments from './pages/admin/AdminPayments'
import AdminProducts from './pages/admin/AdminProducts'
import AdminCustomers from './pages/admin/AdminCustomers'
import AdminNewsletter from './pages/admin/AdminNewsletter'
import AdminAuditLogs from './pages/admin/AdminAuditLogs'

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
            {/* Storefront Routes (Frozen UI) */}
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/product/:id" element={<Product />} />
            <Route path="/collections" element={<Collections />} />
            <Route path="/account" element={<Account />} />

            {/* Separate Admin Panel Routes */}
            <Route path="/admin" element={<AdminLogin />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/orders" element={<AdminOrders />} />
            <Route path="/admin/payments" element={<AdminPayments />} />
            <Route path="/admin/products" element={<AdminProducts />} />
            <Route path="/admin/customers" element={<AdminCustomers />} />
            <Route path="/admin/newsletter" element={<AdminNewsletter />} />
            <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
          </Routes>

          {/* Customer Storefront Drawers */}
          <CartDrawer />
          <WishlistDrawer />
        </BrowserRouter>
      </CartProvider>
    </WishlistProvider>
  )
}

export default App
