'use client'

import { useEffect, useRef, useState } from 'react'
import { Banknote, RefreshCcw, Scissors, Truck } from 'lucide-react'

// Ported from the "Why Zahzan Section" design-canvas file. The canvas version
// uses an <image-slot> placeholder, an <sc-if> offer toggle and a DCLogic
// class; here the slot is a real image and the logic is React state. The four
// icons are the same lucide glyphs the design inlined as raw SVG.
const MODEL_IMAGE = '/images/3s.jpeg'
const PROMO_CODE = 'ZAHZAN10'
const COPIED_MS = 1800

const FEATURES = [
  { Icon: Truck, title: 'Free Delivery', detail: 'Nationwide on orders over PKR 5,000' },
  { Icon: Scissors, title: 'Premium Fabric', detail: 'Soft lawn and cambric, stitched to last' },
  { Icon: RefreshCcw, title: 'Easy Exchange', detail: 'Exchange any size within 7 days' },
  { Icon: Banknote, title: 'Cash On Delivery', detail: 'Pay when your order arrives' }
]

export default function WhyZahzanSection({ showOffer = true, imageSide = 'left' }) {
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef(null)

  useEffect(() => () => clearTimeout(copiedTimer.current), [])

  const copyCode = async () => {
    try {
      await navigator.clipboard?.writeText(PROMO_CODE)
    } catch {
      // Clipboard is unavailable over plain http and in locked-down browsers;
      // the code is on screen either way, so the label still confirms the tap.
    }
    setCopied(true)
    clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS)
  }

  return (
    <section className="w-full bg-[#eeeeee] text-[#171717]">
      <div className="flex justify-center px-6 pb-10 pt-12 sm:pb-[66px] sm:pt-[76px]">
        <h2 className="m-0 pl-[0.2em] text-center text-[22px] font-normal uppercase leading-[1.3] tracking-[0.2em] text-[#171717] sm:text-[28px]">
          Why Zahzan
        </h2>
      </div>

      <div className={`flex flex-wrap ${imageSide === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className="relative min-h-[600px] min-w-0 flex-[1_1_480px] overflow-hidden bg-[#e4dfd6] sm:min-h-[720px]">
          <img src={MODEL_IMAGE} alt="Launch offer" className="absolute inset-0 h-full w-full object-cover object-top" />

          {showOffer && (
            <>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/45 to-transparent" />
              <div className="pointer-events-none absolute bottom-7 left-6 right-6 flex flex-col items-start gap-3 sm:gap-[18px] sm:left-[42px]">
                <span className="text-[11px] font-normal uppercase tracking-[0.3em] text-white sm:text-[13px]">Launch Offer</span>
                <span className="text-[34px] font-light uppercase leading-none tracking-[0.1em] text-white sm:text-[64px] sm:tracking-[0.12em]">
                  Extra 10% Off
                </span>
                <span className="text-[15px] font-normal uppercase leading-[24px] tracking-[0.2em] text-white sm:text-[22px] sm:leading-[33px]">
                  On Your First Order
                </span>

                <div className="pointer-events-auto flex flex-wrap items-center gap-4 sm:gap-6">
                  <button
                    type="button"
                    onClick={copyCode}
                    className="flex cursor-pointer items-center gap-3 border border-dashed border-white/85 bg-white/12 px-[18px] py-3 font-sans text-xs font-medium uppercase tracking-[0.25em] text-white transition-colors hover:bg-white/25"
                  >
                    <span>Code: {PROMO_CODE}</span>
                    <span className="text-[10px] font-normal tracking-[0.2em] opacity-85">
                      {copied ? 'Copied ✓' : 'Tap to copy'}
                    </span>
                  </button>

                  <a
                    href="/shop"
                    className="border-b border-white pb-[3px] text-[13px] font-normal uppercase leading-none text-white transition hover:opacity-80"
                  >
                    Shop Now
                  </a>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-[1_1_480px] flex-col justify-center gap-14 px-[clamp(24px,6vw,112px)] py-[72px]">
          <div className="flex max-w-[560px] flex-col items-start gap-[22px]">
            <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-[#5a5e4b]">Our Story</span>
            <p className="font-serif-editorial m-0 text-[clamp(32px,3.2vw,48px)] font-light leading-[1.12] text-[#1c1b18] text-balance">
              Seven suits, made slowly — so you can wear them often.
            </p>
            <p className="m-0 text-sm font-light leading-[1.8] text-[#706c64] text-pretty">
              We started small on purpose. Every two-piece is cut from fabric we&apos;ve handled ourselves, finished by
              local artisans, and checked piece by piece before it reaches you.
            </p>
            <a
              href="#craftsmanship"
              className="border-b border-[#1c1b18] pb-1 text-[13px] font-normal uppercase leading-none tracking-[0.2em] text-[#1c1b18] transition-colors hover:text-[#5a5e4b]"
            >
              Read Our Story
            </a>
          </div>

          <div className="grid grid-cols-1 border-t border-[#d6d1c8] sm:grid-cols-2">
            {FEATURES.map(({ Icon, title, detail }) => (
              <div key={title} className="flex items-start gap-4 border-b border-[#d6d1c8] py-7 pr-6">
                <Icon size={26} strokeWidth={1.25} className="flex-none text-[#1c1b18]" aria-hidden="true" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#1c1b18]">{title}</span>
                  <span className="text-[13px] font-light leading-[1.6] text-[#706c64]">{detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
