import { Heart, Eye } from 'lucide-react'

export default function ProductCard({ product }) {
  return (
    <article className="group relative overflow-hidden border border-stone-200 bg-white">
      <div className="relative overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="h-80 w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        {product.hoverImage && (
          <img
            src={product.hoverImage}
            alt={`${product.name} alternate view`}
            className="absolute inset-0 h-80 w-full object-cover opacity-0 transition duration-500 group-hover:opacity-100"
          />
        )}
        {product.badge && (
          <span className="absolute left-4 top-4 rounded-full border border-white/70 bg-white/90 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-stone-700">
            {product.badge}
          </span>
        )}
        <div className="absolute right-4 top-4 flex flex-col gap-2">
          <button type="button" className="rounded-full border border-stone-200 bg-white/90 p-2 text-stone-700 transition hover:bg-stone-900 hover:text-white">
            <Heart size={16} />
          </button>
          <button type="button" className="rounded-full border border-stone-200 bg-white/90 p-2 text-stone-700 transition hover:bg-stone-900 hover:text-white">
            <Eye size={16} />
          </button>
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-stone-500">{product.category}</p>
            <h3 className="mt-2 text-lg font-medium text-stone-900">{product.name}</h3>
          </div>
          <span className="text-sm font-medium text-stone-700">PKR {product.price.toLocaleString()}</span>
        </div>
        <p className="mt-3 text-sm text-stone-500">{product.description}</p>
      </div>
    </article>
  )
}
