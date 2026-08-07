export const products = [
  {
    id: 1,
    name: 'Ivory Bloom',
    price: 18900,
    category: 'Lawn',
    image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80',
    badge: 'NEW',
    sizes: ['S', 'M', 'L'],
    description: 'Fine cotton lawn with sculptural drape.'
  },
  {
    id: 2,
    name: 'Noor',
    price: 21400,
    category: 'Ready to Wear',
    image: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80',
    badge: 'LIMITED',
    sizes: ['XS', 'S', 'M'],
    description: 'Tailored silhouette with refined detailing.'
  },
  {
    id: 3,
    name: 'Mehr',
    price: 23900,
    category: 'Unstitched',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=900&q=80',
    badge: 'NEW',
    sizes: ['M', 'L', 'XL'],
    description: 'Soft handloom finish for elevated evenings.'
  },
  {
    id: 4,
    name: 'Aster',
    price: 16900,
    category: 'Luxury Pret',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
    badge: 'SALE',
    sizes: ['S', 'M', 'L'],
    description: 'Structured elegance with pearl accents.'
  },
  {
    id: 5,
    name: 'Zariya',
    price: 25600,
    category: 'Formal',
    image: 'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=900&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80',
    badge: 'NEW',
    sizes: ['S', 'M', 'L'],
    description: 'Fluid silhouette made for evening occasions.'
  },
  {
    id: 6,
    name: 'Elara',
    price: 22100,
    category: 'Accessories',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
    hoverImage: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80',
    badge: 'BEST SELLER',
    sizes: ['One Size'],
    description: 'A refined statement layer for tailored looks.'
  }
]

export const featuredProducts = products.slice(0, 4)
export const bestSellers = products.slice(1, 6)
