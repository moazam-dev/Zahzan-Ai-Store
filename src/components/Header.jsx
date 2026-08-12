import { useState } from 'react'
import { Menu, Search, ShoppingCart, Heart, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import pkrIcon from '../assets/PKR.png'
import logo from '../assets/logo.png'

const links = [
  { name: 'New In', path: '/collections' },
  { name: 'Collections', path: '/collections' },
  { name: 'Ready to Wear', path: '/shop' },
  { name: 'Unstitched', path: '/shop' },
  { name: 'Luxury', path: '/shop' },
  { name: 'About', path: '/collections' }
]

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="absolute inset-x-0 top-0 z-50 bg-transparent">
      <div className="mx-auto flex max-w-7xl items-center justify-center px-2 py-3 sm:px-3 lg:px-4">
        <Link to="/" className="text-lg font-semibold uppercase tracking-[0.35em] text-black sm:text-xl">
          <img src={logo} alt="PKR" className="h-15 w-auto object-contain" />
        </Link>
        <div className="absolute left-3 top-1/2 flex items-center gap-2 -translate-y-1/2 sm:left-4">
          <button type="button" className="p-2 text-black transition-transform duration-150 hover:scale-105" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>
          <button type="button" className="p-2 text-black transition-transform  duration-150 hover:scale-105">
            <Search size={18} />
          </button>
        </div>
        <div className="absolute right-3 top-1/2 flex items-center gap-2 -translate-y-1/2 sm:right-4">
          <button type="button" className="p-2 text-black transition-transform duration-150 hover:scale-105">
            <Heart size={18} />
          </button>
          <button type="button" className="p-2 text-black transition-transform duration-150 hover:scale-105">
            <ShoppingCart size={18} />
          </button>
          <button type="button" className="p-2 text-black transition-transform duration-150 hover:scale-105">
            <img src={pkrIcon} alt="PKR" className="h-5 w-5 object-contain" />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-[60] bg-stone-950/70 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="ml-auto flex h-full w-4/5 max-w-sm flex-col bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-8 flex items-center justify-between">
              <span className="text-sm uppercase tracking-[0.3em] text-stone-900">Menu</span>
              <button type="button" className="rounded-full p-2 text-stone-700 transition hover:bg-stone-100" onClick={() => setMobileOpen(false)}>
                ×
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-4 text-base uppercase tracking-[0.28em] text-stone-700">
              {links.map((link) => (
                <Link key={link.name} to={link.path} className="border-b border-stone-200 py-3 transition hover:text-stone-950" onClick={() => setMobileOpen(false)}>
                  {link.name}
                </Link>
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm text-stone-600">Private edits and early access to new releases.</p>
              <Link to="/collections" className="mt-3 inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.25em] text-stone-900" onClick={() => setMobileOpen(false)}>
                Discover more <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
