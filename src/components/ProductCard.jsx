import { Link, useNavigate } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'

export default function ProductCard({ product }) {
  const { addToCart } = useCart()
  const { isInWishlist, toggleWishlist } = useWishlist()
  const navigate = useNavigate()
  const productId = product.id || product._id
  const isSaved = isInWishlist(productId)

  const imageSrc = (product.images && product.images[0]) || product.image

  return (
    <article className="group relative flex flex-col justify-between select-none">
      
      {/* IMAGE CONTAINER WITH HOVER REVEAL & ADD TO BAG OVERLAY */}
      <div 
        onClick={() => navigate(`/product/${productId}`)}
        className="relative aspect-[3/4] overflow-hidden bg-[#f3efe8] cursor-pointer"
      >
        {/* Main Product Image */}
        <img
          src={imageSrc}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
        />

        {/* Secondary Hover Image */}
        {product.hoverImage && (
          <img
            src={product.hoverImage}
            alt={`${product.name} alternate view`}
            className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
        )}

        {/* Badge */}
        {product.badge && (
          <span className="absolute left-3 top-3 bg-[#faf8f5]/90 border border-[#e8e4dc] px-2.5 py-1 text-[9px] font-sans font-medium uppercase tracking-[0.3em] text-[#5a5e4b]">
            {product.badge}
          </span>
        )}

        {/* Wishlist Heart Action Button */}
        <button
          type="button"
          aria-label={isSaved ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
          aria-pressed={isSaved}
          onClick={(e) => {
            e.stopPropagation()
            toggleWishlist(productId)
          }}
          className="absolute right-3 top-3 z-10 p-2 rounded-full bg-[#faf8f5]/80 backdrop-blur-xs text-[#1c1b18] hover:scale-110 transition-transform cursor-pointer"
        >
          <Heart size={16} fill={isSaved ? '#1c1b18' : 'none'} className="text-[#1c1b18]" />
        </button>

        {/* Quick Add To Bag Overlay Button on Hover */}
        <div className="absolute inset-x-0 bottom-0 p-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              addToCart(product)
            }}
            className="w-full bg-[#1c1b18]/90 backdrop-blur-xs text-[#faf8f5] text-[10px] font-sans uppercase tracking-[0.25em] py-2.5 px-4 hover:bg-[#5a5e4b] transition-colors cursor-pointer"
          >
            ADD TO BAG +
          </button>
        </div>

      </div>

      {/* PRODUCT DETAILS BELOW IMAGE */}
      <div className="pt-3.5 space-y-1 text-left">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-[9px] font-sans font-medium uppercase tracking-[0.25em] text-[#5a5e4b] block">
              {product.category}
            </span>
            <Link
              to={`/product/${productId}`}
              className="font-serif text-lg font-light text-[#1c1b18] hover:text-[#5a5e4b] transition-colors block leading-snug"
            >
              {product.name}
            </Link>
          </div>

          <span className="text-xs font-sans font-medium text-[#1c1b18] pt-0.5">
            PKR {product.price.toLocaleString()}
          </span>
        </div>

        <p className="text-xs font-sans text-[#706c64] font-light line-clamp-1">
          {product.description}
        </p>
      </div>

    </article>
  )
}
