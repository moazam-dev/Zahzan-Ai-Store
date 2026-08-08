import carouselImg from '../assets/carouselimg.png'

export default function CategoryCard({ category, image }) {
  const src = image || category.image || carouselImg

  return (
    <article className="group h-full overflow-hidden rounded-[2rem] shadow-sm">
      <div className="relative overflow-hidden">
        <img
          src={src}
          alt={category.name}
          className="h-[28rem] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />

        <div className="absolute left-6 right-6 bottom-6">
          <h3 className="text-lg font-semibold uppercase tracking-[0.12em] text-white drop-shadow-md">{category.name}</h3>
        </div>
      </div>
    </article>
  )
}
