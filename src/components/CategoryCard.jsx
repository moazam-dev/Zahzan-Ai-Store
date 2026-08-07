export default function CategoryCard({ category }) {
  return (
    <article className="group min-w-[80%] overflow-hidden border border-stone-200 bg-white sm:min-w-[45%] lg:min-w-0">
      <div className="overflow-hidden">
        <img
          src={category.image}
          alt={category.name}
          className="h-72 w-full object-cover transition duration-500 group-hover:scale-[1.03] sm:h-80"
        />
      </div>
      <div className="flex items-center justify-between px-5 py-5">
        <div>
          <h3 className="text-lg font-medium uppercase tracking-[0.2em] text-stone-900">{category.name}</h3>
          <p className="mt-1 text-sm text-stone-500">{category.description}</p>
        </div>
        <span className="text-sm uppercase tracking-[0.25em] text-stone-600 transition group-hover:text-stone-950">
          View
        </span>
      </div>
    </article>
  )
}
