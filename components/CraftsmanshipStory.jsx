'use client'

import React, { useState, useEffect, useRef } from 'react'
const heroImg = '/images/craftsmanship_hero.jpg'
const fabricImg = '/images/craftsmanship_fabric.jpg'
const embroideryImg = '/images/craftsmanship_detail.jpg'
const fitImg = '/images/craftsmanship_fit.jpg'
const dupattaImg = '/images/unfolding_dupatta.jpg'

export default function CraftsmanshipStory({ id = "craftsmanship" }) {
  const containerRef = useRef(null)
  const [progress, setProgress] = useState(0)
  const [isReducedMotion, setIsReducedMotion] = useState(false)

  // Check reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setIsReducedMotion(mediaQuery.matches)

    const handleChange = (e) => setIsReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // High-precision scroll tracking using requestAnimationFrame
  useEffect(() => {
    if (isReducedMotion) return

    let animationFrameId
    const handleScroll = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const totalScrollable = rect.height - window.innerHeight
      if (totalScrollable <= 0) return

      const currentScroll = -rect.top
      const rawProgress = currentScroll / totalScrollable
      const clamped = Math.max(0, Math.min(1, rawProgress))
      setProgress(clamped)
    }

    const onScroll = () => {
      animationFrameId = requestAnimationFrame(handleScroll)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    handleScroll()

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
    }
  }, [isReducedMotion])

  // Helper interpolation functions for continuous overlapping transitions
  const clamp = (val, min = 0, max = 1) => Math.max(min, Math.min(max, val))

  // Smooth ease-out cubic curve for natural luxury motion
  const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3)

  // Interpolate between values based on progress range [start, end]
  const lerp = (start, end, startVal, endVal, currentProgress) => {
    if (currentProgress <= start) return startVal
    if (currentProgress >= end) return endVal
    const ratio = easeOutCubic((currentProgress - start) / (end - start))
    return startVal + (endVal - startVal) * ratio
  }

  // Calculate windowed opacity with optional fade-in and fade-out ranges
  const calcOpacity = (fadeInStart, fadeInEnd, fadeOutStart = 1.0, fadeOutEnd = 1.0) => {
    if (progress < fadeInStart) return 0
    if (progress >= fadeInStart && progress < fadeInEnd) {
      return easeOutCubic((progress - fadeInStart) / (fadeInEnd - fadeInStart))
    }
    if (progress >= fadeInEnd && progress <= fadeOutStart) return 1
    if (progress > fadeOutStart && progress <= fadeOutEnd) {
      return 1 - easeOutCubic((progress - fadeOutStart) / (fadeOutEnd - fadeOutStart))
    }
    return 0
  }

  // Dynamic interpolation values calculated continuously across 0.0 -> 1.0
  // STAGE 01 — Hero start & Title (Hero is ALREADY 48% shown at progress=0)
  const heroRevealWidth = lerp(0.0, 0.60, 48, 84, progress) // reveal crop opens up gradually
  const heroTranslateY = lerp(0.0, 1.0, 25, 0, progress) // subtle camera pull-back
  const heroScale = lerp(0.0, 1.0, 1.05, 1.0, progress)
  const heroObjectY = lerp(0.0, 1.0, 15, 50, progress) // shift crop focal point

  // Title typography transitions
  const titleOpacity = calcOpacity(0.0, 0.12, 0.75, 0.92)
  const titleY = lerp(0.0, 0.35, 0, -20, progress)

  // STAGE 02 — Material Macro (Fabric Fragment)
  const fabricOpacity = calcOpacity(0.04, 0.22, 0.92, 1.0)
  const fabricX = lerp(0.04, 0.35, -35, 0, progress) // slides subtly from left
  const fabricY = lerp(0.04, 0.35, 18, 0, progress)
  const fabricScale = lerp(0.08, 0.45, 0.95, 1.02, progress)

  const materialLabelOpacity = calcOpacity(0.10, 0.26, 0.78, 0.92)
  const materialLabelY = lerp(0.10, 0.28, 12, 0, progress)

  // STAGE 03 — Detail (Embroidery macro overlapping neckline area)
  const embroideryOpacity = calcOpacity(0.22, 0.42, 0.92, 1.0)
  const embroideryX = lerp(0.22, 0.48, 35, 0, progress) // enters from right overlap
  const embroideryY = lerp(0.22, 0.48, -18, 0, progress)
  const embroideryRotate = lerp(0.22, 0.48, 2.5, -1.2, progress) // organic pin feel

  const detailLabelOpacity = calcOpacity(0.28, 0.46, 0.80, 0.94)
  const detailLabelY = lerp(0.28, 0.46, 12, 0, progress)

  // STAGE 04 — Drape (Dupatta in motion)
  const dupattaOpacity = calcOpacity(0.45, 0.65, 0.95, 1.0)
  const dupattaX = lerp(0.45, 0.72, -45, 0, progress) // floats across horizontally
  const dupattaY = lerp(0.45, 0.72, 25, 0, progress)

  const drapeLabelOpacity = calcOpacity(0.50, 0.68, 0.84, 0.95)
  const drapeLabelY = lerp(0.50, 0.68, 12, 0, progress)

  // STAGE 05 — Silhouette Fit Crop & Final Convergence
  const fitOpacity = calcOpacity(0.65, 0.82, 1.0, 1.0)
  const fitY = lerp(0.65, 0.85, 30, 0, progress)
  const fitScale = lerp(0.65, 0.85, 0.96, 1.0, progress)

  // Finale Statement ("THE FINISHED PIECE / Made to move with you")
  const finalOpacity = calcOpacity(0.76, 0.88, 1.0, 1.0)
  const finalY = lerp(0.76, 0.90, 18, 0, progress)

  // Single olive thread line stroke dash
  const threadProgress = clamp((progress - 0.04) / 0.88)

  // REDUCED MOTION STATIC LAYOUT FALLBACK
  if (isReducedMotion) {
    return (
      <section id={id} className="w-full bg-[#fbf9f6] text-[#1c1b18] py-24 px-6 sm:px-12 lg:px-20">
        <div className="max-w-[1340px] mx-auto space-y-20">
          
          {/* Header Spread */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-12 border-b border-[#e5e0d8]">
            <div>
              <span className="text-[11px] font-sans tracking-[0.35em] text-[#5a5e4b] uppercase block mb-3 font-medium">
                CRAFTSMANSHIP
              </span>
              <h2 className="font-serif text-4xl sm:text-6xl font-light text-[#1c1b18] leading-[1.02] tracking-tight">
                FROM THREAD, <br /> <span className="italic block sm:inline font-normal text-[#5a5e4b]">TO FORM</span>
              </h2>
            </div>
            <p className="font-serif italic text-xl text-[#5a5e4b] max-w-sm">
              "Every detail begins with intention. A living study in silk, thread, and form."
            </p>
          </div>

          {/* Editorial Constellation Grid */}
          <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Column: Material & Drape Fragments */}
            <div className="lg:col-span-4 space-y-12">
              <div className="relative group">
                <div className="aspect-[3/4] overflow-hidden bg-[#f3efe8]">
                  <img src={fabricImg} alt="Woven silk fabric texture macro" className="w-full h-full object-cover" />
                </div>
                <div className="mt-4 space-y-1">
                  <span className="text-[10px] font-sans tracking-[0.25em] text-[#5a5e4b] uppercase font-medium">01 / MATERIAL</span>
                  <p className="font-serif italic text-xl text-[#1c1b18]">Lightweight. Breathable.</p>
                </div>
              </div>

              <div className="relative pt-6 border-t border-[#e8e3d9]">
                <div className="aspect-[16/10] overflow-hidden bg-[#f3efe8]">
                  <img src={dupattaImg} alt="Fluid dupatta organza drape" className="w-full h-full object-cover" />
                </div>
                <div className="mt-4 space-y-1">
                  <span className="text-[10px] font-sans tracking-[0.25em] text-[#5a5e4b] uppercase font-medium">03 / DRAPE</span>
                  <p className="font-serif italic text-xl text-[#1c1b18]">Designed to fall naturally.</p>
                </div>
              </div>
            </div>

            {/* Center Column: Full Hero Garment */}
            <div className="lg:col-span-5 relative">
              <div className="aspect-[3/4.4] overflow-hidden shadow-sm bg-[#f3efe8]">
                <img src={heroImg} alt="Complete signature ivory Pakistani ensemble" className="w-full h-full object-cover object-top" />
              </div>
            </div>

            {/* Right Column: Embroidery Detail & Hem Movement */}
            <div className="lg:col-span-3 space-y-12">
              <div className="relative">
                <div className="aspect-square overflow-hidden bg-[#f3efe8]">
                  <img src={embroideryImg} alt="Fine neck embroidery detail" className="w-full h-full object-cover" />
                </div>
                <div className="mt-4 space-y-1">
                  <span className="text-[10px] font-sans tracking-[0.25em] text-[#5a5e4b] uppercase font-medium">02 / DETAIL</span>
                  <p className="font-serif italic text-xl text-[#1c1b18]">Quiet embroidery. Carefully finished.</p>
                </div>
              </div>

              <div className="relative pt-6 border-t border-[#e8e3d9]">
                <div className="aspect-[3/4] overflow-hidden bg-[#f3efe8]">
                  <img src={fitImg} alt="Lower flare hem and trouser drape" className="w-full h-full object-cover" />
                </div>
                <div className="mt-4 space-y-1">
                  <span className="text-[10px] font-sans tracking-[0.25em] text-[#5a5e4b] uppercase font-medium">SILHOUETTE</span>
                  <p className="font-serif italic text-xl text-[#1c1b18]">Tailored for fluid elegance.</p>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>
    )
  }

  return (
    <section
      ref={containerRef}
      id={id}
      className="relative w-full bg-[#fbf9f6] text-[#1c1b18] select-none"
      style={{ height: '250vh' }}
    >
      {/* Sticky Viewport Stage — Full Editorial Canvas */}
      <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col justify-between pt-3 pb-3 px-3 sm:pt-4 sm:pb-8 sm:px-8 lg:pt-6 lg:pb-12 lg:px-12">
        
        {/* ========================================================================= */}
        {/* EDITORIAL CANVAS HEADER (Top Left & Top Right Typography) */}
        {/* ========================================================================= */}
        <header 
          className="relative z-30 w-full max-w-[1400px] mx-auto flex items-start justify-between pointer-events-none transition-transform duration-75 ease-out"
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`
          }}
        >
          <div className="space-y-0.5 sm:space-y-1">
            <span className="text-[9px] sm:text-[11px] font-sans tracking-[0.35em] text-[#5a5e4b] uppercase block font-medium">
              CRAFTSMANSHIP / 01
            </span>
            <h2 className="font-serif text-2xl sm:text-4xl lg:text-5xl font-light text-[#1c1b18] leading-[1.05] tracking-tight">
              THE GARMENT, <span className="italic block sm:inline font-normal text-[#5a5e4b]">DECONSTRUCTED</span>
            </h2>
          </div>

          <div className="hidden sm:block text-right max-w-xs">
            <p className="font-serif italic text-base lg:text-lg text-[#5a5e4b] leading-snug">
              "Every detail begins with intention. A living study in silk, thread, and form."
            </p>
          </div>
        </header>

        {/* ========================================================================= */}
        {/* MAIN CONSTELLATION CONTAINER: ASYMMETRICAL LUXURY EDITORIAL INSTALLATION */}
        {/* ========================================================================= */}
        <div className="relative w-full max-w-[1400px] h-full mx-auto flex items-center justify-center my-auto">
          
          {/* ----------------------------------------------------------------------- */}
          {/* SINGLE SUBTLE OLIVE THREAD LINE (SVG HAIRLINE CONNECTING FRAGMENTS) */}
          {/* ----------------------------------------------------------------------- */}
          <svg 
            className="absolute inset-0 w-full h-full pointer-events-none z-15 text-[#5a5e4b]" 
            viewBox="0 0 1000 600" 
            preserveAspectRatio="none" 
            fill="none"
          >
            <path
              d="M 180 200 C 260 140, 420 180, 520 160 C 620 140, 720 220, 760 260 C 800 300, 680 440, 450 420 C 300 400, 220 480, 320 520 C 420 550, 580 500, 650 510"
              stroke="currentColor"
              strokeWidth="0.8"
              strokeDasharray="4 4"
              opacity="0.35"
              style={{
                strokeDashoffset: (1 - threadProgress) * 1200
              }}
            />
          </svg>


          {/* ----------------------------------------------------------------------- */}
          {/* CENTRAL HERO OUTFIT — THE ANCHOR (Partially cropped/shown from start!) */}
          {/* ----------------------------------------------------------------------- */}
          <div
            className="absolute z-10 transition-transform duration-75 ease-out"
            style={{
              top: '4%',
              right: '6%',
              width: `${heroRevealWidth}%`,
              maxWidth: '560px',
              height: '76vh',
              transform: `translateY(${heroTranslateY}px) scale(${heroScale})`
            }}
          >
            <div className="relative w-full h-full overflow-hidden shadow-xs bg-[#f4f0e8] border-l border-[#e8e3d9]">
              <img
                src={heroImg}
                alt="Full-length signature Pakistani luxury kameez suit on model"
                className="w-full h-full object-cover transition-all duration-75 ease-out"
                style={{
                  objectPosition: `center ${heroObjectY}%`
                }}
              />

              {/* Fine subtle inner stroke overlay */}
              <div className="absolute inset-0 border border-black/5 pointer-events-none" />
            </div>
          </div>


          {/* ----------------------------------------------------------------------- */}
          {/* FRAGMENT 01 — MATERIAL: TALL FABRIC MACRO (Left Canvas) */}
          {/* ----------------------------------------------------------------------- */}
          <div
            className="absolute z-20 transition-all duration-75 ease-out"
            style={{
              left: '2%',
              top: '10%',
              width: '32vw',
              maxWidth: '310px',
              height: '44vh',
              opacity: fabricOpacity,
              transform: `translate(${fabricX}px, ${fabricY}px) scale(${fabricScale})`
            }}
          >
            <div className="w-full h-full overflow-hidden shadow-sm bg-[#f3efe8]">
              <img
                src={fabricImg}
                alt="Ultra macro texture of luxury woven linen fabric"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* MATERIAL ANNOTATION (Attached directly to fabric fragment) */}
          <div
            className="absolute z-30 pointer-events-none transition-transform duration-75 ease-out"
            style={{
              left: '3%',
              top: '56%',
              maxWidth: '220px',
              opacity: materialLabelOpacity,
              transform: `translateY(${materialLabelY}px)`
            }}
          >
            <div className="space-y-1">
              <span className="text-[9px] sm:text-[10px] font-sans tracking-[0.25em] text-[#5a5e4b] uppercase font-medium block">
                01 / MATERIAL
              </span>
              <p className="font-serif italic text-base sm:text-xl text-[#1c1b18] leading-tight">
                Lightweight.<br />
                Breathable.<br />
                <span className="text-[#5a5e4b]">Woven to breathe.</span>
              </p>
            </div>

            {/* Connecting Hairline */}
            <svg className="absolute -top-5 left-0 w-14 h-5 pointer-events-none text-[#5a5e4b]/40" fill="none">
              <path d="M 0 16 L 35 2" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 2" />
              <circle cx="0" cy="16" r="1.5" fill="#5a5e4b" />
            </svg>
          </div>


          {/* ----------------------------------------------------------------------- */}
          {/* FRAGMENT 02 — DETAIL: EMBROIDERY MACRO (Overlapping Neckline Region) */}
          {/* ----------------------------------------------------------------------- */}
          <div
            className="absolute z-25 transition-all duration-75 ease-out"
            style={{
              right: '22%',
              top: '14%',
              width: '30vw',
              maxWidth: '280px',
              height: '30vh',
              opacity: embroideryOpacity,
              transform: `translate(${embroideryX}px, ${embroideryY}px) rotate(${embroideryRotate}deg)`
            }}
          >
            <div className="w-full h-full overflow-hidden shadow-md bg-[#f3efe8] border border-[#e5e0d8]">
              <img
                src={embroideryImg}
                alt="Close-up neck embroidery and button detailing"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* DETAIL ANNOTATION (Placed right near neckline fragment) */}
          <div
            className="absolute z-30 pointer-events-none transition-transform duration-75 ease-out"
            style={{
              right: '4%',
              top: '20%',
              maxWidth: '200px',
              opacity: detailLabelOpacity,
              transform: `translateY(${detailLabelY}px)`
            }}
          >
            <div className="space-y-1 text-left sm:text-right">
              <span className="text-[9px] sm:text-[10px] font-sans tracking-[0.25em] text-[#5a5e4b] uppercase font-medium block">
                02 / DETAIL
              </span>
              <p className="font-serif italic text-base sm:text-xl text-[#1c1b18] leading-tight">
                Quiet embroidery.<br />
                Carefully finished.
              </p>
            </div>

            {/* Connecting Hairline */}
            <svg className="hidden sm:block absolute -left-16 top-1/2 w-14 h-6 pointer-events-none text-[#5a5e4b]/40" fill="none">
              <path d="M 50 12 L 0 12" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 2" />
              <circle cx="0" cy="12" r="1.5" fill="#5a5e4b" />
            </svg>
          </div>


          {/* ----------------------------------------------------------------------- */}
          {/* FRAGMENT 03 — DRAPE: DUPATTA MOVEMENT (Floating Across Canvas) */}
          {/* ----------------------------------------------------------------------- */}
          <div
            className="absolute z-30 transition-all duration-75 ease-out"
            style={{
              left: '18%',
              bottom: '12%',
              width: '42vw',
              maxWidth: '420px',
              height: '24vh',
              opacity: dupattaOpacity,
              transform: `translate(${dupattaX}px, ${dupattaY}px)`
            }}
          >
            <div className="w-full h-full overflow-hidden shadow-sm bg-[#f3efe8] border-t border-r border-[#e5e0d8]">
              <img
                src={dupattaImg}
                alt="Fluid organza dupatta in motion"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* DRAPE ANNOTATION (Placed near floating dupatta crop) */}
          <div
            className="absolute z-35 pointer-events-none transition-transform duration-75 ease-out"
            style={{
              left: '6%',
              bottom: '20%',
              maxWidth: '190px',
              opacity: drapeLabelOpacity,
              transform: `translateY(${drapeLabelY}px)`
            }}
          >
            <div className="space-y-1">
              <span className="text-[9px] sm:text-[10px] font-sans tracking-[0.25em] text-[#5a5e4b] uppercase font-medium block">
                03 / DRAPE
              </span>
              <p className="font-serif italic text-base sm:text-xl text-[#1c1b18] leading-tight">
                Designed to fall<br />
                naturally.
              </p>
            </div>

            {/* Connecting Hairline */}
            <svg className="hidden sm:block absolute left-full top-1/2 w-16 h-8 pointer-events-none text-[#5a5e4b]/40" fill="none">
              <path d="M 0 15 Q 30 5 60 20" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 2" />
              <circle cx="60" cy="20" r="1.5" fill="#5a5e4b" />
            </svg>
          </div>


          {/* ----------------------------------------------------------------------- */}
          {/* FRAGMENT 04 — SILHOUETTE FIT CROP (Hemline & Wide Trouser Drape) */}
          {/* ----------------------------------------------------------------------- */}
          <div
            className="absolute z-20 transition-all duration-75 ease-out"
            style={{
              right: '2%',
              bottom: '8%',
              width: '28vw',
              maxWidth: '260px',
              height: '28vh',
              opacity: fitOpacity,
              transform: `translateY(${fitY}px) scale(${fitScale})`
            }}
          >
            <div className="w-full h-full overflow-hidden shadow-xs bg-[#f3efe8]">
              <img
                src={fitImg}
                alt="Wide-leg trouser and flared kameez hemline drape"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* EDITORIAL CANVAS FOOTER (Finale Statement anchored to the composition) */}
        {/* ========================================================================= */}
        <footer 
          className="relative z-40 w-full max-w-[1400px] mx-auto text-center pointer-events-none transition-transform duration-75 ease-out pb-2"
          style={{
            opacity: finalOpacity,
            transform: `translateY(${finalY}px)`
          }}
        >
          <span className="text-[9px] sm:text-[11px] font-sans tracking-[0.35em] text-[#5a5e4b] uppercase block mb-1 font-medium">
            THE FINISHED PIECE
          </span>
          <h3 className="font-serif italic text-2xl sm:text-4xl lg:text-5xl text-[#1c1b18] font-light tracking-wide">
            Made to move with you
          </h3>
        </footer>

      </div>
    </section>
  )
}
