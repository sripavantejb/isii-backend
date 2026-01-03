const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config();

const seedAdmin = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://sripavantejb_db_user:isii@cluster0.93ufs41.mongodb.net/?appName=Cluster0';
    await mongoose.connect(mongoUri);
    console.log('MongoDB Connected');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@isii.com' });

    if (existingAdmin) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    // Create admin user
    const admin = new User({
      email: 'admin@isii.com',
      password: 'admin123', // Change this password after first login
      role: 'admin',
    });
    await admin.save();

    console.log('Admin user created successfully:');
    console.log(`Email: ${admin.email}`);
    console.log('Password: admin123');
    console.log('Please change the password after first login!');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();

