import AnnouncementBar from '../components/AnnouncementBar'
import Header from '../components/Header'
import Hero from '../components/Hero'
import CategoryCarousel from '../components/CategoryCarousel'
import ProductCarousel from '../components/ProductCarousel'
import EditorialBanner from '../components/EditorialBanner'
import TryOnSection from '../components/TryOnSection'
import ReviewCarousel from '../components/ReviewCarousel'
import SocialGrid from '../components/SocialGrid'
import Newsletter from '../components/Newsletter'
import Footer from '../components/Footer'
import { categories } from '../data/categories'
import { featuredProducts, bestSellers } from '../data/products'

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-stone-900">
      <AnnouncementBar />
      <div className="relative">
        <Hero btnLeft="20.5%" btnTop="50.5%" />
        <Header />
      </div>
      <CategoryCarousel categories={categories} />
      <TryOnSection />
      <ProductCarousel title="New Arrivals" subtitle="Discover the latest pieces from our collection." products={featuredProducts} id="new-arrivals" />
      <EditorialBanner />
      <ProductCarousel title="Best Sellers" subtitle="The pieces our clients return to again and again." products={bestSellers} id="best-sellers" />
      <section className="border-t border-stone-200 bg-stone-900 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 rounded-[2rem] border border-white/10 bg-white/10 px-6 py-10 text-white sm:px-8 lg:px-10">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-stone-300">Made to be remembered</p>
            <h2 className="mt-3 text-2xl font-semibold uppercase tracking-[0.2em] sm:text-3xl">
              Crafted for the women who lead with presence.
            </h2>
          </div>
          <a href="/collections" className="rounded-full border border-white/60 px-6 py-3 text-sm uppercase tracking-[0.25em] transition hover:bg-white/10">
            Explore the collection
          </a>
        </div>
      </section>
      <ReviewCarousel />
      <SocialGrid />
      <Newsletter />
      <Footer />
    </div>
  )
}
