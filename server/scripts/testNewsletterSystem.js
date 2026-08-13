import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import NewsletterSubscriber from '../models/NewsletterSubscriber.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import {
  subscribeNewsletter,
  unsubscribeNewsletter
} from '../controllers/newsletterController.js';
import {
  getAdminNewsletterSubscribers,
  exportAdminNewsletterSubscribers
} from '../controllers/adminController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Mock Express req/res helpers
const createMockRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    sentContent: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.sentContent = data;
      return this;
    },
    setHeader(key, val) {
      this.headers[key] = val;
    },
    send(data) {
      this.sentContent = data;
      return this;
    },
    accepts(type) {
      return false;
    }
  };
  return res;
};

const runNewsletterTests = async () => {
  try {
    await connectDB();
    console.log('\n--- TESTING ZAHZAN NEWSLETTER SUBSCRIPTION & ADMIN MANAGEMENT SYSTEM ---\n');

    const testEmailRaw = '  Test.Subscriber+ZAHZAN@Example.COM  ';
    const normalizedEmail = 'test.subscriber+zahzan@example.com';

    // Cleanup prior test records
    await NewsletterSubscriber.deleteMany({ email: normalizedEmail });

    // ----------------------------------------------------------------------
    // TEST 1: NEW SUBSCRIPTION & EMAIL NORMALIZATION
    // ----------------------------------------------------------------------
    console.log('[TEST 1] Testing New Subscription & Email Normalization...');
    const req1 = {
      body: {
        email: testEmailRaw,
        source: 'homepage'
      }
    };
    const res1 = createMockRes();

    await subscribeNewsletter(req1, res1, (err) => { if (err) throw err; });

    if (res1.statusCode !== 201 || !res1.sentContent.success) {
      throw new Error(`Subscribe failed! Code: ${res1.statusCode}, Msg: ${JSON.stringify(res1.sentContent)}`);
    }

    const sub1 = await NewsletterSubscriber.findOne({ email: normalizedEmail });
    if (!sub1) {
      throw new Error(`Subscriber was not found in DB with normalized email: ${normalizedEmail}`);
    }

    if (sub1.email !== normalizedEmail || sub1.status !== 'subscribed' || sub1.source !== 'homepage' || !sub1.unsubscribeToken) {
      throw new Error(`Subscriber record schema mismatch! ${JSON.stringify(sub1)}`);
    }

    console.log(`  ✔ Subscription created successfully: email="${sub1.email}" | status="${sub1.status}" | source="${sub1.source}"`);
    console.log(`  ✔ Email normalized and trimmed. Secure unsubscribe token generated: ${sub1.unsubscribeToken.slice(0, 16)}...`);

    // ----------------------------------------------------------------------
    // TEST 2: DUPLICATE SUBSCRIPTION PROTECTION
    // ----------------------------------------------------------------------
    console.log('\n[TEST 2] Testing Duplicate Subscription Protection...');
    const req2 = {
      body: {
        email: 'TEST.subscriber+zahzan@EXAMPLE.com',
        source: 'footer'
      }
    };
    const res2 = createMockRes();

    await subscribeNewsletter(req2, res2, (err) => { if (err) throw err; });

    if (!res2.sentContent.isAlreadySubscribed) {
      throw new Error('Duplicate subscription was not caught by backend!');
    }

    const count = await NewsletterSubscriber.countDocuments({ email: normalizedEmail });
    if (count !== 1) {
      throw new Error(`Duplicate records created in database! Count: ${count}`);
    }

    console.log(`  ✔ Duplicate protection verified. Message: "${res2.sentContent.message}"`);
    console.log('  ✔ Database unique index verified. Record count remains exactly 1.');

    // ----------------------------------------------------------------------
    // TEST 3: SECURE UNSUBSCRIBE TOKEN FLOW
    // ----------------------------------------------------------------------
    console.log('\n[TEST 3] Testing Secure Unsubscribe Token Flow...');
    const req3 = {
      params: { token: sub1.unsubscribeToken },
      accepts: () => false
    };
    const res3 = createMockRes();

    await unsubscribeNewsletter(req3, res3, (err) => { if (err) throw err; });

    if (res3.statusCode !== 200 || !res3.sentContent.success) {
      throw new Error(`Unsubscribe failed! Code: ${res3.statusCode}`);
    }

    const sub3 = await NewsletterSubscriber.findOne({ email: normalizedEmail });
    if (sub3.status !== 'unsubscribed' || !sub3.unsubscribedAt) {
      throw new Error('Subscriber status was not updated to unsubscribed!');
    }

    console.log(`  ✔ Unsubscribed via secure token: status="${sub3.status}" | unsubscribedAt="${sub3.unsubscribedAt.toISOString()}"`);

    // ----------------------------------------------------------------------
    // TEST 4: RESUBSCRIBE FLOW
    // ----------------------------------------------------------------------
    console.log('\n[TEST 4] Testing Resubscription Flow...');
    const req4 = {
      body: {
        email: normalizedEmail,
        source: 'checkout'
      }
    };
    const res4 = createMockRes();

    await subscribeNewsletter(req4, res4, (err) => { if (err) throw err; });

    if (!res4.sentContent.isResubscribed) {
      throw new Error('Resubscription failed!');
    }

    const sub4 = await NewsletterSubscriber.findOne({ email: normalizedEmail });
    if (sub4.status !== 'subscribed' || sub4.unsubscribedAt !== null) {
      throw new Error('Resubscribed record status mismatch!');
    }

    const finalCount = await NewsletterSubscriber.countDocuments({ email: normalizedEmail });
    if (finalCount !== 1) {
      throw new Error(`Multiple records created after resubscription! Count: ${finalCount}`);
    }

    console.log(`  ✔ Resubscribed existing record: status="${sub4.status}" | unsubscribedAt=${sub4.unsubscribedAt}`);
    console.log('  ✔ Single permanent record maintained per email address.');

    // ----------------------------------------------------------------------
    // TEST 5: ADMIN SUBSCRIBER MANAGEMENT & CSV EXPORT
    // ----------------------------------------------------------------------
    console.log('\n[TEST 5] Testing Admin Subscriber Management & CSV Export...');
    let adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      adminUser = await User.create({
        firstName: 'Test',
        lastName: 'Admin',
        email: 'admin_test_newsletter@zahzan.com',
        password: 'AdminPassword123!',
        role: 'admin',
        isEmailVerified: true
      });
    }

    const reqAdminGet = {
      query: { page: '1', limit: '10', status: 'subscribed' },
      user: adminUser
    };
    const resAdminGet = createMockRes();

    await getAdminNewsletterSubscribers(reqAdminGet, resAdminGet, (err) => { if (err) throw err; });

    if (!resAdminGet.sentContent.success || !resAdminGet.sentContent.stats) {
      throw new Error('Admin subscriber list API failed!');
    }

    console.log(`  ✔ Admin List API returned ${resAdminGet.sentContent.subscribers.length} subscribers.`);
    console.log(`  ✔ Database Stats: Total: ${resAdminGet.sentContent.stats.totalSubscribers} | Active: ${resAdminGet.sentContent.stats.activeSubscribers} | Unsubscribed: ${resAdminGet.sentContent.stats.unsubscribedSubscribers}`);

    // CSV Export
    const reqAdminExport = {
      query: { status: 'all' },
      user: adminUser,
      ip: '127.0.0.1'
    };
    const resAdminExport = createMockRes();

    await exportAdminNewsletterSubscribers(reqAdminExport, resAdminExport, (err) => { if (err) throw err; });

    if (!resAdminExport.sentContent.includes('Email,Status,Source,Subscribed Date,Unsubscribed Date')) {
      throw new Error('CSV Export header missing or invalid!');
    }

    console.log('  ✔ CSV Export generated cleanly with headers and filtered subscriber records.');

    // Cleanup
    await NewsletterSubscriber.deleteMany({ email: normalizedEmail });
    if (adminUser.email === 'admin_test_newsletter@zahzan.com') {
      await User.deleteOne({ _id: adminUser._id });
    }

    console.log('\n--- ALL NEWSLETTER SYSTEM TESTS PASSED CLEANLY! ---\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ NEWSLETTER TEST FAILED:', error);
    process.exit(1);
  }
};

runNewsletterTests();
