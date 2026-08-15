#!/usr/bin/env node
// tools/seed-contract-db.mjs
//
// Seeds the `zahzan_contract_test` Mongo database deterministically: a
// fixed admin, two customers, four products with fixed slugs/SKUs/prices/
// stock, and one newsletter subscriber (Task 2 brief). No Date.now() and
// no randomness go into the seeded content -- every id, timestamp and
// password hash-input is a literal constant, so re-seeding produces the
// same documents every time.
//
// Talks to Mongo directly with the `mongodb` driver (not Mongoose) so it
// has zero dependency on server/node_modules. It replicates the write-time
// behaviour the app's Mongoose schemas would have applied (lowercase
// email, uppercase SKU, lowercase slug) by construction, since every
// seeded value is already in its canonical form.
//
// SAFETY: this script refuses to run against any database whose name is
// not exactly `zahzan_contract_test`. It must never touch `zahzan_db`.

import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';

const DEFAULT_URI = 'mongodb://localhost:27017/zahzan_contract_test';
const REQUIRED_DB_NAME = 'zahzan_contract_test';

function parseArgs(argv) {
  const args = { uri: process.env.CONTRACT_MONGODB_URI || DEFAULT_URI };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--uri') args.uri = argv[++i];
  }
  return args;
}

// Deterministic fixed-length hex ObjectId helper: 12 bytes = 24 hex chars.
const mkId = (n) => new ObjectId(n.toString(16).padStart(24, '0'));

export const SEED_IDS = {
  admin: mkId(0x1),
  customer1: mkId(0x2),
  customer2: mkId(0x3),
  product1: mkId(0x11),
  product2: mkId(0x12),
  product3: mkId(0x13),
  product4: mkId(0x14),
  newsletterSubscriber: mkId(0x21)
};

export const SEED_CREDENTIALS = {
  admin: { email: 'admin@zahzancontract.test', password: 'Admin@12345' },
  customer1: { email: 'customer1@zahzancontract.test', password: 'Customer@12345' },
  customer2: { email: 'customer2@zahzancontract.test', password: 'Customer@12345' }
};

// Fixed unsubscribe token for the seeded subscriber -- must be a 64-char
// hex string to look like crypto.randomBytes(32).toString('hex').
export const SEED_NEWSLETTER_TOKEN = 'ab'.repeat(32);

export const SEED_PRODUCTS = [
  {
    _id: SEED_IDS.product1,
    name: 'ZAHZAN Ivory Silk Kurta',
    slug: 'ivory-silk-kurta-zhz-001',
    sku: 'ZHZ-001',
    description: 'Hand-finished ivory silk kurta with subtle embroidery.',
    price: 8500,
    category: 'Kurtas',
    images: ['https://images.example.test/products/zhz-001-a.jpg'],
    image: 'https://images.example.test/products/zhz-001-a.jpg',
    hoverImage: 'https://images.example.test/products/zhz-001-b.jpg',
    colors: [{ name: 'Ivory', hex: '#F5F0E6', image: 'https://images.example.test/products/zhz-001-a.jpg' }],
    color: 'Ivory',
    sizes: ['S', 'M', 'L', 'XL'],
    fabric: 'Pure Silk',
    work: 'Hand Embroidery',
    careInstructions: ['Dry clean only'],
    stock: 25,
    isActive: true
  },
  {
    _id: SEED_IDS.product2,
    name: 'ZAHZAN Emerald Velvet Shawl',
    slug: 'emerald-velvet-shawl-zhz-002',
    sku: 'ZHZ-002',
    description: 'Rich emerald velvet shawl with gold thread border.',
    price: 12500,
    category: 'Shawls',
    images: ['https://images.example.test/products/zhz-002-a.jpg'],
    image: 'https://images.example.test/products/zhz-002-a.jpg',
    hoverImage: 'https://images.example.test/products/zhz-002-b.jpg',
    colors: [{ name: 'Emerald', hex: '#0B5A3B', image: 'https://images.example.test/products/zhz-002-a.jpg' }],
    color: 'Emerald',
    sizes: ['One Size'],
    fabric: 'Velvet',
    work: 'Zari Border',
    careInstructions: ['Dry clean only'],
    stock: 10,
    isActive: true
  },
  {
    _id: SEED_IDS.product3,
    name: 'ZAHZAN Rose Chiffon Dupatta',
    slug: 'rose-chiffon-dupatta-zhz-003',
    sku: 'ZHZ-003',
    description: 'Lightweight rose chiffon dupatta, hand-rolled edges.',
    price: 4500,
    category: 'Dupattas',
    images: ['https://images.example.test/products/zhz-003-a.jpg'],
    image: 'https://images.example.test/products/zhz-003-a.jpg',
    hoverImage: 'https://images.example.test/products/zhz-003-b.jpg',
    colors: [{ name: 'Rose', hex: '#C97E8C', image: 'https://images.example.test/products/zhz-003-a.jpg' }],
    color: 'Rose',
    sizes: ['One Size'],
    fabric: 'Chiffon',
    work: 'Hand-Rolled Edges',
    careInstructions: ['Hand wash cold'],
    stock: 40,
    isActive: true
  },
  {
    _id: SEED_IDS.product4,
    name: 'ZAHZAN Noir Formal Set',
    slug: 'noir-formal-set-zhz-004',
    sku: 'ZHZ-004',
    description: 'Noir three-piece formal set with structured tailoring.',
    price: 18500,
    category: 'Formal Sets',
    images: ['https://images.example.test/products/zhz-004-a.jpg'],
    image: 'https://images.example.test/products/zhz-004-a.jpg',
    hoverImage: 'https://images.example.test/products/zhz-004-b.jpg',
    colors: [{ name: 'Noir', hex: '#111111', image: 'https://images.example.test/products/zhz-004-a.jpg' }],
    color: 'Noir',
    sizes: ['S', 'M', 'L'],
    fabric: 'Wool Blend',
    work: 'Structured Tailoring',
    careInstructions: ['Dry clean only'],
    stock: 5,
    isActive: true
  }
];

function ts(daysAgo) {
  // Fixed, deterministic timestamps (not Date.now()) spaced out so
  // createdAt-descending sorts used by list endpoints are stable.
  return new Date(Date.UTC(2026, 0, 1, 0, 0, 0) - daysAgo * 24 * 60 * 60 * 1000);
}

async function seed(uri) {
  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db();
    if (db.databaseName !== REQUIRED_DB_NAME) {
      throw new Error(
        `Refusing to seed database "${db.databaseName}" -- this script only ever writes to ` +
          `"${REQUIRED_DB_NAME}". Pass --uri mongodb://localhost:27017/${REQUIRED_DB_NAME} ` +
          `(or set CONTRACT_MONGODB_URI). zahzan_db must never be touched by this script.`
      );
    }

    console.log(`[seed-contract-db] Dropping database "${db.databaseName}" for a clean deterministic slate...`);
    await db.dropDatabase();

    const adminHash = bcrypt.hashSync(SEED_CREDENTIALS.admin.password, 10);
    const customer1Hash = bcrypt.hashSync(SEED_CREDENTIALS.customer1.password, 10);
    const customer2Hash = bcrypt.hashSync(SEED_CREDENTIALS.customer2.password, 10);

    const users = db.collection('users');
    await users.insertMany([
      {
        _id: SEED_IDS.admin,
        firstName: 'Contract',
        lastName: 'Admin',
        email: SEED_CREDENTIALS.admin.email,
        password: adminHash,
        authProvider: 'local',
        googleId: '',
        facebookId: '',
        phone: '03000000001',
        role: 'admin',
        isEmailVerified: true,
        isActive: true,
        wishlist: [],
        createdAt: ts(30),
        updatedAt: ts(30),
        __v: 0
      },
      {
        _id: SEED_IDS.customer1,
        firstName: 'Amina',
        lastName: 'Yousaf',
        email: SEED_CREDENTIALS.customer1.email,
        password: customer1Hash,
        authProvider: 'local',
        googleId: '',
        facebookId: '',
        phone: '03000000002',
        role: 'customer',
        isEmailVerified: true,
        isActive: true,
        wishlist: [],
        createdAt: ts(20),
        updatedAt: ts(20),
        __v: 0
      },
      {
        _id: SEED_IDS.customer2,
        firstName: 'Bilal',
        lastName: 'Chaudhry',
        email: SEED_CREDENTIALS.customer2.email,
        password: customer2Hash,
        authProvider: 'local',
        googleId: '',
        facebookId: '',
        phone: '03000000003',
        role: 'customer',
        isEmailVerified: true,
        isActive: true,
        wishlist: [],
        createdAt: ts(19),
        updatedAt: ts(19),
        __v: 0
      }
    ]);

    const products = db.collection('products');
    await products.insertMany(
      SEED_PRODUCTS.map((p, idx) => ({
        ...p,
        quickDescription: '',
        gallery: [],
        createdAt: ts(10 - idx),
        updatedAt: ts(10 - idx),
        __v: 0
      }))
    );

    const newsletter = db.collection('newslettersubscribers');
    await newsletter.insertOne({
      _id: SEED_IDS.newsletterSubscriber,
      email: 'seed.subscriber@zahzancontract.test',
      status: 'subscribed',
      source: 'seed',
      unsubscribeToken: SEED_NEWSLETTER_TOKEN,
      subscribedAt: ts(15),
      createdAt: ts(15),
      updatedAt: ts(15),
      __v: 0
    });

    console.log('[seed-contract-db] Seeded: 1 admin, 2 customers, 4 products, 1 newsletter subscriber.');
    console.log(`[seed-contract-db] Database: ${db.databaseName}`);
  } finally {
    await client.close();
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMain || process.argv[1]?.endsWith('seed-contract-db.mjs')) {
  const { uri } = parseArgs(process.argv.slice(2));
  seed(uri)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed-contract-db] FAILED:', err.message);
      process.exit(1);
    });
}
