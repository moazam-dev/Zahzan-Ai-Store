import CategoryCard from './CategoryCard'

export default function CategoryCarousel({ categories }) {
  return (
    <section id="collections" className="border-t border-stone-200 bg-stone-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-stone-500">Shop by Category</p>
            <h2 className="mt-2 text-2xl font-semibold uppercase tracking-[0.2em] text-stone-900 sm:text-3xl">
              Curated for every occasion
            </h2>
          </div>
          <a href="/shop" className="hidden text-sm uppercase tracking-[0.25em] text-stone-600 transition hover:text-stone-950 sm:block">
            Browse all
          </a>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-3 lg:grid lg:grid-cols-3 xl:grid-cols-6 lg:overflow-visible">
          {categories.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      </div>
    </section>
  )
}
