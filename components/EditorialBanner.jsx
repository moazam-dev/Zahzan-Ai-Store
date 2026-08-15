'use client'

export default function EditorialBanner() {
  return (
    <section className="relative overflow-hidden border-t border-stone-200 bg-stone-900">
      <img
        src="https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=2000&q=80"
        alt="Editorial campaign"
        className="h-[28rem] w-full object-cover object-center opacity-70 sm:h-[34rem]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-stone-950/70 via-stone-900/40 to-stone-900/20" />
      <div className="absolute inset-0 flex items-center justify-start px-4 py-10 sm:px-6 lg:px-8">
        <div className="max-w-xl rounded-[2rem] border border-white/20 bg-white/10 p-6 text-white backdrop-blur-sm sm:p-8">
          <p className="text-[10px] uppercase tracking-[0.35em] text-stone-200">Crafted for the moment</p>
          <h2 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl">
            Timeless silhouettes. Contemporary expression.
          </h2>
          <a href="/collections" className="mt-6 inline-flex rounded-full border border-white/60 px-5 py-3 text-sm uppercase tracking-[0.25em] text-white transition hover:bg-white/10">
            Discover the Edit
          </a>
        </div>
      </div>
    </section>
  )
}
