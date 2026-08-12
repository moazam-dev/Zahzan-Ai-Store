import { useState, useEffect, useRef } from 'react'
import { reviews } from '../data/reviews'

export default function ReviewCarousel() {
  const [activeIndex, setActiveIndex] = useState(1) // Default center on 2nd post
  const [likedPosts, setLikedPosts] = useState({})
  const [likeCounts, setLikeCounts] = useState(() => {
    const initial = {}
    reviews.forEach(r => { initial[r.id] = r.likes })
    return initial
  })
  const [isVisible, setIsVisible] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [shareSubmitted, setShareSubmitted] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  
  // Touch swipe support
  const [touchStart, setTouchStart] = useState(0)
  const [touchEnd, setTouchEnd] = useState(0)

  const sectionRef = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true)
      },
      { threshold: 0.1 }
    )

    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  const handlePrev = () => {
    setActiveIndex((prev) => (prev === 0 ? reviews.length - 1 : prev - 1))
  }

  const handleNext = () => {
    setActiveIndex((prev) => (prev === reviews.length - 1 ? 0 : prev + 1))
  }

  const toggleLike = (id) => {
    setLikedPosts((prev) => {
      const isLiked = !!prev[id]
      const newLiked = { ...prev, [id]: !isLiked }
      setLikeCounts((counts) => ({
        ...counts,
        [id]: counts[id] + (isLiked ? -1 : 1)
      }))
      return newLiked
    })
  }

  const handleShareClick = (id) => {
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2500)
  }

  const handleTouchStart = (e) => {
    setTouchStart(e.targetTouches[0].clientX)
  }

  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > 50
    const isRightSwipe = distance < -50

    if (isLeftSwipe) handlePrev()
    if (isRightSwipe) handleNext()

    setTouchStart(0)
    setTouchEnd(0)
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') handlePrev()
      if (e.key === 'ArrowRight') handleNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <section 
      ref={sectionRef}
      className="relative bg-[#faf8f5] text-[#1c1b18] py-8 sm:py-10 lg:py-12 px-4 sm:px-6 lg:px-8   overflow-hidden"
      id="worn-and-loved"
    >
      {/* Subtle Warm Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#e5dfd5_1px,transparent_1px)] [background-size:28px_28px] opacity-30 pointer-events-none" />

      <div className="mx-auto max-w-7xl relative z-10">

        {/* -------------------------------------------------- */}
        {/* SECTION INTRODUCTION */}
        {/* -------------------------------------------------- */}

        <div className={`flex flex-col md:flex-row md:items-end justify-between gap-8 transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] transform ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
        }`}>
          {/* Left Intro Content */}
          <div className="text-left max-w-xl">
            <span className="text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.4em] text-[#5a5e4b]">
              CLIENT MEMOIRS & STYLING
            </span>

            <h2 className="mt-3 font-serif text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-[#1a1918] leading-[1.08]">
              WORN & LOVED
            </h2>

            <p className="mt-3 text-sm sm:text-base font-sans text-[#706c64] font-light tracking-wide">
              Seen on you. Loved by many.
            </p>
          </div>

          {/* Right Share Your Look Content */}
          <div className="text-left md:text-right">
            <p className="font-serif italic text-2xl sm:text-3xl text-[#1a1918] font-light">
              Your story could be next.
            </p>

            <button 
              onClick={() => setIsShareModalOpen(true)}
              className="mt-5 group inline-flex items-center gap-3 text-xs uppercase tracking-[0.3em] font-medium text-[#1a1918] py-2.5 px-7 border border-[#1a1918] rounded-full transition-all duration-300 hover:bg-[#1a1918] hover:text-white cursor-pointer"
            >
              <span>SHARE YOUR LOOK</span>
              <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </button>

            <p className="mt-3 text-[11px] text-[#706c64] font-light">
              Tag us <span className="font-medium text-[#1a1918]">@zahzan.official</span> or use <span className="font-mono text-[#5a5e4b]">#WornAndLoved</span> to be featured.
            </p>
          </div>
        </div>

        {/* -------------------------------------------------- */}
        {/* MAIN CAROUSEL */}
        {/* -------------------------------------------------- */}
        <div className="mt-12 sm:mt-16 relative">
          
          {/* CAROUSEL CARDS WRAPPER */}
          <div 
            className="touch-pan-y"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Desktop & Tablet Carousel View */}
            <div className="hidden md:grid md:grid-cols-3 gap-6 lg:gap-8 items-center min-h-[580px] px-2 py-4">
              {[-1, 0, 1].map((offset) => {
                const index = (activeIndex + offset + reviews.length) % reviews.length
                const post = reviews[index]
                const isActive = offset === 0
                const isLiked = !!likedPosts[post.id]

                return (
                  <article 
                    key={post.id}
                    onClick={() => setActiveIndex(index)}
                    className={`group cursor-pointer rounded-2xl border bg-[#fcfbf9] p-5 sm:p-6 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] relative flex flex-col justify-between ${
                      isActive 
                        ? 'scale-[1.03] lg:scale-[1.05] z-20 border-[#5a5e4b]/40 shadow-[0_20px_50px_rgba(28,27,24,0.08)] bg-white opacity-100' 
                        : 'scale-[0.96] opacity-75 hover:opacity-95 z-10 border-[#e8e4dc] bg-[#fcfbf9]/90 shadow-sm'
                    }`}
                  >

                    <div>
                      {/* POST HEADER */}
                      <div className="flex items-center justify-between pb-3.5 border-b border-[#e8e4dc]/60">
                        <div className="flex items-center gap-3">
                          <img 
                            src={post.avatar} 
                            alt={post.username} 
                            className="h-10 w-10 rounded-full object-cover border border-[#e8e4dc] shadow-xs"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-xs sm:text-sm text-[#1a1918] tracking-tight">
                                {post.username}
                              </span>
                              {post.verified && (
                                <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-[#5a5e4b] text-white text-[8px]" title="Verified Client">
                                  ✓
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[#706c64] font-light">
                              {post.location}
                            </p>
                          </div>
                        </div>

                        <span className="text-[10px] font-mono uppercase text-[#706c64] bg-[#faf8f5] px-2 py-1 rounded border border-[#e8e4dc]/50">
                          {post.color}
                        </span>
                      </div>

                      {/* MAIN CUSTOMER IMAGE */}
                      <div className="mt-3.5 relative overflow-hidden rounded-xl bg-[#f0ede6] aspect-[4/5] shadow-xs">
                        <img 
                          src={post.image} 
                          alt={`Customer wearing ${post.productTag}`}
                          className="h-full w-full object-cover object-top transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]"
                        />

                        {/* Environment Tag Overlay */}
                        {/* <div className="absolute bottom-3 left-3 bg-[#1a1918]/75 backdrop-blur-md px-2.5 py-1 rounded text-[9px] uppercase tracking-widest text-[#faf8f5] font-light">
                          {post.environment}
                        </div> */}
                      </div>

                      {/* SOCIAL INTERACTION ROW */}
                      <div className="mt-3.5 flex items-center justify-between">
                        <div className="flex items-center gap-4 text-[#1a1918]">
                          {/* Like Button */}
                          <button 
                            onClick={(e) => { e.stopPropagation(); toggleLike(post.id); }}
                            className="flex items-center gap-1.5 text-xs transition hover:opacity-75 focus:outline-none"
                            aria-label="Like post"
                          >
                            <svg 
                              className={`h-5 w-5 transition-transform duration-300 ${isLiked ? 'text-rose-700 fill-rose-700 scale-110' : 'text-[#1a1918] fill-none'}`} 
                              viewBox="0 0 24 24" 
                              stroke="currentColor" 
                              strokeWidth="1.5"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                            </svg>
                            <span className="font-medium text-xs text-[#1a1918]">
                              {likeCounts[post.id]}
                            </span>
                          </button>

                          {/* Comment Icon */}
                          <div className="flex items-center gap-1 text-xs text-[#1a1918]">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 007.5 20.25a8.966 8.966 0 004.5 0z" />
                            </svg>
                          </div>

                          {/* Share Icon */}
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleShareClick(post.id); }}
                            className="text-[#1a1918] transition hover:opacity-75 relative"
                            title="Share Look"
                          >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                            </svg>
                          </button>

                        </div>
                        </div>

                        {copiedId === post.id && (
                          <span className="text-[10px] font-mono text-[#5a5e4b] animate-pulse">
                            Link Copied!
                          </span>
                        )}
                      </div>


                      {/* REVIEW / RATING */}
                      {/* <div className="mt-3 pt-3 border-t border-[#e8e4dc]/50 flex items-center justify-between">
                        <div className="flex items-center gap-1 text-amber-600 text-xs">
                          {'★'.repeat(post.rating)}
                        </div>
                        <span className="text-[10px] text-[#706c64] uppercase tracking-wider font-medium">
                          Verified Purchase
                        </span>
                      </div> */}

                    {/* PRODUCT TAG AT BOTTOM */}
                    {/* <div className="mt-4 pt-3 border-t border-[#e8e4dc]/60 text-center">
                      <span className="text-[9px] uppercase tracking-[0.25em] text-[#5a5e4b] font-medium block hover:underline">
                        {post.productTag}
                      </span>
                    </div> */}
                  </article>
                )
              })}
            </div>

            {/* Mobile Carousel View (1 Active Post Display) */}
            <div className="md:hidden">
              {(() => {
                const post = reviews[activeIndex]
                const isLiked = !!likedPosts[post.id]

                return (
                  <article className="rounded-2xl border border-[#5a5e4b]/30 bg-white p-5 shadow-lg relative max-w-md mx-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-[#e8e4dc]">
                      <div className="flex items-center gap-3">
                        <img src={post.avatar} alt={post.username} className="h-10 w-10 rounded-full object-cover border border-[#e8e4dc]" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm text-[#1a1918]">{post.username}</span>
                            {post.verified && <span className="h-3.5 w-3.5 rounded-full bg-[#5a5e4b] text-white text-[8px] flex items-center justify-center">✓</span>}
                          </div>
                          <p className="text-xs text-[#706c64]">{post.location}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono uppercase text-[#706c64] bg-[#faf8f5] px-2 py-1 rounded border border-[#e8e4dc]">
                        {post.color}
                      </span>
                    </div>

                    {/* Customer Image */}
                    <div className="mt-3.5 relative overflow-hidden rounded-xl bg-[#f0ede6] aspect-[4/5]">
                      <img src={post.image} alt={post.productTag} className="h-full w-full object-cover object-top" />
                      <div className="absolute bottom-3 left-3 bg-[#1a1918]/80 text-white text-[9px] uppercase tracking-widest px-2.5 py-1 rounded">
                        {post.environment}
                      </div>
                    </div>

                    {/* Social Row */}
                    <div className="mt-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-4 text-[#1a1918]">
                        <button onClick={() => toggleLike(post.id)} className="flex items-center gap-1.5 text-xs">
                          <svg className={`h-5 w-5 ${isLiked ? 'text-rose-700 fill-rose-700' : 'text-[#1a1918] fill-none'}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                          </svg>
                          <span className="font-medium text-xs">{likeCounts[post.id]}</span>
                        </button>
                        <div className="flex items-center gap-1 text-xs">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 007.5 20.25a8.966 8.966 0 004.5 0z" />
                          </svg>
                        </div>
                        <button onClick={() => handleShareClick(post.id)} className="text-[#1a1918]">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                          </svg>
                        </button>
                      </div>
                      {copiedId === post.id && <span className="text-[10px] text-[#5a5e4b]">Copied!</span>}
                    </div>


                    {/* Review */}
                    {/* <div className="mt-3 pt-3 border-t border-[#e8e4dc] flex items-center justify-between">
                      <div className="flex text-amber-600 text-xs">{'★'.repeat(post.rating)}</div>
                      <span className="text-[10px] text-[#706c64] uppercase font-medium">Verified Purchase</span>
                    </div> */}

                    {/* Tag */}
                    {/* <div className="mt-4 pt-3 border-t border-[#e8e4dc] text-center">
                      <span className="text-[9px] uppercase tracking-[0.25em] text-[#5a5e4b] font-medium">{post.productTag}</span>
                    </div> */}
                  </article>
                )
              })()}
            </div>
          </div>

          {/* LEFT & RIGHT NAVIGATION ARROWS */}
          <button 
            onClick={handlePrev}
            className="absolute left-0 lg:-left-5 top-1/2 -translate-y-1/2 z-30 h-11 w-11 rounded-full bg-white/90 border border-[#e8e4dc] text-[#1a1918] shadow-md flex items-center justify-center transition hover:bg-[#1a1918] hover:text-white hover:border-[#1a1918] focus:outline-none"
            aria-label="Previous Post"
          >
            ←
          </button>

          <button 
            onClick={handleNext}
            className="absolute right-0 lg:-right-5 top-1/2 -translate-y-1/2 z-30 h-11 w-11 rounded-full bg-white/90 border border-[#e8e4dc] text-[#1a1918] shadow-md flex items-center justify-center transition hover:bg-[#1a1918] hover:text-white hover:border-[#1a1918] focus:outline-none"
            aria-label="Next Post"
          >
            →
          </button>

          {/* PAGINATION DOTS */}
          <div className="mt-8 flex items-center justify-center gap-2">
            {reviews.map((post, idx) => (
              <button
                key={post.id}
                onClick={() => setActiveIndex(idx)}
                className={`transition-all duration-300 rounded-full ${
                  activeIndex === idx 
                    ? 'w-7 h-2 bg-[#5a5e4b]' 
                    : 'w-2 h-2 bg-[#e8e4dc] hover:bg-[#706c64]'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>

        </div>

        {/* -------------------------------------------------- */}
        {/* SECTION FOOTER */}
        {/* -------------------------------------------------- */}


      </div>

      {/* -------------------------------------------------- */}
      {/* SHARE YOUR LOOK MODAL */}
      {/* -------------------------------------------------- */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity">
          <div className="bg-[#faf8f5] rounded-2xl border border-[#e8e4dc] p-6 sm:p-8 max-w-lg w-full relative shadow-2xl">
            {/* Close button */}
            <button 
              onClick={() => { setIsShareModalOpen(false); setShareSubmitted(false); }}
              className="absolute top-4 right-4 h-8 w-8 rounded-full border border-[#e8e4dc] text-[#706c64] flex items-center justify-center hover:bg-[#1a1918] hover:text-white transition"
            >
              ✕
            </button>

            {!shareSubmitted ? (
              <div>
                <span className="text-[10px] font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block">
                  COMMUNITY FEATURE
                </span>
                <h3 className="mt-1 font-serif text-2xl sm:text-3xl text-[#1a1918] font-light">
                  Share Your Look
                </h3>
                <p className="mt-2 text-xs text-[#706c64] leading-relaxed">
                  Show how you style our signature article in your city. Upload your photo to join our #WornAndLoved gallery.
                </p>

                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    setShareSubmitted(true);
                  }}
                  className="mt-6 space-y-4"
                >
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-[#1a1918] mb-1 font-medium">
                      Instagram Handle / Name
                    </label>
                    <input 
                      type="text" 
                      required 
                      placeholder="@yourhandle"
                      className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-[#e8e4dc] bg-white focus:outline-none focus:border-[#5a5e4b]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-[#1a1918] mb-1 font-medium">
                        City / Location
                      </label>
                      <input 
                        type="text" 
                        required 
                        placeholder="e.g. Lahore, Pakistan"
                        className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-[#e8e4dc] bg-white focus:outline-none focus:border-[#5a5e4b]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-[#1a1918] mb-1 font-medium">
                        Article Color
                      </label>
                      <select className="w-full text-xs px-3 py-2.5 rounded-lg border border-[#e8e4dc] bg-white focus:outline-none focus:border-[#5a5e4b]">
                        <option>Sage Green</option>
                        <option>Ivory</option>
                        <option>Blush Pink</option>
                        <option>Dusty Rose</option>
                        <option>Embroidered Oak</option>
                        <option>Emerald Tone</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-[#1a1918] mb-1 font-medium">
                      Short Caption / Memory
                    </label>
                    <textarea 
                      rows={3} 
                      required 
                      placeholder="How did it feel wearing the suit?"
                      className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-[#e8e4dc] bg-white focus:outline-none focus:border-[#5a5e4b]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-[#1a1918] mb-1 font-medium">
                      Upload Photograph
                    </label>
                    <div className="border-2 border-dashed border-[#e8e4dc] rounded-xl p-4 text-center bg-white cursor-pointer hover:border-[#5a5e4b] transition">
                      <p className="text-xs text-[#706c64]">📷 Click to select or drop portrait photo</p>
                      <p className="text-[10px] text-[#706c64]/70 mt-1 font-mono">PNG, JPG up to 10MB</p>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="mt-2 w-full py-3 bg-[#1a1918] text-white text-xs uppercase tracking-[0.25em] rounded-full hover:bg-[#5a5e4b] transition duration-300 font-medium"
                  >
                    SUBMIT FOR FEATURE
                  </button>
                </form>
              </div>
            ) : (
              <div className="py-8 text-center">
                <div className="h-12 w-12 rounded-full bg-[#5a5e4b]/15 text-[#5a5e4b] mx-auto flex items-center justify-center text-xl mb-4">
                  ✓
                </div>
                <h4 className="font-serif text-2xl text-[#1a1918]">Thank You!</h4>
                <p className="mt-2 text-xs text-[#706c64] max-w-xs mx-auto leading-relaxed">
                  Your submission has been received. Our editorial team will review your look for the #WornAndLoved feature gallery.
                </p>
                <button 
                  onClick={() => { setIsShareModalOpen(false); setShareSubmitted(false); }}
                  className="mt-6 text-xs uppercase tracking-[0.2em] underline font-medium text-[#1a1918]"
                >
                  Close Window
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
