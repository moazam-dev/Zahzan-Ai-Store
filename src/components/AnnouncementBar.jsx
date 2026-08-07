const ANNOUNCEMENT_TEXT = 'Get 10% off on all prepaid orders'

export default function AnnouncementBar() {
  return (
    <div className="w-full bg-stone-950 text-stone-100">
      <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-2 text-[11px] uppercase tracking-[0.15em] sm:text-xs">
        {ANNOUNCEMENT_TEXT}
      </div>
    </div>
  )
}
