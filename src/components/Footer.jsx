import { ArrowRight } from 'lucide-react'

const columns = [
  {
    title: 'Shop',
    links: ['New In', 'Ready to Wear', 'Unstitched', 'Luxury', 'Accessories']
  },
  {
    title: 'Help',
    links: ['Contact Us', 'Shipping', 'Returns & Exchanges', 'FAQs', 'Track Order']
  },
  {
    title: 'About',
    links: ['Our Story', 'Our Craft', 'Journal']
  },
  {
    title: 'Social',
    links: ['Instagram', 'Facebook', 'TikTok']
  }
]

export default function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-stone-950 px-4 py-16 text-stone-300 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
        <div>
          <p className="text-[11px] uppercase tracking-[0.35em] text-stone-500">Aurélia</p>
          <h2 className="mt-3 text-2xl font-semibold uppercase tracking-[0.2em] text-white">Modern Pakistani fashion, thoughtfully crafted.</h2>
          <div className="mt-6 flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-stone-400">
            <span>Newsletter</span>
            <ArrowRight size={14} />
          </div>
          <div className="mt-6 text-sm text-stone-400">
            <p>Accepted payments</p>
            <p className="mt-2 uppercase tracking-[0.25em]">Bank Transfer • Cash on Delivery • Cards</p>
          </div>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <h3 className="text-sm font-medium uppercase tracking-[0.3em] text-white">{column.title}</h3>
            <ul className="mt-4 space-y-3 text-sm text-stone-400">
              {column.links.map((link) => (
                <li key={link} className="transition hover:text-white">{link}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-3 border-t border-stone-800 pt-6 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 Aurélia. All rights reserved.</p>
        <div className="flex gap-4">
          <a href="/" className="transition hover:text-white">Privacy Policy</a>
          <a href="/" className="transition hover:text-white">Terms & Conditions</a>
        </div>
      </div>
    </footer>
  )
}
