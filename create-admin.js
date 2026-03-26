require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('./models/Admin');

async function createAdmin() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://manzifabrice2008_db_user:fabrice%40123@camz.lmsdsfa.mongodb.net/csamz?appName=Camz';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Check if admin exists
    const existingAdmin = await Admin.findOne({ email: 'admin@csamz.com' });
    if (existingAdmin) {
      console.log('Admin already exists.');
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    const admin = new Admin({
      username: 'superadmin',
      email: 'admin@csamz.com',
      password: hashedPassword,
      full_name: 'Super Admin',
      role: 'super_admin'
    });

    await admin.save();
    console.log('Admin account created successfully:');
    console.log('Email: admin@csamz.com');
    console.log('Password: admin123');
    process.exit(0);
  } catch (err) {
    console.error('Error creating admin:', err);
    process.exit(1);
  }
}

createAdmin();
