const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupEmail() {
  console.log('📧 CSAM Email Setup Wizard\n');
  console.log('This will help you configure Gmail for sending emails.\n');
  
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = '';
  
  // Read existing .env file
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }
  
  console.log('Current email configuration:');
  const currentUser = envContent.match(/EMAIL_USER=(.+)/)?.[1] || 'Not set';
  const currentPass = envContent.match(/EMAIL_PASSWORD=(.+)/)?.[1] || 'Not set';
  console.log(`  EMAIL_USER: ${currentUser}`);
  console.log(`  EMAIL_PASSWORD: ${currentPass ? '***' + currentPass.slice(-4) : 'Not set'}\n`);
  
  const useCurrent = await question('Use current email? (y/n): ');
  
  let emailUser, emailPassword;
  
  if (useCurrent.toLowerCase() === 'y' && currentUser !== 'Not set') {
    emailUser = currentUser;
    emailPassword = currentPass;
  } else {
    emailUser = await question('Enter Gmail address: ');
    console.log('\n📝 IMPORTANT: You need a Gmail App Password, not your regular password!');
    console.log('   If you don\'t have one yet:');
    console.log('   1. Go to: https://myaccount.google.com/apppasswords');
    console.log('   2. Generate an App Password for "Mail"');
    console.log('   3. Copy the 16-character password (remove spaces)\n');
    emailPassword = await question('Enter Gmail App Password (16 characters, no spaces): ');
  }
  
  // Update .env file
  let updatedContent = envContent;
  
  // Update or add EMAIL_USER
  if (updatedContent.includes('EMAIL_USER=')) {
    updatedContent = updatedContent.replace(/EMAIL_USER=.*/g, `EMAIL_USER=${emailUser}`);
  } else {
    updatedContent += `\nEMAIL_USER=${emailUser}`;
  }
  
  // Update or add EMAIL_PASSWORD
  if (updatedContent.includes('EMAIL_PASSWORD=')) {
    updatedContent = updatedContent.replace(/EMAIL_PASSWORD=.*/g, `EMAIL_PASSWORD=${emailPassword}`);
  } else {
    updatedContent += `\nEMAIL_PASSWORD=${emailPassword}`;
  }
  
  // Ensure EMAIL_HOST and EMAIL_PORT are set
  if (!updatedContent.includes('EMAIL_HOST=')) {
    updatedContent += '\nEMAIL_HOST=smtp.gmail.com';
  }
  if (!updatedContent.includes('EMAIL_PORT=')) {
    updatedContent += '\nEMAIL_PORT=587';
  }
  
  // Write back to .env
  fs.writeFileSync(envPath, updatedContent);
  
  console.log('\n✅ .env file updated!\n');
  console.log('🔄 Testing email configuration...\n');
  
  rl.close();
  
  // Run test script
  require('./test-email.js');
}

setupEmail().catch(console.error);

