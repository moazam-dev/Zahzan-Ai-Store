// lib/imageOptimization.js
//
// Decides whether an image URL can go through the Next.js image optimiser.
// Must stay in step with `images.remotePatterns` in next.config.mjs: the
// optimiser answers 400 for any URL outside that list, which would show a
// broken image, so anything this function rejects is rendered as-is.

import { getImageProps } from 'next/image';

const REMOTE_PATTERNS = [
  (url) => url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/product-images/'),
  (url) => url.hostname === 'images.unsplash.com'
];

/**
 * @param {unknown} src  a URL string or a static image import
 * @returns {boolean}
 */
export function canOptimizeImage(src) {
  // Static import (`import photo from '../public/images/x.png'`): a local file
  // Next.js has already fingerprinted, always optimisable.
  if (src && typeof src === 'object' && typeof src.src === 'string') return true;

  if (typeof src !== 'string' || src === '') return false;

  // Local file under /public. Query strings and SVGs are left alone: Next 16
  // rejects local sources with a query string unless allowlisted, and SVG is
  // already small and vector.
  if (src.startsWith('/') && !src.startsWith('//')) {
    return !src.includes('?') && !src.toLowerCase().endsWith('.svg');
  }

  // blob:/data: previews (try-on uploads) and every other scheme stay raw.
  if (!src.startsWith('https://')) return false;

  try {
    const url = new URL(src);
    return REMOTE_PATTERNS.some((matches) => matches(url));
  } catch {
    return false;
  }
}

/**
 * Optimised srcSet for a <source> element in an art-directed <picture>.
 *
 * @param {string|{src: string}} src  a URL string or a static image import
 * @param {string} [sizes]
 * @returns {string}
 */
export function optimizedSrcSet(src, sizes = '100vw') {
  if (!canOptimizeImage(src)) return typeof src === 'string' ? src : src?.src;
  return getImageProps({ src, alt: '', fill: true, sizes }).props.srcSet;
}
