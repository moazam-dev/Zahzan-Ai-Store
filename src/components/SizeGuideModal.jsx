import React from 'react'
import { X } from 'lucide-react'

export default function SizeGuideModal({ isOpen, onClose }) {
  if (!isOpen) return null

  const sizeChart = [
    { size: 'XS', bust: '34"', waist: '26"', hips: '36"', shoulder: '14.0"', length: '42"' },
    { size: 'S', bust: '36"', waist: '28"', hips: '38"', shoulder: '14.5"', length: '43"' },
    { size: 'M', bust: '39"', waist: '31"', hips: '41"', shoulder: '15.0"', length: '44"' },
    { size: 'L', bust: '42"', waist: '34"', hips: '44"', shoulder: '15.5"', length: '45"' },
    { size: 'XL', bust: '45"', waist: '37"', hips: '47"', shoulder: '16.0"', length: '45"' },
  ]

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 bg-[#1c1b18]/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl bg-[#faf8f5] text-[#1c1b18] p-6 sm:p-10 shadow-2xl border border-[#e8e4dc] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* CLOSE BUTTON */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 p-2 text-[#706c64] hover:text-[#1c1b18] transition-colors cursor-pointer"
          aria-label="Close size guide"
        >
          <X size={20} />
        </button>

        {/* HEADER */}
        <div className="space-y-1 pb-6 border-b border-[#e8e4dc]">
          <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b]">
            FIT & MEASUREMENTS
          </span>
          <h3 className="font-serif text-2xl sm:text-3xl font-light text-[#1c1b18]">
            Size Guide & Fit Proportions
          </h3>
          <p className="text-xs font-sans text-[#706c64] font-light">
            All measurements in inches unless specified. Our garments are designed with a relaxed, fluid silhouette.
          </p>
        </div>

        {/* MEASUREMENT TABLE */}
        <div className="py-6 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-sans">
            <thead>
              <tr className="border-b border-[#1c1b18] text-[#1c1b18] uppercase tracking-[0.2em] font-medium text-[10px]">
                <th className="py-3 px-2">Size</th>
                <th className="py-3 px-2">Bust / Chest</th>
                <th className="py-3 px-2">Waist</th>
                <th className="py-3 px-2">Hips</th>
                <th className="py-3 px-2">Shoulder</th>
                <th className="py-3 px-2">Kameez Length</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e4dc]">
              {sizeChart.map((row) => (
                <tr key={row.size} className="hover:bg-[#f3efe8]/50 transition-colors">
                  <td className="py-3 px-2 font-medium text-[#1c1b18]">{row.size}</td>
                  <td className="py-3 px-2 text-[#706c64]">{row.bust}</td>
                  <td className="py-3 px-2 text-[#706c64]">{row.waist}</td>
                  <td className="py-3 px-2 text-[#706c64]">{row.hips}</td>
                  <td className="py-3 px-2 text-[#706c64]">{row.shoulder}</td>
                  <td className="py-3 px-2 text-[#706c64]">{row.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* MEASURING ADVICE */}
        <div className="pt-4 border-t border-[#e8e4dc] grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans text-[#706c64] font-light">
          <div>
            <h4 className="font-medium text-[#1c1b18] uppercase tracking-wider text-[10px] mb-1">
              HOW TO MEASURE
            </h4>
            <p className="leading-relaxed">
              Measure around the fullest part of your chest and hips. Keep the tape relaxed and parallel to the floor for accurate sizing.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-[#1c1b18] uppercase tracking-wider text-[10px] mb-1">
              FIT ADVICE
            </h4>
            <p className="leading-relaxed">
              If you fall between two sizes, we recommend sizing up for a classic flowing kameez silhouette, or sizing down for a closer tailored fit.
            </p>
          </div>
        </div>

        {/* CLOSE ACTION */}
        <div className="mt-8 pt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-[#1c1b18] text-[#faf8f5] text-xs font-sans uppercase tracking-[0.25em] hover:bg-[#5a5e4b] transition-colors cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  )
}
