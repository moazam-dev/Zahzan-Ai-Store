'use client'

const heroMain = '/images/heromain2.png'

export default function Hero({ btnLeft = '8%', btnTop = '55%' }) {
  return (
    <section
      className="w-full h-screen overflow-hidden relative"
      style={{ ['--hero-btn-left']: btnLeft, ['--hero-btn-top']: btnTop }}
    >
      <img
        src={heroMain}
        alt="Main hero"
        className="h-full w-full object-cover"
      />
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
    