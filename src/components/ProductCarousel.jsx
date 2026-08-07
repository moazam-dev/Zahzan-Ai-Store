import ProductCard from './ProductCard'

export default function ProductCarousel({ title, subtitle, products, id }) {
  return (
    <section id={id} className="border-t border-stone-200 bg-white px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-stone-500">{title}</p>
            <h2 className="mt-2 text-2xl font-semibold uppercase tracking-[0.2em] text-stone-900 sm:text-3xl">{subtitle}</h2>
          </div>
          <a href="/shop" className="text-sm uppercase tracking-[0.25em] text-stone-600 transition hover:text-stone-950">
            View more
          </a>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  )
}
