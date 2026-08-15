'use client'

const socialTiles = [
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=900&q=80'
]

export default function SocialGrid() {
  return (
    <section className="border-t border-stone-200 bg-stone-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-stone-500">Follow the Story</p>
            <h2 className="mt-2 text-2xl font-semibold uppercase tracking-[0.2em] text-stone-900 sm:text-3xl">
              A living archive of modern elegance
            </h2>
          </div>
          <a href="/collections" className="text-sm uppercase tracking-[0.25em] text-stone-600 transition hover:text-stone-950">
            @aurélia
          </a>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {socialTiles.map((tile, index) => (
            <div key={tile} className={`overflow-hidden rounded-[2rem] border border-stone-200 bg-white ${index === 0 ? 'sm:col-span-2 sm:row-span-2' : ''}`}>
              <img src={tile} alt={`Editorial fashion tile ${index + 1}`} className={`h-full w-full object-cover ${index === 0 ? 'min-h-[24rem]' : 'h-64'}`} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
