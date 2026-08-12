import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Heart } from 'lucide-react'
import AnnouncementBar from '../components/AnnouncementBar'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { products } from '../data/products'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'

export default function Product() {
  const { id } = useParams()
  const product = products.find((item) => item.id === Number(id))
  const { addToCart } = useCart()
  const { isInWishlist, toggleWishlist } = useWishlist()
  const [selectedSize, setSelectedSize] = useState(product?.sizes?.[0] || 'M')

  if (!product) {
    return <div className="min-h-screen bg-[#faf8f5] p-10 text-center text-[#706c64]">Article not found.</div>
  }

  const isSaved = isInWishlist(product.id)

  return (
    <div className="min-h-screen bg-[#faf8f5] text-[#1c1b18]">
      <AnnouncementBar />
      <Header />

      <section className="px-4 sm:px-8 lg:px-12 py-12 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
          
          <div className="lg:col-span-7 bg-[#f3efe8] aspect-[3/4] overflow-hidden border border-[#e5e0d8] relative">
            <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => toggleWishlist(product.id)}
              aria-label={isSaved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
              className="absolute right-4 top-4 z-10 p-3 rounded-full bg-[#faf8f5]/90 border border-[#e8e4dc] text-[#1c1b18] hover:scale-105 transition-transform cursor-pointer"
            >
              <Heart size={20} fill={isSaved ? '#1c1b18' : 'none'} className="text-[#1c1b18]" />
            </button>
          </div>

          <div className="lg:col-span-5 flex flex-col justify-center space-y-6 lg:pt-8">
            <div>
              <span className="text-[10px] font-sans font-medium uppercase tracking-[0.35em] text-[#5a5e4b] block mb-2">
                {product.category}
              </span>
              <h1 className="font-serif text-3xl sm:text-5xl font-light tracking-tight text-[#1a1918]">
                {product.name}
              </h1>
              <p className="mt-2 text-2xl font-serif font-light text-[#1c1b18]">
                PKR {product.price.toLocaleString()}
              </p>
            </div>

            <p className="text-xs sm:text-sm font-sans text-[#706c64] font-light leading-relaxed tracking-wide">
              {product.description}
            </p>

            <div>
              <span className="text-[10px] font-sans font-medium uppercase tracking-[0.3em] text-[#5a5e4b] block mb-3">
                SELECT SIZE
              </span>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    className={`px-4 py-2 text-xs font-sans uppercase tracking-wider border cursor-pointer ${
                      selectedSize === size
                        ? 'border-[#1c1b18] bg-[#1c1b18] text-[#faf8f5]'
                        : 'border-[#e8e4dc] bg-transparent text-[#706c64] hover:border-[#1c1b18]'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => addToCart(product, selectedSize)}
                className="flex-1 group inline-flex items-center justify-center gap-3 text-xs uppercase tracking-[0.3em] font-medium text-white bg-[#1c1b18] py-4 px-6 transition-all duration-300 hover:bg-[#5a5e4b] cursor-pointer"
              >
                <span>ADD TO BAG</span>
                <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </button>

              <button
                type="button"
                onClick={() => toggleWishlist(product.id)}
                className="inline-flex items-center justify-center gap-2 text-xs uppercase tracking-[0.25em] font-medium text-[#1c1b18] border border-[#1c1b18] py-4 px-6 hover:bg-[#1c1b18] hover:text-white transition-colors cursor-pointer"
              >
                <Heart size={16} fill={isSaved ? 'currentColor' : 'none'} />
                <span>{isSaved ? 'SAVED' : 'SAVE'}</span>
              </button>
            </div>

          </div>

        </div>
      </section>

      <Footer />
    </div>
  )
}
