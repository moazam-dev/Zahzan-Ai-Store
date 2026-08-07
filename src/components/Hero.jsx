import heroMain from '../assets/heromain    .png'

export default function Hero() {
  return (
    <section className="w-full h-screen overflow-hidden">
      <img
        src={heroMain}
        alt="Main hero"
        className="h-full w-full object-cover"
      />
    </section>
  )
}
