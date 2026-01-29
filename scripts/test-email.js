const { sendTeacherStatusUpdate } = require('../services/email');
require('dotenv').config();

async function testEmail() {
    console.log('🧪 Starting email test...');
    console.log(`📧 Using sender: ${process.env.EMAIL_USER}`);

    const dummyTeacher = {
        email: process.env.EMAIL_USER, // Send it to self
        full_name: 'Test Teacher',
        username: 'testteacher'
    };

    try {
        console.log('📤 Sending approved status email to self...');
        const result = await sendTeacherStatusUpdate(dummyTeacher, 'approved');

        if (result.success) {
            console.log('✅ Test email sent successfully!');
            console.log('Ref:', result.messageId);
        } else {
            console.error('❌ Test failed:', result.error);
            if (result.error.includes('EAUTH')) {
                console.log('\n💡 TIP: For Gmail, ensure you use an "App Password", not your regular account password.');
            }
        }
    } catch (error) {
        console.error('💥 Unexpected error:', error);
    }
}

testEmail();
