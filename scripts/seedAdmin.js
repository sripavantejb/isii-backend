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

    // Admin users to create
    const adminUsers = [
      { email: 'admin@isii.global', password: 'cms@isiiglobal', role: 'admin' },
      { email: 'isii@test', password: 'cms@isiiglobal', role: 'admin' }
    ];

    let createdCount = 0;
    let updatedCount = 0;

    for (const adminData of adminUsers) {
      // Check if admin already exists
      const existingAdmin = await User.findOne({ email: adminData.email });

      if (existingAdmin) {
        // Update password for existing admin
        existingAdmin.password = adminData.password;
        await existingAdmin.save();
        console.log(`✅ Updated password for ${adminData.email}`);
        updatedCount++;
      } else {
        // Create admin user
        const admin = new User({
          email: adminData.email,
          password: adminData.password,
          role: adminData.role,
        });
        await admin.save();

        console.log(`✅ Admin user created successfully:`);
        console.log(`  Email: ${admin.email}`);
        console.log(`  Password: ${adminData.password}`);
        createdCount++;
      }
    }

    if (createdCount > 0) {
      console.log(`\n✅ Created ${createdCount} admin user(s)`);
    }
    if (updatedCount > 0) {
      console.log(`✅ Updated ${updatedCount} admin user(s)`);
    }
    if (createdCount === 0 && updatedCount === 0) {
      console.log('No changes needed');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();

