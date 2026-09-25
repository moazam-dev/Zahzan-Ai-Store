'use client'

import { useState } from 'react'
import { Menu, Search, ShoppingCart, Heart, User } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
const logo = '/images/logo.png'
import UniversalNavMenu from './UniversalNavMenu'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'

export default function Header({ variant }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [menuInitialView, setMenuInitialView] = useState('nav') // 'nav' | 'search'
  const { openCart, cartCount, closeCart } = useCart()
  const { openWishlist, closeWishlist } = useWishlist()
  const pathname = usePathname()

  // On Home page ("/"), navbar stays absolute transparent over Hero.
  // On all other pages, navbar flows relatively under AnnouncementBar without collapsing.
  const isHomePage = variant ? variant === 'absolute' : pathname === '/'

  // Over the hero the bar is transparent, so its controls invert to white.
  // On the light header of every other page they stay black.
  const controlColor = isHomePage ? 'text-white' : 'text-black'
  const logoSrc = isHomePage ? '/images/logo-white.png' : logo

  const openNav = () => {
    closeCart()
    closeWishlist()
    setMenuInitialView('nav')
    setIsMenuOpen(true)
  }

  const openSearch = () => {
    closeCart()
    closeWishlist()
    setMenuInitialView('search')
    setIsMenuOpen(true)
  }

  const handleOpenCart = () => {
    setIsMenuOpen(false)
    closeWishlist()
    openCart()
  }

  const handleOpenWishlist = () => {
    setIsMenuOpen(false)
    closeCart()
    openWishlist()
  }

  // Navigating away is not the same as opening a sibling overlay: any drawer
  // left open would sit on top of the account page, and CartDrawer holds
  // document.body.style.overflow = 'hidden' while it is open, which would
  // leave the page unscrollable.
  const handleCloseOverlays = () => {
    setIsMenuOpen(false)
    closeCart()
    closeWishlist()
  }

  return (
    <header className={isHomePage ? "absolute inset-x-0 top-0 z-50 bg-transparent" : "relative w-full z-50 bg-[#faf8f5] border-b border-[#e8e4dc]"}>
      <div className="mx-auto flex max-w-7xl items-center justify-center px-2 py-2 sm:px-3 lg:px-4">
        
        {/* CENTER BRAND LOGO */}
        <Link href="/" scroll={false} className="text-lg font-semibold uppercase tracking-[0.35em] text-black sm:text-xl">
          <img src={logoSrc} alt="ZAHZAN" className="h-14 sm:h-16 w-auto object-contain" />
        </Link>

        {/* LEFT UTILITY CONTROLS: MENU & SEARCH */}
        <div className="absolute left-3 top-1/2 flex items-center gap-1 sm:gap-2 -translate-y-1/2 sm:left-4">
          <button 
            type="button" 
            onClick={openNav}
            className={`p-2 ${controlColor} transition-transform duration-150 hover:scale-105 cursor-pointer flex items-center gap-1.5`}
            aria-label="Open Navigation Menu"
          >
            <Menu size={20} />
            <span className={`hidden sm:inline-block text-[11px] font-sans uppercase tracking-[0.25em] font-medium ${controlColor}`}>
              MENU
            </span>
          </button>

          <button 
            type="button" 
            onClick={openSearch}
            className={`p-2 ${controlColor} transition-transform duration-150 hover:scale-105 cursor-pointer`}
            aria-label="Search Collection"
          >
            <Search size={18} />
          </button>
        </div>

        {/* RIGHT UTILITY CONTROLS: WISHLIST, BAG, ACCOUNT */}
        <div className="absolute right-3 top-1/2 flex items-center gap-1 sm:gap-2 -translate-y-1/2 sm:right-4">
          <button 
            type="button" 
            onClick={handleOpenWishlist}
            className={`p-2 ${controlColor} transition-transform duration-150 hover:scale-105 cursor-pointer`}
            aria-label="Open Wishlist"
          >
            <Heart size={18} className={`${controlColor} stroke-[1.5]`} />
          </button>

          <button 
            type="button" 
            onClick={handleOpenCart}
            className={`p-2 ${controlColor} transition-transform duration-150 hover:scale-105 cursor-pointer relative`}
            aria-label="Shopping Bag"
          >
            <ShoppingCart size={18} />
            {cartCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#5a5e4b] text-[9px] font-mono text-white font-medium">
                {cartCount}
              </span>
            )}
          </button>

          {/* scroll={false} matches every other navigation site in the app
              (Ruling B3): react-router never reset scroll position on
              navigate, and Next's default does. */}
          <Link
            href="/account"
            scroll={false}
            onClick={handleCloseOverlays}
            className={`p-2 ${controlColor} transition-transform duration-150 hover:scale-105 cursor-pointer inline-flex items-center`}
            aria-label="Account"
          >
            <User size={18} className={`${controlColor} stroke-[1.5]`} />
          </Link>
        </div>

      </div>

      {/* UNIVERSAL NAVIGATION MENU SYSTEM */}
      <UniversalNavMenu 
        isOpen={isMenuOpen} 
        onClose={() => setIsMenuOpen(false)} 
        initialView={menuInitialView} 
      />
    </header>
  )
}
