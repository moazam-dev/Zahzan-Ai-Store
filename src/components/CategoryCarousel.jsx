import { useEffect, useMemo, useRef, useState } from 'react'
import CategoryCard from './CategoryCard'

import C1 from '../assets/C1.webp'
import C2 from '../assets/C2.webp'
import C3 from '../assets/C3.webp'
import C4 from '../assets/C4.webp'
import C5 from '../assets/C5.webp'
import C6 from '../assets/C6.webp'

const CARD_GAP = 16
const CARD_COUNT = 6
const CLONE_COUNT = CARD_COUNT
const SWIPE_THRESHOLD = 25
const TRANSITION_MS = 2000

export default function CategoryCarousel({ categories }) {
  const trackRef = useRef(null)
  const touchStartX = useRef(0)
  const positionRef = useRef(CLONE_COUNT)
  const [position, setPosition] = useState(CLONE_COUNT)
  const [slotWidth, setSlotWidth] = useState(0)
  const [transitionEnabled, setTransitionEnabled] = useState(true)
  const [isAnimating, setIsAnimating] = useState(false)

  const items = useMemo(() => {
    const before = categories.slice(-CLONE_COUNT)
    const after = categories.slice(0, CLONE_COUNT)
    return [...before, ...categories, ...after]
  }, [categories])

  const originalStart = CLONE_COUNT
  const originalEnd = CLONE_COUNT + categories.length - 1

  useEffect(() => {
    const updateSlotWidth = () => {
      const available = window.innerWidth - CARD_GAP * 4
      setSlotWidth(Math.max(0, available / 4))
    }

    updateSlotWidth()
    window.addEventListener('resize', updateSlotWidth)
    return () => window.removeEventListener('resize', updateSlotWidth)
  }, [])

  useEffect(() => {
    if (!transitionEnabled) {
      const frame = requestAnimationFrame(() => setTransitionEnabled(true))
      return () => cancelAnimationFrame(frame)
    }
    return undefined
  }, [transitionEnabled])

  const setPositionState = (nextPosition) => {
    positionRef.current = nextPosition
    setPosition(nextPosition)
  }

  const getTransform = () => {
    if (!slotWidth) return 'translate3d(0px,0,0)'
    const fullStep = slotWidth + CARD_GAP
    const offset = positionRef.current * fullStep - slotWidth / 2
    return `translate3d(${-offset}px,0,0)`
  }

  const moveBy = (direction) => {
    if (isAnimating || !slotWidth) return
    setIsAnimating(true)
    setPositionState(positionRef.current + direction)
  }

  const handleTransitionEnd = () => {
    setIsAnimating(false)
    if (positionRef.current <= originalStart - 1) {
      setTransitionEnabled(false)
      setPositionState(originalEnd)
    } else if (positionRef.current >= originalEnd + 1) {
      setTransitionEnabled(false)
      setPositionState(originalStart)
    }
  }

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const onWheel = (event) => {
      if (isAnimating) return
      const absX = Math.abs(event.deltaX)
      const absY = Math.abs(event.deltaY)
      // Only handle horizontal wheel/trackpad gestures — let vertical scroll pass through
      if (absX <= absY) return
      if (absX < 10) return
      event.preventDefault()
      moveBy(event.deltaX > 0 ? 1 : -1)
    }

    const onTouchStart = (event) => {
      touchStartX.current = event.touches[0]?.clientX || 0
    }

    const onTouchEnd = (event) => {
      if (isAnimating) return
      const touchEndX = event.changedTouches[0]?.clientX || 0
      const delta = touchStartX.current - touchEndX
      if (Math.abs(delta) < SWIPE_THRESHOLD) return
      moveBy(delta > 0 ? 1 : -1)
    }

    track.addEventListener('wheel', onWheel, { passive: false })
    track.addEventListener('touchstart', onTouchStart, { passive: true })
    track.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      track.removeEventListener('wheel', onWheel)
      track.removeEventListener('touchstart', onTouchStart)
      track.removeEventListener('touchend', onTouchEnd)
    }
  }, [isAnimating, slotWidth])

  return (
    <section id="collections" className="border-t border-[#e8e4dc] bg-[#faf8f5] px-0 py-12 sm:py-16 lg:py-20">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-left">
          <span className="text-[10px] sm:text-[11px] font-sans font-medium uppercase tracking-[0.4em] text-[#5a5e4b] block mb-2">
            COLLECTIONS
          </span>
          <h2 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-[#1a1918] leading-[1.08]">
            Curated for every occasion
          </h2>
        </div>
      </div>

      <div className="overflow-hidden">
        <div className="relative left-1/2 -translate-x-1/2 w-screen overflow-hidden">
          <div
            ref={trackRef}
            onTransitionEnd={handleTransitionEnd}
            className="flex items-stretch"
            style={{
              gap: `${CARD_GAP}px`,
              transform: getTransform(),
              transition: transitionEnabled ? `transform ${TRANSITION_MS}ms cubic-bezier(0.2,0.8,0.2,1)` : 'none',
              willChange: 'transform',
              touchAction: 'pan-y',
              pointerEvents: isAnimating ? 'none' : 'auto',
            }}
          >
            {items.map((category, index) => {
              const raw = (index - CLONE_COUNT) % categories.length
              const origIndex = ((raw + categories.length) % categories.length)
              const images = [C1, C2, C3, C4, C5, C6]
              const imageSrc = images[origIndex % images.length]
              return (
                <div
                  key={`${category.id}-${index}`}
                  style={{
                    width: `${slotWidth}px`,
                    minWidth: `${slotWidth}px`,
                    maxWidth: `${slotWidth}px`,
                    flexShrink: 0,
                  }}
                >
                  <CategoryCard category={category} image={imageSrc} />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
