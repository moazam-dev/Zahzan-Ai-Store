// Single source of truth for product categories. The admin product form, the
// admin filter pills and the shop filter all read this list, so a product's
// stored `category` must match one of these names exactly.
export const categories = [
  {
    id: 1,
    name: 'Naqsh - Embroidered',
    image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
    description: 'Threadwork, slowly done'
  },
  {
    id: 2,
    name: 'Gul - Printed Trouser',
    image: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80',
    description: 'Quiet on top, a story below'
  },
  {
    id: 3,
    name: 'Sukoon - Solids',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80',
    description: 'One colour, head to toe'
  }
]

// Shop page URL with one category pre-selected in its filter.
export const shopCategoryHref = (name) => `/shop?category=${encodeURIComponent(name)}`
