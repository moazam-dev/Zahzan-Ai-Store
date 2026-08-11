import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import tryonImg from '../assets/tryonimg.png'
import before from '../assets/tryonbefore.png'
import after from '../assets/tryonafter.png'

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
    <section className="bg-stone-50 py-0">
      <div className="grid max-w-none min-h-[28rem] gap-8 lg:grid-cols-[50vw_minmax(0,50vw)] lg:items-stretch lg:min-h-[32rem]">
        <div className="h-full overflow-hidden bg-transparent">
          <img
            src={tryonImg}
            alt="AI try-on preview"
            className="h-full w-full object-cover"    
          />
        </div>

        <div className="lg:mr-8">
          <div
            ref={trackRef}
            onPointerDown={handlePointerDown}
            onTouchStart={handlePointerDown}
            className="relative overflow-hidden rounded-[0.5rem] bg-stone-100 h-[41rem] touch-none"
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
            <div className="absolute left-4 top-4 rounded-full bg-black/70 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white">
              Before
            </div>
            <div className="absolute right-4 top-4 rounded-full bg-black/70 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white">
              After
            </div>
          </div>
          <button className="mt-6 w-full rounded-[0.5rem] bg-stone-900 px-6 py-4 text-sm font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-stone-800">
            Try it on me
          </button>
        </div>
      </div>
    </section>
  )
}
