'use client'

import { useEffect, useRef, useState } from 'react'
const before = '/images/tryonbefore.png'
const after = '/images/tryonafter.png'

export default function TryOnSection() {
  const [sliderValue, setSliderValue] = useState(50)
  const trackRef = useRef(null)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    function updateSliderFromPointer(event) {
      if (!isDraggingRef.current || !trackRef.current) return
      const rect = trackRef.current.getBoundingClientRect()
      const clientX = event.clientX ?? event.touches?.[0]?.clientX
      if (typeof clientX !== 'number') return
      const relativeX = clientX - rect.left
      const value = Math.min(100, Math.max(0, (relativeX / rect.width) * 100))
      setSliderValue(value)
    }

    function stopDrag() {
      isDraggingRef.current = false
    }

    window.addEventListener('pointermove', updateSliderFromPointer)
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('touchmove', updateSliderFromPointer)
    window.addEventListener('touchend', stopDrag)

    return () => {
      window.removeEventListener('pointermove', updateSliderFromPointer)
      window.removeEventListener('pointerup', stopDrag)
      window.removeEventListener('touchmove', updateSliderFromPointer)
      window.removeEventListener('touchend', stopDrag)
    }
  }, [])

  function handlePointerDown(event) {
    event.preventDefault()
    isDraggingRef.current = true
    if (trackRef.current) {
      const rect = trackRef.current.getBoundingClientRect()
      const clientX = event.clientX ?? event.touches?.[0]?.clientX
      if (typeof clientX !== 'number') return
      const relativeX = clientX - rect.left
      const value = Math.min(100, Math.max(0, (relativeX / rect.width) * 100))
      setSliderValue(value)
    }
  }

  return (
    <section className="bg-[#faf8f5] text-[#1c1b18] pt-8 pb-4 sm:pt-10 sm:pb-6 lg:pt-12 lg:pb-6 px-4 sm:px-8 lg:px-12 ">
      <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
        
        {/* ========================================================================= */}
        {/* LEFT SIDE: EDITORIAL HEADING, PARAGRAPH & TRY IT ON BUTTON */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 flex flex-col justify-center text-left">
          
          {/* Editorial Category Label */}
          <span className="text-[10px] sm:text-[11px] font-sans font-medium uppercase tracking-[0.4em] text-[#5a5e4b] block mb-3">
            AI VIRTUAL DRESSING
          </span>

          {/* Editorial Serif Heading */}
          <h2 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-[#1a1918] leading-[1.08]">
            SEE IT ON YOU,<br />
            <span className="italic font-normal">BEFORE IT'S YOURS.</span>
          </h2>

          {/* Short Refined Copy Paragraph */}
          <p className="mt-4 text-xs sm:text-sm font-sans text-[#706c64] font-light leading-relaxed tracking-wide max-w-md">
            Experience instantaneous virtual dressing. Visualize signature drape, fit, and movement on your silhouette with precision AI rendering.
          </p>

          {/* Action Button */}
          <div className="mt-6">
            <a 
              href="/shop" 
              className="group relative inline-flex items-center gap-4 text-xs uppercase tracking-[0.3em] font-medium text-[#1c1b18] py-3 px-8 border-b border-[#1c1b18] transition-all duration-300 hover:bg-[#1c1b18] hover:text-[#faf8f5] cursor-pointer"
            >
              <span>TRY IT ON</span>
              <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </a>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* RIGHT SIDE: BEFORE / AFTER INTERACTIVE SLIDER (UNTOUCHED LOGIC) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 w-full">
          <div
            ref={trackRef}
            onPointerDown={handlePointerDown}
            onTouchStart={handlePointerDown}
            className="relative overflow-hidden rounded-[0.5rem] bg-stone-100 h-[28rem] sm:h-[36rem] lg:h-[38rem] touch-none shadow-xs border border-[#e8e4dc]"
          >
            <img src={after} alt="Before" className="h-full w-full object-cover" />
            <div className="absolute inset-0 pointer-events-none">
              <img
                src={before}
                alt="After"
                className="h-full w-full object-cover"
                style={{ clipPath: `inset(0 ${100 - sliderValue}% 0 0)` }}
              />
            </div>
            <div className="absolute inset-y-0" style={{ left: `${sliderValue}%` }}>
              <div className="h-full w-px bg-white/80" />
              <div className="absolute -left-6 top-1/2 flex h-12 w-12 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white shadow-lg">
                <span className="text-[11px] uppercase tracking-[0.25em] text-stone-900">Slide</span>
              </div>
            </div>
            <div className="absolute left-4 top-4 rounded-full bg-black/70 px-3.5 py-1 text-[10px] sm:text-xs uppercase tracking-[0.3em] text-white">
              Before
            </div>
            <div className="absolute right-4 top-4 rounded-full bg-black/70 px-3.5 py-1 text-[10px] sm:text-xs uppercase tracking-[0.3em] text-white">
              After
            </div>
          </div>
        </div>

      </div>
    </section>
  )
}
