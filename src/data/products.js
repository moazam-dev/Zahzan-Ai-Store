export const products = [
  {
    id: 1,
    name: 'Ivory Bloom',
    price: 18900,
    category: 'Lawn',
    image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85',
    hoverImage: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
    badge: 'NEW',
    sizes: ['S', 'M', 'L'],
    description: 'Fine cotton lawn with sculptural drape.',
    quickDescription: 'A refined embroidered lawn three-piece featuring a delicately worked shirt, tailored cotton trouser, and sheer organza dupatta.',
    stock: 8,
    fabric: 'Fine Cotton Lawn',
    color: 'Warm Ivory',
    work: 'Tonal Needlework',
    breakdown: {
      shirt: 'Fine cotton lawn shirt with embroidered neckline and sleeve borders',
      trouser: 'Tailored solid cotton trouser',
      dupatta: 'Sheer organza dupatta with embroidered scalloped borders'
    },
    modelInfo: "Model Height: 5'8\" | Model wears: S",
    careInstructions: [
      'Professional dry clean recommended for first wear',
      'Gentle cold hand wash separately with neutral detergent',
      'Dry in shade to preserve color brilliance',
      'Medium iron on reverse side'
    ],
    gallery: [
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85'
    ]
  },
  {
    id: 2,
    name: 'Noor',
    price: 21400,
    category: 'Ready to Wear',
    image: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
    hoverImage: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
    badge: 'LIMITED',
    sizes: ['XS', 'S', 'M'],
    description: 'Tailored silhouette with refined detailing.',
    quickDescription: 'An architectural raw silk pret suit embellished with hand-guided metallic zari thread along the placket and side slits.',
    stock: 3,
    fabric: 'Raw Silk Blend',
    color: 'Midnight Charcoal',
    work: 'Antique Zari Stitching',
    breakdown: {
      shirt: 'Structured raw silk straight kameez with zari embroidered placket',
      trouser: 'Matching raw silk straight-cut trouser',
      dupatta: 'Fluid organza dupatta with woven gold borders'
    },
    modelInfo: "Model Height: 5'7\" | Model wears: XS",
    careInstructions: [
      'Dry clean only',
      'Do not steam metal zari directly',
      'Store hanging in cotton garment bag',
      'Warm iron with press cloth'
    ],
    gallery: [
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85'
    ]
  },
  {
    id: 3,
    name: 'Mehr',
    price: 23900,
    category: 'Unstitched',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
    hoverImage: 'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85',
    badge: 'NEW',
    sizes: ['M', 'L', 'XL'],
    description: 'Soft handloom finish for elevated evenings.',
    quickDescription: 'An unstitched handloom cotton silk 3-piece featuring dense chikankari-inspired needlework and an embroidered chiffon dupatta.',
    stock: 12,
    fabric: 'Handloom Cotton Silk',
    color: 'Dusty Rose',
    work: 'Chikankari Embroidery',
    breakdown: {
      shirt: '3.25m unstitched cotton silk shirt fabric with heavy embroidered front panel',
      trouser: '2.5m unstitched solid cotton silk trouser fabric',
      dupatta: '2.75m embroidered chiffon dupatta'
    },
    modelInfo: "Model Height: 5'8\" | Model wears: M",
    careInstructions: [
      'Dry clean recommended',
      'Cold water soak prior to stitching',
      'Do not scrub embroidered areas',
      'Warm iron'
    ],
    gallery: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85'
    ]
  },
  {
    id: 4,
    name: 'Aster',
    price: 16900,
    originalPrice: 21500,
    category: 'Luxury Pret',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
    hoverImage: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85',
    badge: 'SALE',
    sizes: ['S', 'M', 'L'],
    description: 'Structured elegance with pearl accents.',
    quickDescription: 'A modern structured linen viscose pret shirt adorned with hand-stitched freshwater pearl clusters along the sleeve line.',
    stock: 5,
    fabric: 'Linen Viscose Blend',
    color: 'Soft Sage',
    work: 'Pearl Embellishment',
    breakdown: {
      shirt: 'Linen viscose shirt with pearl work collar and asymmetric hem',
      trouser: 'Tailored cigarette trouser',
      dupatta: 'Silk organza drape dupatta'
    },
    modelInfo: "Model Height: 5'9\" | Model wears: S",
    careInstructions: [
      'Dry clean only to protect pearl embellishments',
      'Do not wring or twist',
      'Store hanging',
      'Steam iron from inside out'
    ],
    gallery: [
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85'
    ]
  },
  {
    id: 5,
    name: 'Zariya',
    price: 25600,
    category: 'Formal',
    image: 'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85',
    hoverImage: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
    badge: 'NEW',
    sizes: ['S', 'M', 'L'],
    description: 'Fluid silhouette made for evening occasions.',
    quickDescription: 'A 12-panel flared kalidar in pure chiffon highlighted by handcrafted mirrorwork and delicate tilla borders.',
    stock: 6,
    fabric: 'Pure Chiffon & Satin',
    color: 'Blush Emerald',
    work: 'Hand Mirrorwork & Tilla',
    breakdown: {
      shirt: 'Pure chiffon 12-panel flared shirt with mirrorwork neckline and silk satin lining',
      trouser: 'Silk satin lined trouser',
      dupatta: 'Heavy embroidered chiffon dupatta'
    },
    modelInfo: "Model Height: 5'8\" | Model wears: S",
    careInstructions: [
      'Dry clean only',
      'Handle mirrorwork with care',
      'Store in dry cotton wrap',
      'Cool iron on reverse side'
    ],
    gallery: [
      'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85'
    ]
  },
  {
    id: 6,
    name: 'Elara',
    price: 22100,
    category: 'Accessories',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
    hoverImage: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
    badge: 'BEST SELLER',
    sizes: ['One Size'],
    description: 'A refined statement layer for tailored looks.',
    quickDescription: 'An iconic 100% pure mulberry silk handwoven statement shawl accompanied by a bespoke antiqued brass brooch.',
    stock: 9,
    fabric: 'Pure Mulberry Silk',
    color: 'Royal Amber',
    work: 'Handloom Fringe & Hardware',
    breakdown: {
      shirt: '2.8m x 1.1m handwoven pure silk shawl with hand-twisted fringes',
      trouser: 'Custom antiqued brass brooch hardware included',
      dupatta: 'Arrives in ZAHZAN wooden presentation box'
    },
    modelInfo: "Model Height: 5'8\" | Universal One-Size Layer",
    careInstructions: [
      'Dry clean only',
      'Do not bleach or spot clean with water',
      'Store folded with cedar chips',
      'Low steam iron'
    ],
    gallery: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85'
    ]
  }
]

export const featuredProducts = products.slice(0, 4)
export const bestSellers = products.slice(1, 6)


