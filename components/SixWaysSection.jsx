'use client'

import Img from './Img'
import { shopCategoryHref } from '../data/categories'

// Ported from the "Six Ways Section" design-canvas file. The canvas version
// uses <image-slot> placeholders and an <sc-if> scrim toggle; here the slots
// are the real category images and the scrim is the `showScrim` prop.
const EDITS = [
  { id: 'six-1', image: '/images/1s.jpeg', lines: ['Naqsh -', 'Embroidered'], href: shopCategoryHref('Naqsh - Embroidered') },
  { id: 'six-2', image: '/images/2ss.png', lines: ['Gul -', 'Printed Trouser'], href: shopCategoryHref('Gul - Printed Trouser') },
  { id: 'six-3', image: '/images/3ss.jpeg', lines: ['Sukoon -', 'Solids'], href: shopCategoryHref('Sukoon - Solids') }
]

export default function SixWaysSection({ showScrim = true }) {
  return (
    <section className="w-full bg-[#eeeeee]">
      <div className="flex justify-center px-6 pb-10 pt-12 sm:pb-[66px] sm:pt-[76px]">
        <h2 className="m-0 pl-[0.2em] text-center text-[20px] font-normal uppercase leading-[1.3] tracking-[0.2em] text-[#171717] sm:text-[28px]">
          Three Ways To Wear Elegance
        </h2>
      </div>

      <div className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto">
        {EDITS.map((edit) => (
          <a
            key={edit.id}
            href={edit.href}
            className="group relative block min-w-[300px] flex-[0_0_33.3333%] snap-start overflow-hidden"
            style={{ aspectRatio: '631 / 620' }}
          >
            <Img sizes="(max-width: 1023px) 80vw, 33vw"
              src={edit.image}
              alt={edit.lines.join(' ')}
              className="h-full w-full object-cover object-center transition-transform duration-[1200ms] ease-out group-hover:scale-[1.06]"
            />

            {showScrim && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/35 to-transparent transition-all duration-500 ease-out group-hover:h-3/5 group-hover:from-black/60" />
            )}

            <div className="pointer-events-none absolute bottom-[22px] left-6 right-6 flex flex-col items-start gap-4 lg:gap-5 transition-transform duration-500 ease-out group-hover:-translate-y-1.5 lg:left-12">
              <h3 className="m-0 text-[17px] font-normal uppercase leading-[26px] tracking-[0.15em] text-white lg:text-[22px] lg:leading-[33px] lg:tracking-[0.2em]">
                {edit.lines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </h3>
              <span className="inline-flex items-center gap-2 border-b border-white pb-[3px] text-[13px] font-normal uppercase leading-none text-white transition group-hover:opacity-80">
                Shop Now
                <span
                  aria-hidden="true"
                  className="-translate-x-1 opacity-0 transition-all duration-500 ease-out group-hover:translate-x-0 group-hover:opacity-100"
                >
                  →
                </span>
              </span>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}
