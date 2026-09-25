'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Img from './Img'
import { optimizedSrcSet } from '../lib/imageOptimization'
import { shopCategoryHref } from '../data/categories'

// Imported rather than referenced as '/images/...' strings: Next.js serves an
// imported file under a content-hashed URL, so replacing an image with a new
// one of the same name changes its URL and every cache (browser, optimiser,
// CDN) picks it up immediately instead of showing the old picture.
import desktop1 from '../public/images/1h.avif'
import desktop2 from '../public/images/2h.avif'
import desktop3 from '../public/images/3h.avif'
import desktop4 from '../public/images/4h.avif'
import mobile1 from '../public/images/1m.avif'
import mobile2 from '../public/images/2m.avif'
import mobile3 from '../public/images/3m.avif'
import mobile4 from '../public/images/4m.avif'
import mobile5 from '../public/images/5m.avif'

// Two independent campaigns, each slide opening the shop filtered to the
// collection it shows: wide images on desktop, 9:16 portrait images on phones
// and portrait tablets. They differ in length, so slide N pairs DESKTOP[N]
// with MOBILE[N] where both exist.
const DESKTOP_SLIDES = [
  { src: desktop1, alt: 'Naqsh collection', href: shopCategoryHref('Naqsh - Embroidered') },
  { src: desktop2, alt: 'Sukoon collection', href: shopCategoryHref('Sukoon - Solids') },
  { src: desktop3, alt: 'Gul collection', href: shopCategoryHref('Gul - Printed Trouser') },
  { src: desktop4, alt: 'Zahzan collection', href: '/shop' }
]

const MOBILE_SLIDES = [
  { src: mobile1, alt: 'Naqsh collection', href: shopCategoryHref('Naqsh - Embroidered') },
  { src: mobile2, alt: 'Sukoon collection', href: shopCategoryHref('Sukoon - Solids') },
  { src: mobile3, alt: 'Gul collection', href: shopCategoryHref('Gul - Printed Trouser') },
  { src: mobile4, alt: 'Gul collection', href: shopCategoryHref('Gul - Printed Trouser') },
  { src: mobile5, alt: 'Launch sale', href: '/shop' }
]

// Below Tailwind's `lg` breakpoint, i.e. phones and portrait tablets.
const MOBILE_QUERY = '(max-width: 1023px)'

// Each slide carries both images; <picture> picks one before any JS runs, so
// the first paint already shows the right campaign. `isMobile` only decides
// the slide count and each slide's link.
function buildSlides(isMobile) {
  const primary = isMobile ? MOBILE_SLIDES : DESKTOP_SLIDES
  return primary.map((slide, i) => ({
    key: slide.src.src,
    href: slide.href,
    alt: slide.alt,
    desktopSrc: DESKTOP_SLIDES[i]?.src ?? slide.src,
    mobileSrc: MOBILE_SLIDES[i]?.src ?? slide.src
  }))
}

const INTERVAL_MS = 5000
const TRANSITION_MS = 1800
const SWIPE_THRESHOLD = 40

// The track carries a clone of the last slide in front and the first slide
// behind, so a wrap keeps sliding the same direction instead of rewinding
// across every frame. Position 1 is the first real slide.
const FIRST = 1

export default function Hero({ btnLeft = '8%', btnTop = '55%' }) {
  const [position, setPosition] = useState(FIRST)
  const [animated, setAnimated] = useState(true)
  const [height, setHeight] = useState(null)
  const touchStartX = useRef(0)
  const sectionRef = useRef(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY)
    const update = () => {
      setIsMobile(media.matches)
      setAnimated(false)
      setPosition(FIRST)
    }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const SLIDES = buildSlides(isMobile)
  const TRACK = [SLIDES[SLIDES.length - 1], ...SLIDES, SLIDES[0]]
  const LAST = SLIDES.length

  const activeIndex = ((position - FIRST) % SLIDES.length + SLIDES.length) % SLIDES.length

  // The hero sits below AnnouncementBar, so a flat 100vh would push its bottom
  // edge past the fold. Measure what is actually left of the viewport and end
  // the image exactly there.
  useLayoutEffect(() => {
    const measure = () => {
      const el = sectionRef.current
      if (!el) return
      const offsetTop = el.getBoundingClientRect().top + window.scrollY
      setHeight(Math.max(0, window.innerHeight - offsetTop))
    }

    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])

  // Autoplay every INTERVAL_MS, skipped for readers who ask for reduced motion.
  // The position dependency restarts the clock after a manual move.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    const timer = setInterval(() => setPosition((prev) => prev + 1), INTERVAL_MS)
    return () => clearInterval(timer)
  }, [position])

  // Re-arm the transition on the frame after a silent jump across a clone.
  useEffect(() => {
    if (animated) return undefined
    const frame = requestAnimationFrame(() => setAnimated(true))
    return () => cancelAnimationFrame(frame)
  }, [animated])

  // Landing on a clone means the loop just wrapped: swap to the matching real
  // slide with the transition off, so the swap itself is never seen.
  const handleTransitionEnd = () => {
    if (position > LAST) {
      setAnimated(false)
      setPosition(FIRST)
    } else if (position < FIRST) {
      setAnimated(false)
      setPosition(LAST)
    }
  }

  const goTo = useCallback((slideIndex) => {
    setPosition(FIRST + slideIndex)
  }, [])

  const onTouchStart = (event) => {
    touchStartX.current = event.touches[0]?.clientX ?? 0
  }

  const onTouchEnd = (event) => {
    const delta = touchStartX.current - (event.changedTouches[0]?.clientX ?? 0)
    if (Math.abs(delta) < SWIPE_THRESHOLD) return
    setPosition((prev) => prev + (delta > 0 ? 1 : -1))
  }

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden bg-[#f3efe8]"
      style={{
        ['--hero-btn-left']: btnLeft,
        ['--hero-btn-top']: btnTop,
        height: height ? `${height}px` : '100svh'
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      aria-roledescription="carousel"
      aria-label="Hero"
    >
      <div
        className="flex h-full w-full"
        onTransitionEnd={handleTransitionEnd}
        style={{
          transform: `translate3d(-${position * 100}%, 0, 0)`,
          transition: animated ? `transform ${TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)` : 'none',
          willChange: 'transform'
        }}
      >
        {TRACK.map((slide, trackIndex) => (
          <Link
            key={`${slide.key}-${trackIndex}`}
            href={slide.href}
            aria-hidden={trackIndex !== position}
            tabIndex={trackIndex === position ? undefined : -1}
            className="block h-full w-full flex-none"
            draggable={false}
          >
            <picture className="block h-full w-full">
              <source media={MOBILE_QUERY} srcSet={optimizedSrcSet(slide.mobileSrc)} sizes="100vw" />
              <Img
                sizes="100vw"
                src={slide.desktopSrc}
                alt={trackIndex === 0 || trackIndex === TRACK.length - 1 ? '' : slide.alt}
                // The first real slide carries the LCP, so it loads eagerly and the
                // rest stay lazy.
                loading={trackIndex === FIRST ? 'eager' : 'lazy'}
                fetchPriority={trackIndex === FIRST ? 'high' : 'auto'}
                className="h-full w-full object-cover"
                draggable={false}
              />
            </picture>
          </Link>
        ))}
      </div>

      {/* SLIDE INDICATORS */}
      <div className="absolute inset-x-0 bottom-8 z-10 flex items-center justify-center gap-3">
        {SLIDES.map((slide, slideIndex) => (
          <button
            key={slide.key}
            type="button"
            onClick={() => goTo(slideIndex)}
            aria-label={`Go to slide ${slideIndex + 1}`}
            aria-current={slideIndex === activeIndex}
            className="h-[3px] w-10 cursor-pointer border-0 bg-white/40 p-0 transition-colors duration-300 hover:bg-white/70"
            style={{ backgroundColor: slideIndex === activeIndex ? '#ffffff' : undefined }}
          />
        ))}
      </div>
{/*
      <button
        type="button"
        className="absolute z-10 inline-flex items-center justify-center rounded-md border border-black bg-black px-10 py-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-transparent hover:text-black"
        style={{ left: 'var(--hero-btn-left)', top: 'var(--hero-btn-top)' }}
      >
        Shop now
      </button> */}
    </section>
  )
}
