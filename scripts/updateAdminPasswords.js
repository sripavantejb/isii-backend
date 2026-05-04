const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config();

const updateAdminPasswords = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI ;
    await mongoose.connect(mongoUri);
    console.log('MongoDB Connected');

    const newPassword = 'cms@isiiglobal';
    
    // Admin users to update
    const adminEmails = ['admin@isii.global', 'isii@test'];
    
    let updatedCount = 0;
    let notFoundCount = 0;

    for (const email of adminEmails) {
      const user = await User.findOne({ email });

      if (!user) {
        console.log(`❌ User ${email} not found`);
        notFoundCount++;
        continue;
      }

      // Update password
      user.password = newPassword;
      await user.save();

      console.log(`✅ Updated password for ${email}`);
      updatedCount++;
    }

    // Also update any admin@isii.com if it exists (old email)
    const oldAdmin = await User.findOne({ email: 'admin@isii.com' });
    if (oldAdmin) {
      oldAdmin.password = newPassword;
      await oldAdmin.save();
      console.log(`✅ Updated password for admin@isii.com (old email)`);
      updatedCount++;
    }

    console.log(`\n✅ Updated ${updatedCount} admin user(s)`);
    if (notFoundCount > 0) {
      console.log(`ℹ️  ${notFoundCount} user(s) not found`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating admin passwords:', error);
    process.exit(1);
  }
};

updateAdminPasswords();

