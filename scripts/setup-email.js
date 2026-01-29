require('dotenv').config();

console.log('\n📧 --- Email Configuration Check ---');
console.log(`Host:     ${process.env.EMAIL_HOST || 'smtp.gmail.com'}`);
console.log(`Port:     ${process.env.EMAIL_PORT || '587'}`);
console.log(`User:     ${process.env.EMAIL_USER || 'Not set'}`);
console.log(`Password: ${process.env.EMAIL_PASSWORD ? '********' : 'Not set'}`);
console.log(`Login URL: ${process.env.TEACHER_APP_URL || 'Not set'}`);

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.log('\n❌ ERROR: Email credentials are missing in .env');
} else {
    console.log('\n✅ Basic configuration exists in .env');
}

console.log('\nTo test sending an actual email, run:');
console.log('npm run test-email');
console.log('\n------------------------------------\n');
