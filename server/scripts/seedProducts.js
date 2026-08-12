import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Product from '../models/Product.js';
import connectDB from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const seedProductsList = [
  {
    name: 'Ivory Bloom',
    slug: 'ivory-bloom',
    sku: 'ZAH-IVORY-001',
    price: 18900,
    category: 'Lawn',
    image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85',
    images: [
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85'
    ],
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
    ],
    isActive: true
  },
  {
    name: 'Noor',
    slug: 'noor',
    sku: 'ZAH-NOOR-002',
    price: 21400,
    category: 'Ready to Wear',
    image: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
    images: [
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85'
    ],
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
    ],
    isActive: true
  },
  {
    name: 'Mehr',
    slug: 'mehr',
    sku: 'ZAH-MEHR-003',
    price: 23900,
    category: 'Unstitched',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
    images: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85'
    ],
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
    ],
    isActive: true
  },
  {
    name: 'Aster',
    slug: 'aster',
    sku: 'ZAH-ASTER-004',
    price: 16900,
    originalPrice: 21500,
    category: 'Luxury Pret',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
    images: [
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85'
    ],
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
    ],
    isActive: true
  },
  {
    name: 'Zariya',
    slug: 'zariya',
    sku: 'ZAH-ZARIYA-005',
    price: 25600,
    category: 'Formal',
    image: 'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85',
    images: [
      'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85'
    ],
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
    ],
    isActive: true
  },
  {
    name: 'Elara',
    slug: 'elara',
    sku: 'ZAH-ELARA-006',
    price: 22100,
    category: 'Accessories',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
    images: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85'
    ],
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
    ],
    isActive: true
  }
];

const seedProducts = async () => {
  try {
    await connectDB();
    console.log('Clearing existing product catalog...');
    await Product.deleteMany({});

    console.log('Seeding exactly 6 real ZAHZAN products...');
    const inserted = await Product.insertMany(seedProductsList);

    const count = await Product.countDocuments({});
    console.log(`Successfully seeded dataset. Database now contains EXACTLY ${count} products.`);

    if (count !== 6) {
      console.error(`ERROR: Expected 6 products but found ${count}`);
      process.exit(1);
    }

    inserted.forEach((prod, index) => {
      console.log(` Product ${index + 1}: ${prod.name} | ID: ${prod._id} | SKU: ${prod.sku} | Price: PKR ${prod.price}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Failed to seed products:', error);
    process.exit(1);
  }
};

seedProducts();
