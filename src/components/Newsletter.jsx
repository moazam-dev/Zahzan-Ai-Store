import { useState, useEffect, useRef } from 'react'

export default function Newsletter() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true)
      },
      { threshold: 0.15 }
    )

    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (email) {
      setSubmitted(true)
    }
  }

  return (
    <section 
      ref={sectionRef}
      className="relative bg-[#faf8f5] text-[#1c1b18] pt-20 pb-16 sm:pt-28 sm:pb-20 px-4 sm:px-8 lg:px-12 border-t border-[#e8e4dc]"
      id="stay-in-the-story"
    >
      {/* Subtle Background Radial Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#e5dfd5_1px,transparent_1px)] [background-size:32px_32px] opacity-25 pointer-events-none" />

      <div className="mx-auto max-w-7xl relative z-10">
        <div className={`grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] transform ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
        }`}>
          
          {/* LEFT COLUMN: EDITORIAL COPY & MINIMAL FORM (7 cols on desktop) */}
          <div className="lg:col-span-7 flex flex-col justify-center">
            
            {/* Editorial Label */}
            <div className="flex items-center gap-3 mb-4">
              <span className="h-[1px] w-6 bg-[#5a5e4b]/50" />
              <span className="text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.4em] text-[#5a5e4b]">
                STAY IN THE STORY
              </span>
            </div>

            {/* Large Elegant Serif Heading */}
            <h2 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-[#1a1918] leading-[1.08]">
              BE THE FIRST<br />
              <span className="italic font-normal">TO KNOW.</span>
            </h2>

            {/* Short Refined Copy */}
            <p className="mt-4 text-xs sm:text-sm text-[#706c64] font-light leading-relaxed tracking-wide max-w-lg">
              New pieces, quiet moments, and stories from Zahzan — delivered occasionally.
            </p>

            {/* MINIMAL EDITORIAL FORM */}
            {!submitted ? (
              <form onSubmit={handleSubmit} className="mt-10 max-w-lg">
                <div className="relative flex items-center border-b border-[#1a1918]/30 transition-colors duration-300 focus-within:border-[#1a1918] pb-1">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="YOUR EMAIL ADDRESS"
                    className="w-full bg-transparent py-2 text-xs sm:text-sm tracking-[0.2em] uppercase text-[#1a1918] placeholder:text-[#706c64]/50 focus:outline-none font-sans"
                  />
                  <button
                    type="submit"
                    className="group inline-flex items-center gap-2 shrink-0 py-2 text-xs font-medium uppercase tracking-[0.25em] text-[#1a1918] transition hover:text-[#5a5e4b] focus:outline-none"
                  >
                    <span>JOIN THE JOURNEY</span>
                    <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                  </button>
                </div>

                {/* Microcopy under form */}
                <div className="mt-3 flex items-center justify-between text-[11px] text-[#706c64] font-light tracking-wide">
                  <span>Thoughtful updates. Nothing more.</span>
                  <span className="font-serif italic text-xs text-[#5a5e4b]">Only what is worth knowing.</span>
                </div>
              </form>
            ) : (
              <div className="mt-8 p-6 rounded-xl border border-[#5a5e4b]/30 bg-white/60 max-w-lg transition-all duration-500">
                <p className="text-xs uppercase tracking-[0.25em] text-[#5a5e4b] font-medium">
                  ✓ WELCOME TO THE JOURNEY
                </p>
                <p className="mt-2 text-xs sm:text-sm text-[#2c2a26] font-light leading-relaxed">
                  Thank you for subscribing. You will receive our quiet editorial updates directly in your inbox.
                </p>
              </div>
            )}

          </div>

          {/* RIGHT COLUMN: SMALL VERTICAL EDITORIAL DETAIL PHOTOGRAPH (5 cols on desktop) */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="relative w-full max-w-xs sm:max-w-sm aspect-[3/4] overflow-hidden rounded-xl bg-[#f0ede6] border border-[#e8e4dc] shadow-md group">
              <img
                src="/images/editorial_detail.jpg"
                alt="Close-up photograph of Pakistani embroidery detail"
                className="h-full w-full object-cover object-center transition-transform duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
              
              {/* Image Floating Editorial Overlay */}
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white text-[10px] uppercase tracking-[0.25em] font-light">
                <span>Hand Artistry Detail</span>
                <span className="font-mono">Fig. 4.0</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
