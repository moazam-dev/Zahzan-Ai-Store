import { getImageProps } from 'next/image'
import { canOptimizeImage } from '../lib/imageOptimization'

// A plain <img> whose source goes through the Next.js image optimiser: AVIF
// (or WebP) at the width the device actually needs, instead of the multi-MB
// original. It keeps ordinary <img> markup, so existing classNames and layout
// work unchanged -- unlike next/image's `fill`, which needs a positioned parent.
//
// `sizes` tells the browser how wide the image renders so it picks the right
// file. The default suits full-width images; pass a smaller value for cards
// and thumbnails. URLs the optimiser does not allow render unoptimised.
export default function Img({ src, alt = '', sizes = '100vw', ...rest }) {
  if (!canOptimizeImage(src)) {
    return <img src={src} alt={alt} {...rest} />
  }

  // `fill` gives a responsive srcSet without needing the intrinsic size. Its
  // absolute-positioning style is dropped; the caller's classes size the image.
  const {
    props: { style: _fillStyle, ...optimized }
  } = getImageProps({ src, alt, fill: true, sizes })

  return <img {...optimized} {...rest} />
}
