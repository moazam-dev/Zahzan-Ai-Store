import { useParams } from 'react-router-dom'
import AnnouncementBar from '../components/AnnouncementBar'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { products } from '../data/products'

export default function Product() {
  const { id } = useParams()
  const product = products.find((item) => item.id === Number(id))

  if (!product) {
    return <div className="min-h-screen bg-white p-10 text-center text-stone-700">Product not found.</div>
  }

  return (
    <div className="min-h-screen bg-white">
      <AnnouncementBar />
      <Header />
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <img src={product.image} alt={product.name} className="h-[32rem] w-full object-cover rounded-[2rem]" />
          <div className="flex flex-col justify-center">
            <p className="text-[11px] uppercase tracking-[0.35em] text-stone-500">{product.category}</p>
            <h1 className="mt-3 text-3xl font-semibold uppercase tracking-[0.2em] text-stone-900 sm:text-4xl">{product.name}</h1>
            <p className="mt-4 text-lg leading-8 text-stone-600">{product.description}</p>
            <p className="mt-6 text-2xl font-semibold text-stone-900">PKR {product.price.toLocaleString()}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {product.sizes.map((size) => (
                <span key={size} className="rounded-full border border-stone-300 px-4 py-2 text-sm uppercase tracking-[0.2em] text-stone-700">
                  {size}
                </span>
              ))}
            </div>
            <button className="mt-8 rounded-full bg-stone-900 px-6 py-3 text-sm font-medium uppercase tracking-[0.25em] text-white transition hover:bg-stone-700">
              Add to bag
            </button>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  )
}
