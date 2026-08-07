import { reviews } from '../data/reviews'

const renderStars = (number) => '★'.repeat(number) + '☆'.repeat(5 - number)

export default function ReviewCarousel() {
  return (
    <section className="border-t border-stone-200 bg-white px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.35em] text-stone-500">Worn & Loved</p>
          <h2 className="mt-2 text-2xl font-semibold uppercase tracking-[0.2em] text-stone-900 sm:text-3xl">
            Loved by the modern wardrobe
          </h2>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {reviews.map((review) => (
            <article key={review.id} className="rounded-[2rem] border border-stone-200 bg-stone-50 p-6">
              <div className="text-xl text-stone-700">{renderStars(review.rating)}</div>
              <p className="mt-4 text-base leading-8 text-stone-600">“{review.review}”</p>
              <div className="mt-6 flex items-center gap-3">
                <img src={review.image} alt={review.name} className="h-12 w-12 rounded-full object-cover" />
                <div>
                  <p className="font-medium text-stone-900">{review.name}</p>
                  <p className="text-sm text-stone-500">{review.product}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
