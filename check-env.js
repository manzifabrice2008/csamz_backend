require('dotenv').config();
console.log('Checking Environment Variables...');
console.log('JWT_SECRET present:', !!process.env.JWT_SECRET);
if (process.env.JWT_SECRET) {
    console.log('JWT_SECRET starts with:', process.env.JWT_SECRET.substring(0, 3) + '...');
}
console.log('PWD:', process.cwd());
