import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import AdminUser from '../models/AdminUser.js';

dotenv.config();

const seedAdmin = async () => {
  try {
    await connectDB();

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@zahzan.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'AdminZahzan2026!';

    console.log(`Checking if admin user exists with email: ${adminEmail}`);

    let user = await User.findOne({ email: adminEmail.toLowerCase() });

    if (user) {
      console.log('Admin user already exists.');
      if (user.role !== 'admin') {
        user.role = 'admin';
        await user.save();
        console.log('User role updated to admin.');
      }
    } else {
      user = await User.create({
        firstName: 'Zahzan',
        lastName: 'Admin',
        email: adminEmail,
        password: adminPassword,
        role: 'admin',
        isEmailVerified: true,
        isActive: true
      });
      console.log('Admin user created successfully.');
    }

    const adminProfile = await AdminUser.findOne({ userId: user._id });
    if (!adminProfile) {
      await AdminUser.create({
        userId: user._id,
        permissions: ['all'],
        department: 'Executive'
      });
      console.log('AdminUser metadata profile created successfully.');
    }

    console.log('Admin seed process completed.');
    process.exit(0);
  } catch (error) {
    console.error(`Error during admin seeding: ${error.message}`);
    process.exit(1);
  }
};

seedAdmin();
