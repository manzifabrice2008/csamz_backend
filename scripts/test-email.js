const nodemailer = require('nodemailer');
require('dotenv').config();

console.log('📧 Testing Email Configuration...\n');

// Check configuration
const emailUser = process.env.EMAIL_USER;
const emailPassword = process.env.EMAIL_PASSWORD;

if (!emailUser || !emailPassword) {
  console.error('❌ Email configuration missing!');
  console.error('Please set EMAIL_USER and EMAIL_PASSWORD in your .env file.\n');
  process.exit(1);
}

console.log('✅ Email configuration found:');
console.log(`   User: ${emailUser}`);
console.log(`   Password: ${emailPassword.substring(0, 4)}${'*'.repeat(emailPassword.length - 4)}`);
console.log(`   Host: ${process.env.EMAIL_HOST || 'smtp.gmail.com'}`);
console.log(`   Port: ${process.env.EMAIL_PORT || 587}\n`);

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: emailUser,
    pass: emailPassword,
  },
  tls: {
    rejectUnauthorized: false,
    ciphers: 'SSLv3'
  }
});

// Test connection
console.log('🔄 Testing connection...\n');

transporter.verify(function (error, success) {
  if (error) {
    console.error('❌ Connection failed!\n');
    console.error('Error:', error.message);
    
    if (error.code === 'EAUTH') {
      console.error('\n' + '='.repeat(60));
      console.error('📧 GMAIL AUTHENTICATION ERROR');
      console.error('='.repeat(60));
      console.error('\nYour Gmail account requires an App Password.\n');
      console.error('🔧 QUICK FIX STEPS:');
      console.error('\n1. Enable 2-Step Verification:');
      console.error('   → https://myaccount.google.com/security');
      console.error('   → Click "2-Step Verification" and follow setup\n');
      
      console.error('2. Generate App Password:');
      console.error('   → https://myaccount.google.com/apppasswords');
      console.error('   → Select "Mail" as app');
      console.error('   → Select "Other (Custom name)"');
      console.error('   → Enter "CSAM Backend"');
      console.error('   → Click "Generate"\n');
      
      console.error('3. Copy the 16-character password (looks like: abcd efgh ijkl mnop)');
      console.error('   ⚠️  Remove all spaces when pasting!\n');
      
      console.error('4. Update your .env file:');
      console.error(`   EMAIL_USER=${emailUser}`);
      console.error('   EMAIL_PASSWORD=your-16-char-app-password-here\n');
      
      console.error('5. Run this test again:');
      console.error('   node scripts/test-email.js\n');
      
      console.error('='.repeat(60));
    } else {
      console.error('\nOther possible issues:');
      console.error('- Check your internet connection');
      console.error('- Verify EMAIL_HOST and EMAIL_PORT in .env');
      console.error('- Check firewall settings\n');
    }
    
    process.exit(1);
  } else {
    console.log('✅ Connection successful!');
    console.log('✅ Email service is ready to send messages.\n');
    
    // Try sending a test email
    console.log('📨 Sending test email...\n');
    
    const testEmail = {
      from: `"CSAM Test" <${emailUser}>`,
      to: emailUser, // Send to self
      subject: 'Test Email from CSAM Backend',
      html: `
        <h2>✅ Email Test Successful!</h2>
        <p>This is a test email from your CSAM Zaccaria TVET backend.</p>
        <p>If you received this, your email configuration is working correctly.</p>
        <hr>
        <p><small>Sent at: ${new Date().toLocaleString()}</small></p>
      `,
      text: 'Email test successful! Your email configuration is working correctly.'
    };
    
    transporter.sendMail(testEmail, (error, info) => {
      if (error) {
        console.error('❌ Failed to send test email:', error.message);
        process.exit(1);
      } else {
        console.log('✅ Test email sent successfully!');
        console.log(`   Message ID: ${info.messageId}`);
        console.log(`   Check your inbox: ${emailUser}\n`);
        console.log('🎉 Email service is fully configured and working!\n');
        process.exit(0);
      }
    });
  }
});

