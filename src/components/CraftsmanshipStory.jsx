import { useState, useEffect, useRef } from 'react'
import heroImg from '../assets/craftsmanship_hero.jpg'
import fabricImg from '../assets/craftsmanship_fabric.jpg'
import detailImg from '../assets/craftsmanship_detail.jpg'
import fitImg from '../assets/craftsmanship_fit.jpg'

export default function CraftsmanshipStory({ id = "new-arrivals" }) {
  const [activeStep, setActiveStep] = useState(1)
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef(null)
  const step1Ref = useRef(null)
  const step2Ref = useRef(null)
  const step3Ref = useRef(null)

  useEffect(() => {
    const sectionElement = sectionRef.current
    if (!sectionElement) return

    // Intersection observer for section visibility
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.05 }
    )

    visibilityObserver.observe(sectionElement)

    // Intersection observers for active step scroll tracking
    const stepObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (entry.target === step1Ref.current) setActiveStep(1)
            else if (entry.target === step2Ref.current) setActiveStep(2)
            else if (entry.target === step3Ref.current) setActiveStep(3)
          }
        })
      },
      { 
        rootMargin: '-15% 0px -15% 0px',
        threshold: 0.25 
      }
    )

    if (step1Ref.current) stepObserver.observe(step1Ref.current)
    if (step2Ref.current) stepObserver.observe(step2Ref.current)
    if (step3Ref.current) stepObserver.observe(step3Ref.current)

    return () => {
      visibilityObserver.disconnect()
      stepObserver.disconnect()
    }
  }, [])

  const details = [
    {
      id: 1,
      ref: step1Ref,
      number: '01',
      title: 'THE FABRIC',
      quote: 'Lightweight, breathable and made for effortless movement.',
      description: 'Hand-selected premium organic lawn woven with high-count threads for a silky tactile handle that withstands daily wear with unmatched grace.',
      image: fabricImg,
      alt: 'Macro photograph of fine Pakistani lawn textile weave',
      tag: 'Textile Composition'
    },
    {
      id: 2,
      ref: step2Ref,
      number: '02',
      title: 'THE DETAIL',
      quote: 'Every finish is considered.',
      description: 'Delicate neck stitchery and subtle tonal borders handcrafted by master artisans. Intricate Pakistani embroidery scaled for quiet modern elegance.',
      image: detailImg,
      alt: 'Close-up photograph of refined Pakistani neckline embroidery',
      tag: 'Hand Artistry'
    },
    {
      id: 3,
      ref: step3Ref,
      number: '03',
      title: 'THE FIT',
      quote: 'Designed to move beautifully with you.',
      description: 'Tailored with fluid ease — an elongated kameez hemline paired with structured straight trousers and a softly draping dupatta for natural motion.',
      image: fitImg,
      alt: 'Close-up photograph showing garment silhouette and drape',
      tag: 'Silhouette & Motion'
    }
  ]

  return (
    <section 
      id={id} 
      ref={sectionRef} 
      className="relative bg-[#faf8f5] text-[#1c1b18] py-12 sm:py-16 lg:py-20 px-4 sm:px-8 lg:px-12 transition-opacity duration-1000"
    >
      {/* Subtle Background Radial Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#e5dfd5_1px,transparent_1px)] [background-size:32px_32px] opacity-25 pointer-events-none" />

      <div className="mx-auto max-w-[88rem] relative z-10">
        
        {/* EDITORIAL SECTION HEADER */}
        <div className={`mb-10 sm:mb-12 transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] transform ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
        }`}>
          <div className="flex items-center gap-3 mb-3">
            <span className="h-[1px] w-8 bg-[#5a5e4b]/40" />
            <p className="text-[10px] uppercase tracking-[0.35em] font-medium text-[#5a5e4b]">
              CRAFTSMANSHIP & STORY
            </p>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <h2 className="font-serif-editorial text-4xl sm:text-6xl lg:text-7xl font-light tracking-tight text-[#1a1918] leading-[1.02]">
                THE PIECE,<br />
                <span className="italic font-normal">UP CLOSE</span>
              </h2>
            </div>
            <div className="lg:max-w-md border-l border-[#e2dfd7] pl-6 py-1">
              <p className="font-serif-editorial italic text-xl sm:text-2xl text-[#4a4943] leading-relaxed">
                Designed slowly. Worn effortlessly.
              </p>
              <p className="mt-2 text-xs text-[#706c64] font-light leading-relaxed tracking-wide">
                An intimate exploration into our signature article — featuring enlarged editorial photography and refined structural detail.
              </p>
            </div>
          </div>

          <div className="mt-8 w-full h-[1px] bg-[#e6e2da]" />
        </div>

        {/* STICKY SPLIT-SCREEN LAYOUT TRACK */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start relative">
          
          {/* LEFT SIDE: FIXED STICKY CONTAINER (NUMBERS PANEL + ENLARGED MAIN HERO IMAGE) */}
          <div className="lg:col-span-7 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] flex flex-col justify-center py-2 z-20 self-start">
            <div className="flex gap-3 sm:gap-6 items-stretch h-full max-h-[82vh]">
              
              {/* 1 2 3 Page Number Panel */}
              <div className="flex flex-col items-center justify-between py-6 px-3 border-r border-[#e6e2da] bg-[#faf8f5]/90 backdrop-blur-sm z-10 shrink-0">
                <div className="flex flex-col items-center gap-12 relative my-auto">
                  {/* Subtle Vertical Progress Line */}
                  <div className="absolute top-2 bottom-2 left-1/2 -translate-x-1/2 w-[1px] bg-[#e2dfd7]" />
                  <div 
                    className="absolute left-1/2 -translate-x-1/2 w-[2px] bg-[#5a5e4b] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                    style={{
                      top: `${((activeStep - 1) / 2) * 80}%`,
                      height: '26px'
                    }}
                  />

                  {details.map((detail) => (
                    <button
                      key={detail.id}
                      onClick={() => {
                        setActiveStep(detail.id)
                        detail.ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      }}
                      className={`relative z-10 flex flex-col items-center transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                        activeStep === detail.id ? 'scale-110' : 'opacity-35 hover:opacity-75'
                      }`}
                    >
                      <span className={`text-[13px] font-mono tracking-wider px-2 py-1 bg-[#faf8f5] transition-all duration-500 ${
                        activeStep === detail.id ? 'text-[#1c1b18] font-bold border-l-2 border-[#5a5e4b] pl-2' : 'text-[#706c64]'
                      }`}>
                        {detail.number}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="text-[9px] uppercase tracking-[0.25em] text-[#5a5e4b] [writing-mode:vertical-lr] rotate-180 opacity-60 font-medium pt-4">
                  Story Mode — 0{activeStep}/03
                </div>
              </div>

              {/* Enlarged Main Vertical Outfit Photograph (FIXED / STICKY) */}
              <div className="flex-1 relative overflow-hidden bg-[#f0ede6] aspect-[3/4.2] h-full min-h-[480px] lg:min-h-[620px] group shadow-md border border-[#e2dfd7]/60">
                <img 
                  src={heroImg} 
                  alt="Signature Pakistani outfit worn by a model" 
                  className="w-full h-full object-cover object-center transition-transform duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02]"
                />
                
                {/* Floating Editorial Badge */}
                <div className="absolute top-5 left-5 bg-[#faf8f5]/95 backdrop-blur-sm px-4 py-2 text-[10px] uppercase tracking-[0.3em] font-medium text-[#2c2a26] border border-[#e2dfd7] transition-all duration-500">
                  Signature Piece — Active Moment 0{activeStep}
                </div>

                <div className="absolute bottom-5 right-5 bg-[#1a1918]/85 text-[#faf8f5] px-4 py-2 text-[10px] uppercase tracking-[0.25em] font-light">
                  Pakistani Lawn Ensemble
                </div>

                {/* Active tag indicator */}
                <div className="absolute bottom-5 left-5 bg-[#faf8f5]/95 backdrop-blur-sm px-3 py-1.5 text-[9px] font-mono text-[#5a5e4b] border border-[#e2dfd7] transition-all duration-500">
                  {details[activeStep - 1].tag}
                </div>
              </div>

            </div>

            {/* Caption under fixed left image */}
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#706c64] font-light tracking-wide px-1">
              <span>Figure 1.0 — Fixed Master Image</span>
              <span className="italic font-serif-editorial text-sm">Active Chapter: 0{activeStep}</span>
            </div>
          </div>

          {/* RIGHT SIDE: SCROLLING ENLARGED DETAIL CARDS WITH REDUCED GAPS & ULTRA-SMOOTH ANIMATIONS */}
          <div className="lg:col-span-5 flex flex-col space-y-8 sm:space-y-12 lg:space-y-16 pt-4 lg:pt-6 pb-4">
            {details.map((detail) => (
              <div 
                key={detail.id}
                ref={detail.ref}
                className={`relative transition-all duration-700 cubic-bezier(0.16,1,0.3,1) transform flex flex-col justify-center ${
                  activeStep === detail.id 
                    ? 'opacity-100 translate-y-0 scale-100 blur-0' 
                    : 'opacity-40 translate-y-3 scale-[0.98] blur-[0.5px]'
                }`}
              >
                {/* Hairline Divider */}
                <div className="w-full h-[1px] bg-[#e6e2da] mb-5" />

                <div className="flex flex-col gap-4 items-start">
                  {/* Enlarged Floating Detail Crop Image */}
                  <div className="w-full overflow-hidden bg-[#f0ede6] aspect-[16/11] h-64 sm:h-80 lg:h-[21rem] relative group/img shadow-md border border-[#e2dfd7]">
                    <img 
                      src={detail.image} 
                      alt={detail.alt}
                      className="w-full h-full object-cover object-center transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/img:scale-105"
                    />
                    <div className="absolute bottom-3 left-3 bg-[#faf8f5]/95 px-3 py-1 text-[9px] uppercase tracking-[0.25em] text-[#5a5e4b] font-medium border border-[#e2dfd7]">
                      {detail.tag}
                    </div>
                    <div className="absolute top-3 right-3 bg-[#1a1918]/85 text-[#faf8f5] px-3 py-1 text-[10px] font-mono">
                      {detail.number}
                    </div>
                  </div>

                  {/* Detail Copy */}
                  <div className="w-full flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-[#5a5e4b] font-semibold tracking-wider">
                        {detail.number} — {detail.title}
                      </span>
                    </div>

                    <h3 className="font-serif-editorial text-2xl sm:text-3xl text-[#1a1918] font-light leading-snug">
                      "{detail.quote}"
                    </h3>

                    <p className="text-xs sm:text-sm text-[#585550] font-light leading-relaxed tracking-wide">
                      {detail.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* BOTTOM STATEMENT & CTA (MINIMIZED GAP ABOVE) */}
        {/* <div className={`mt-8 sm:mt-10 lg:mt-12 pt-8 border-t border-[#e6e2da] text-center transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] transform ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
        }`}>
          <div className="max-w-2xl mx-auto flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-[0.4em] text-[#5a5e4b] mb-3 font-medium">
              SIGNATURE EDITORIAL
            </span>
            
            <h3 className="font-serif-editorial text-3xl sm:text-5xl lg:text-6xl font-light text-[#1a1918] leading-[1.15] tracking-tight">
              Made to be noticed.<br />
              <span className="italic font-normal">Designed to be lived in.</span>
            </h3>

            <p className="mt-4 text-xs sm:text-sm text-[#706c64] font-light tracking-wide max-w-lg leading-relaxed">
              Crafted in limited quantities for women who appreciate quiet luxury, immaculate drape, and enduring Pakistani textile tradition.
            </p>

            <a 
              href="/product/1" 
              className="mt-8 group relative inline-flex items-center gap-4 text-xs uppercase tracking-[0.3em] font-medium text-[#1c1b18] py-3 px-8 border-b border-[#1c1b18] transition-all duration-300 hover:bg-[#1c1b18] hover:text-[#faf8f5]"
            >
              <span>EXPLORE THE PIECE</span>
              <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </a>
          </div>
        </div> */}

      </div>
    </section>
  )
}
