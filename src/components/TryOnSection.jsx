import { Sparkles, ArrowRight } from 'lucide-react'

export default function TryOnSection() {
  return (
    <section className="bg-stone-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white">
          <img
            src="https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=1440&q=80"
            alt="Luxury fashion styling"
            className="h-[28rem] w-full object-cover sm:h-[32rem]"
          />
        </div>
        <div className="rounded-[2rem] border border-stone-200 bg-white p-8 sm:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] uppercase tracking-[0.3em] text-stone-600">
            <Sparkles size={14} /> AI Virtual Try-On
          </div>
          <h2 className="mt-6 text-3xl font-semibold uppercase tracking-[0.2em] text-stone-900 sm:text-4xl">
            See it on you
          </h2>
          <p className="mt-4 text-lg leading-8 text-stone-600">
            Upload your photo and discover how your favourite pieces could look on you.
          </p>
          <a href="/collections" className="mt-8 inline-flex items-center gap-2 rounded-full bg-stone-900 px-6 py-3 text-sm font-medium uppercase tracking-[0.25em] text-white transition hover:bg-stone-700">
            Try it on <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </section>
  )
}
