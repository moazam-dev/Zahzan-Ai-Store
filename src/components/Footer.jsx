import { useState } from 'react'

export default function Footer() {
  const [activeModal, setActiveModal] = useState(null)

  const navGroups = [
    {
      title: 'SHOP',
      links: [
        { label: 'The First Edit', href: '/collections' },
        { label: 'Try It On', href: '#try-on' }
      ]
    },
    {
      title: 'DISCOVER',
      links: [
        { label: 'Our Story', href: '#our-story' },
        { label: 'The Piece', href: '#new-arrivals' },
        { label: 'Worn & Loved', href: '#worn-and-loved' }
      ]
    },
    {
      title: 'HELP',
      links: [
        { label: 'Shipping', href: '#shipping', isModal: true },
        { label: 'Returns', href: '#returns', isModal: true },
        { label: 'Contact', href: '#contact', isModal: true }
      ]
    }
  ]

  const socialLinks = [
    { label: 'Instagram', href: 'https://instagram.com' },
    { label: 'TikTok', href: 'https://tiktok.com' }
  ]

  return (
    <footer className="relative bg-[#faf8f5] text-[#1c1b18] pt-12 pb-10 px-4 sm:px-8 lg:px-12">
      
      {/* MAIN FOOTER CONTAINER */}
      <div className="mx-auto max-w-7xl">
        
        {/* TOP LAYOUT: BRAND + ESSENTIAL NAVIGATION + SOCIAL */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-12 pb-14 border-b border-[#e8e4dc]">
          
          {/* BRAND STATEMENT COLUMN (4 cols) */}
          <div className="md:col-span-4 flex flex-col justify-between">
            <div>
              <h3 className="font-serif text-3xl sm:text-4xl font-light tracking-[0.25em] text-[#1a1918]">
                ZAHZAN
              </h3>
              <p className="mt-3 text-xs sm:text-sm text-[#706c64] font-light leading-relaxed max-w-xs">
                Modern Pakistani clothing,<br />
                made with intention.
              </p>
            </div>

            {/* Subtle Editorial Handwritten Note */}
            <div className="mt-8 pt-4">
              <span className="font-serif italic text-sm text-[#706c64]/80 tracking-wide">
                Until next time.
              </span>
            </div>
          </div>

          {/* ESSENTIAL NAVIGATION GROUPS (6 cols) */}
          <div className="md:col-span-5 grid grid-cols-3 gap-6 sm:gap-8">
            {navGroups.map((group) => (
              <div key={group.title}>
                <h4 className="text-[10px] uppercase tracking-[0.3em] font-medium text-[#5a5e4b] mb-4">
                  {group.title}
                </h4>
                <ul className="space-y-3 text-xs text-[#2c2a26] font-light">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      {link.isModal ? (
                        <button 
                          onClick={() => setActiveModal(link.label)}
                          className="transition duration-300 hover:text-[#5a5e4b] hover:underline underline-offset-4 focus:outline-none"
                        >
                          {link.label}
                        </button>
                      ) : (
                        <a 
                          href={link.href} 
                          className="transition duration-300 hover:text-[#5a5e4b] hover:underline underline-offset-4"
                        >
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* SOCIAL LINKS (3 cols) */}
          <div className="md:col-span-3 flex flex-col justify-start">
            <h4 className="text-[10px] uppercase tracking-[0.3em] font-medium text-[#5a5e4b] mb-4">
              FOLLOW THE JOURNEY
            </h4>
            <div className="flex flex-col space-y-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-1.5 text-xs text-[#2c2a26] font-light transition hover:text-[#5a5e4b]"
                >
                  <span className="group-hover:underline underline-offset-4">{social.label}</span>
                  <span className="text-[11px] transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 text-[#5a5e4b]">
                    ↗
                  </span>
                </a>
              ))}
            </div>
          </div>

        </div>

        {/* EMOTIONAL BRAND STATEMENT */}
        <div className="py-12 text-center">
          <p className="font-serif italic text-2xl sm:text-4xl font-light text-[#1a1918] tracking-tight leading-relaxed">
            "Designed here. Worn everywhere."
          </p>
        </div>

        {/* BOTTOM FOOTER BAR */}
        <div className="pt-6 border-t border-[#e8e4dc]/70 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[#706c64] font-light tracking-wider">
          <div>
            © 2026 ZAHZAN
          </div>

          <div className="flex items-center gap-4">
            <button onClick={() => setActiveModal('Privacy')} className="hover:text-[#1a1918] transition">
              Privacy
            </button>
            <span>·</span>
            <button onClick={() => setActiveModal('Terms')} className="hover:text-[#1a1918] transition">
              Terms
            </button>
          </div>

          <div className="font-mono text-[10px] tracking-[0.25em] text-[#5a5e4b] uppercase">
            PAKISTAN
          </div>
        </div>

      </div>

      {/* HELP & LEGAL MODAL */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[#faf8f5] rounded-2xl border border-[#e8e4dc] p-6 sm:p-8 max-w-md w-full relative shadow-2xl">
            <button 
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 h-8 w-8 rounded-full border border-[#e8e4dc] text-[#706c64] flex items-center justify-center hover:bg-[#1a1918] hover:text-white transition"
            >
              ✕
            </button>
            
            <h4 className="font-serif text-2xl text-[#1a1918] font-light">
              {activeModal}
            </h4>

            <div className="mt-4 text-xs text-[#706c64] font-light leading-relaxed space-y-3">
              {activeModal === 'Shipping' && (
                <p>We deliver nationwide across Pakistan within 3–5 business days. International express shipping is available worldwide.</p>
              )}
              {activeModal === 'Returns' && (
                <p>Complimentary 14-day returns and exchanges for unstitched and ready-to-wear pieces in original condition with tags attached.</p>
              )}
              {activeModal === 'Contact' && (
                <p>Our client care team is available Monday through Saturday. Email us at concierge@zahzan.com or WhatsApp +92 300 0000000.</p>
              )}
              {activeModal === 'Privacy' && (
                <p>Your privacy is respected. We protect your personal data and never share details with unauthorized third parties.</p>
              )}
              {activeModal === 'Terms' && (
                <p>All items are crafted in limited quantities. Prices and availability are subject to order confirmation.</p>
              )}
            </div>

            <button 
              onClick={() => setActiveModal(null)}
              className="mt-6 w-full py-2.5 bg-[#1a1918] text-white text-xs uppercase tracking-[0.2em] rounded-full hover:bg-[#5a5e4b] transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </footer>
  )
}
