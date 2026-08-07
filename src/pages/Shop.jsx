import AnnouncementBar from '../components/AnnouncementBar'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { products } from '../data/products'
import ProductCard from '../components/ProductCard'

export default function Shop() {
  return (
    <div className="min-h-screen bg-white">
      <AnnouncementBar />
      <Header />
      <section className="border-b border-stone-200 bg-stone-50 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-[11px] uppercase tracking-[0.35em] text-stone-500">Shop</p>
          <h1 className="mt-3 text-3xl font-semibold uppercase tracking-[0.2em] text-stone-900 sm:text-4xl">
            Curated essentials for the season
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-stone-600">
            Discover elegant ready-to-wear, statement unstitched pieces and premium occasionwear crafted in a contemporary silhouette.
          </p>
        </div>
      </section>
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
      <Footer />
    </div>
  )
}
