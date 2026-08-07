export default function Newsletter() {
  return (
    <section className="border-t border-stone-200 bg-white px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-stone-200 bg-stone-50 p-8 text-center sm:p-12">
        <p className="text-[11px] uppercase tracking-[0.35em] text-stone-500">Join Our World</p>
        <h2 className="mt-3 text-2xl font-semibold uppercase tracking-[0.2em] text-stone-900 sm:text-3xl">
          Be the first to discover new collections, private edits and special releases.
        </h2>
        <form className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row">
          <input
            type="email"
            placeholder="Your email address"
            className="w-full rounded-full border border-stone-300 bg-white px-5 py-3 text-sm text-stone-700 outline-none transition focus:border-stone-900"
          />
          <button type="submit" className="rounded-full bg-stone-900 px-6 py-3 text-sm font-medium uppercase tracking-[0.25em] text-white transition hover:bg-stone-700">
            Subscribe
          </button>
        </form>
      </div>
    </section>
  )
}
