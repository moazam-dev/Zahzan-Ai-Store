'use client'

import Img from './Img'
import { useCallback, useEffect, useRef, useState } from 'react'
import { shopCategoryHref } from '../data/categories'

// Ported from the "Shop By Story" design-canvas file. The canvas version uses
// <image-slot> placeholders, <sc-for>/<sc-if> templating and a DCLogic class;
// here the slots are real images and the logic is React state.
//
// The suits below are the design's own fixture data, not database products, so
// the heart and "Add to Bag" controls keep the design's local-only behaviour
// rather than calling WishlistContext/CartContext -- those need real product
// ids, which this fixture copy does not have.
const CATS = [
  {
    id: 'embroidery',
    name: 'Naqsh - Embroidered',
    line: 'Threadwork, slowly done.',
    mood: '/images/unfolding_embroidery.jpg',
    suits: [{ name: 'Resham Embroidered Suit', price: 9500, image: '/images/C5.webp' }]
  },
  {
    id: 'printed-trouser',
    name: 'Gul - Printed Trouser',
    line: 'The print lives below.',
    mood: '/images/editorial_detail.jpg',
    note: {
      kicker: 'The Printed Trouser Edit',
      title: 'Quiet on top, a story below.',
      body: 'Four two-piece suits, each pairing a calm, tonal shirt with a hand-inspired printed trouser — ajrak blocks, chintz florals, paisley and Mughal tile. Easy for everyday, polished enough for evenings.',
      link: 'Shop All 4 Suits'
    },
    suits: [
      { name: 'Ajrak Block Suit', price: 5950, image: '/images/h1.jpeg' },
      { name: 'Chintz Floral Suit', price: 5950, image: '/images/h2.jpeg' },
      { name: 'Paisley Straight Suit', price: 5750, image: '/images/h3.jpeg' },
      { name: 'Mughal Tile Suit', price: 6150, image: '/images/h4.jpg' }
    ]
  },
  {
    id: 'solids',
    name: 'Sukoon - Solids',
    line: 'One colour, head to toe.',
    mood: '/images/craftsmanship_fabric.jpg',
    suits: [
      { name: 'Ivory Cotton Suit', price: 4950, image: '/images/C1.webp' },
      { name: 'Olive Lawn Suit', price: 4950, image: '/images/C2.webp' }
    ]
  }
]

const slug = (s) => s.toLowerCase().replace(/\s+/g, '-')

// One viewport of scroll per row. The track keeps a fixed height, so opening
// and closing rows never moves the document under the reader -- the stage is
// pinned and only its own contents change.
const STEP_VH = 100
const STEPS = CATS.length

// The pinned stage has to fit one screen, so its images and type run on
// viewport-relative clamps. In normal flow the design's fixed sizes apply.
const SIZES = {
  pinned: {
    headingBlock: 'pt-[clamp(20px,4vh,76px)] pb-[clamp(12px,2.5vh,56px)]',
    headerRow: 'py-[clamp(8px,1.6vh,28px)]',
    catFont: 'clamp(28px, 4vw, 64px)',
    panelPad: 'pb-[clamp(10px,2vh,48px)]',
    mood: 'h-[clamp(150px,26vh,440px)]',
    cardImage: 'h-[clamp(150px,22vh,333px)]',
    card: 'w-[clamp(150px,14vw,250px)]',
    column: 'clamp(150px, 14vw, 250px)'
  },
  flow: {
    headingBlock: 'pt-[76px] pb-14',
    headerRow: 'py-7',
    catFont: 'clamp(40px, 6vw, 88px)',
    panelPad: 'pb-12',
    mood: 'h-[440px]',
    cardImage: 'h-[333px]',
    card: 'w-[250px]',
    column: '250px'
  }
}

export default function ShopByStorySection({ defaultOpen = 1 }) {
  const [open, setOpen] = useState(defaultOpen)
  const [wish, setWish] = useState({})
  const [added, setAdded] = useState(null)
  const [pinned, setPinned] = useState(false)
  const addedTimer = useRef(null)
  const trackRef = useRef(null)

  // Pin only where a full stage actually fits. Narrow or short viewports keep
  // the plain click-driven accordion.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px) and (min-height: 640px)')
    const apply = () => setPinned(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Scroll progress through the track drives which row is open.
  useEffect(() => {
    if (!pinned) return undefined

    let frame = 0
    const update = () => {
      frame = 0
      const track = trackRef.current
      if (!track) return
      const scrollable = track.offsetHeight - window.innerHeight
      if (scrollable <= 0) return
      const travelled = -track.getBoundingClientRect().top
      const progress = Math.min(Math.max(travelled / scrollable, 0), 1)
      const index = Math.min(STEPS - 1, Math.floor(progress * STEPS))
      setOpen((prev) => (prev === index ? prev : index))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [pinned])

  // Scrolls to the middle of a row's step, which the scroll handler then reads
  // back as that row being open.
  const scrollToStep = useCallback((index) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const scrollable = track.offsetHeight - window.innerHeight
    const top = window.scrollY + rect.top + (scrollable * (index + 0.5)) / STEPS
    window.scrollTo({ top, behavior: 'smooth' })
  }, [])

  // The nav menu links to /#story-<id>.
  useEffect(() => {
    const openFromHash = () => {
      const id = window.location.hash.slice(1)
      if (!id.startsWith('story-')) return
      const index = CATS.findIndex((cat) => `story-${cat.id}` === id)
      if (index === -1) return
      setOpen(index)
      if (pinned) scrollToStep(index)
      else document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [pinned, scrollToStep])

  const handleRowClick = (index, isOpen) => {
    // While pinned, the row is a consequence of scroll position, so a click
    // moves the scroll rather than setting state that the next frame undoes.
    if (pinned) scrollToStep(index)
    else setOpen(isOpen ? -1 : index)
  }

  const toggleWish = (key) => {
    setWish((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const markAdded = (key) => {
    setAdded(key)
    clearTimeout(addedTimer.current)
    addedTimer.current = setTimeout(() => setAdded(null), 1400)
  }

  useEffect(() => () => clearTimeout(addedTimer.current), [])

  const size = pinned ? SIZES.pinned : SIZES.flow

  const stage = (
    <div className={pinned ? 'sticky top-0 flex h-screen flex-col overflow-hidden' : ''}>
      <div className={`flex justify-center px-6 ${size.headingBlock}`}>
        <h2 className="m-0 pl-[0.2em] text-center text-[22px] font-normal uppercase leading-[1.3] tracking-[0.2em] text-[#171717] sm:text-[28px]">
          Shop By Story
        </h2>
      </div>

      <div
        className={`mx-auto flex w-full max-w-[1760px] flex-col border-b border-[#d6d1c8] px-4 sm:px-[42px] ${
          pinned ? 'min-h-0 flex-1' : ''
        }`}
      >
        {CATS.map((cat, index) => {
          const isOpen = open === index
          const count = `${cat.suits.length} ${cat.suits.length === 1 ? 'Suit' : 'Suits'}`

          return (
            <div
              key={cat.name}
              id={`story-${cat.id}`}
              className="flex scroll-mt-24 flex-col border-t border-[#d6d1c8]"
            >
              <button
                type="button"
                onClick={() => handleRowClick(index, isOpen)}
                aria-expanded={isOpen}
                className={`grid cursor-pointer grid-cols-[32px_minmax(0,1fr)_auto_24px] items-center gap-3 border-0 bg-transparent p-0 text-left sm:grid-cols-[64px_minmax(0,1fr)_auto_32px] sm:gap-6 ${size.headerRow}`}
              >
                <span className="text-[11px] font-medium tracking-[0.25em] text-[#5a5e4b]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span
                  className="font-serif-editorial font-light uppercase leading-none tracking-[0.02em] transition-colors duration-300"
                  style={{ fontSize: size.catFont, color: isOpen ? '#1c1b18' : '#8a857c' }}
                >
                  {cat.name}
                </span>
                <span className="whitespace-nowrap text-[10px] font-normal uppercase tracking-[0.2em] text-[#706c64] sm:text-xs">
                  {count}
                </span>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1c1b18"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  className="transition-transform duration-[400ms] ease-in-out"
                  style={{ transform: `rotate(${isOpen ? '45deg' : '0deg'})` }}
                >
                  <path d="M5 12h14" />
                  <path d="M12 5v14" />
                </svg>
              </button>

              <div
                className="grid"
                style={{
                  gridTemplateRows: isOpen ? '1fr' : '0fr',
                  transition: 'grid-template-rows 600ms cubic-bezier(0.16,1,0.3,1)'
                }}
              >
                <div className="min-h-0 overflow-hidden">
                  <div
                    className={`flex gap-5 pt-1 sm:pl-[88px] ${size.panelPad} ${
                      pinned ? 'flex-nowrap' : 'flex-wrap'
                    }`}
                    style={{
                      opacity: isOpen ? 1 : 0,
                      transition: 'opacity 500ms ease'
                    }}
                  >
                    <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-10">
                      <div className={`relative w-full overflow-hidden bg-[#f3efe8] ${size.mood}`}>
                        <Img sizes="(max-width: 1023px) 100vw, 40vw" src={cat.mood} alt={`${cat.name} campaign`} className="h-full w-full object-cover object-center" />
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/35 to-transparent" />
                        <p className="font-serif-editorial pointer-events-none absolute bottom-7 left-8 right-6 m-0 text-[clamp(20px,2.6vh,30px)] font-light italic leading-[1.2] text-white">
                          {cat.line}
                        </p>
                      </div>

                      {cat.note && (
                        <div className="flex max-w-[520px] flex-col items-start gap-[18px] pt-2">
                          <span className="text-[9px] font-medium uppercase tracking-[0.25em] text-[#5a5e4b]">
                            {cat.note.kicker}
                          </span>
                          <h4 className="font-serif-editorial m-0 text-[clamp(26px,3.4vh,40px)] font-light leading-[1.1] text-[#1c1b18] text-balance">
                            {cat.note.title}
                          </h4>
                          <p className={`m-0 text-sm font-light leading-[1.75] text-[#706c64] text-pretty ${pinned ? 'line-clamp-3' : ''}`}>
                            {cat.note.body}
                          </p>
                          <a
                            href={shopCategoryHref(cat.name)}
                            className="mt-1.5 border-b border-[#1c1b18] pb-1 text-[13px] font-normal uppercase leading-none tracking-[0.2em] text-[#1c1b18] transition-colors hover:text-[#5a5e4b]"
                          >
                            {cat.note.link}
                          </a>
                        </div>
                      )}
                    </div>

                    <div
                      className="grid flex-none content-start gap-x-5 gap-y-10"
                      style={{
                        // Pinned, the suits sit on one row so the stage stays a
                        // single screen tall; in flow they keep the design's
                        // two-column grid.
                        gridTemplateColumns: pinned
                          ? `repeat(${cat.suits.length}, ${size.column})`
                          : `repeat(${cat.suits.length > 1 ? 2 : 1}, ${size.column})`
                      }}
                    >
                      {cat.suits.map((suit) => {
                        const key = slug(suit.name)
                        return (
                          <article key={key} className={`flex min-w-0 flex-col ${size.card}`}>
                            <div className={`relative w-full overflow-hidden bg-[#f3efe8] ${size.cardImage}`}>
                              <Img sizes="(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw" src={suit.image} alt={suit.name} className="h-full w-full object-cover object-center" />
                              <button
                                type="button"
                                onClick={() => toggleWish(key)}
                                aria-label="Add to wishlist"
                                aria-pressed={!!wish[key]}
                                className="absolute right-3 top-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 bg-[#faf8f5]/80 p-0"
                              >
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill={wish[key] ? '#1c1b18' : 'none'}
                                  stroke="#1c1b18"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                                </svg>
                              </button>
                            </div>

                            <div className="flex flex-col gap-1.5 pt-3.5">
                              <span className="text-[9px] font-medium uppercase tracking-[0.25em] text-[#5a5e4b]">
                                2 Piece Suit
                              </span>
                              <a
                                href={shopCategoryHref(cat.name)}
                                className="font-serif-editorial text-xl font-light leading-[1.3] text-[#1c1b18] transition-colors hover:text-[#5a5e4b]"
                              >
                                {suit.name}
                              </a>
                              <div className="mt-0.5 flex items-center justify-between gap-2">
                                <span className="text-xs font-medium">PKR {suit.price.toLocaleString()}</span>
                                <button
                                  type="button"
                                  onClick={() => markAdded(key)}
                                  className="cursor-pointer border-0 border-b border-[#1c1b18] bg-transparent p-0 pb-[3px] font-sans text-[10px] uppercase tracking-[0.25em] text-[#1c1b18]"
                                >
                                  {added === key ? 'Added ✓' : 'Add to Bag'}
                                </button>
                              </div>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <section id="shop-by-story" className={`w-full bg-[#faf8f5] text-[#1c1b18] ${pinned ? '' : 'pb-20'}`}>
      {pinned ? (
        <div ref={trackRef} style={{ height: `${STEPS * STEP_VH}vh` }}>
          {stage}
        </div>
      ) : (
        stage
      )}
    </section>
  )
}
