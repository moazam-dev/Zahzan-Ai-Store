import './globals.css'
import { WishlistProvider } from '../context/WishlistContext'
import { CartProvider } from '../context/CartContext'
import CartDrawer from '../components/CartDrawer'
import WishlistDrawer from '../components/WishlistDrawer'

export const metadata = {
  title: 'zahzan-ai-store',
  icons: {
    icon: { url: '/favicon.svg', type: 'image/svg+xml' }
  }
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <WishlistProvider>
          <CartProvider>
            {children}

            {/* Customer Storefront Drawers */}
            <CartDrawer />
            <WishlistDrawer />
          </CartProvider>
        </WishlistProvider>
      </body>
    </html>
  )
}
