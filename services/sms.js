require('dotenv').config();

/**
 * SMS Service for sending notifications to students
 * 
 * This service can be integrated with various SMS providers:
 * - Twilio (https://www.twilio.com)
 * - Africa's Talking (https://africastalking.com) - Popular in Africa
 * - Nexmo/Vonage (https://www.vonage.com)
 * - AWS SNS (https://aws.amazon.com/sns/)
 * 
 * For Rwanda specifically, consider:
 * - Africa's Talking (supports Rwanda)
 * - Pindo (https://pindo.io) - Rwanda-based SMS provider
 */

class SMSService {
  constructor() {
    this.provider = process.env.SMS_PROVIDER || 'console'; // 'twilio', 'africastalking', 'pindo', 'console'
    this.enabled = process.env.SMS_ENABLED === 'true';
  }

  /**
   * Send SMS notification to student about application status
   * @param {string} phoneNumber - Student's phone number
   * @param {string} studentName - Student's name
   * @param {string} status - Application status (approved/rejected)
   * @param {string} program - Program name
   * @param {string} notes - Additional notes from admin
   */
  async sendApplicationStatusSMS(phoneNumber, studentName, status, program, notes = '') {
    if (!this.enabled) {
      console.log('SMS service is disabled. Enable it by setting SMS_ENABLED=true in .env');
      return { success: false, message: 'SMS service disabled' };
    }

    const message = this.formatStatusMessage(studentName, status, program, notes);

    try {
      switch (this.provider) {
        case 'africastalking':
          return await this.sendViaAfricasTalking(phoneNumber, message);
        case 'twilio':
          return await this.sendViaTwilio(phoneNumber, message);
        case 'pindo':
          return await this.sendViaPindo(phoneNumber, message);
        case 'console':
        default:
          return this.logToConsole(phoneNumber, message);
      }
    } catch (error) {
      console.error('SMS sending error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Format the status message
   */
  formatStatusMessage(studentName, status, program, notes) {
    const schoolName = 'CSAM Zaccaria TVET';
    
    if (status === 'approved') {
      return `Dear ${studentName}, Congratulations! Your application for ${program} at ${schoolName} has been APPROVED. ${notes ? notes + ' ' : ''}Please contact us for next steps. Welcome aboard!`;
    } else if (status === 'rejected') {
      return `Dear ${studentName}, We regret to inform you that your application for ${program} at ${schoolName} was not successful at this time. ${notes ? notes + ' ' : ''}Thank you for your interest.`;
    } else {
      return `Dear ${studentName}, Your application for ${program} at ${schoolName} is being reviewed. We will notify you once a decision is made.`;
    }
  }

  /**
   * Send via Africa's Talking
   * Documentation: https://africastalking.com/sms
   */
  async sendViaAfricasTalking(phoneNumber, message) {
    // Uncomment and configure when ready to use
    /*
    const AfricasTalking = require('africastalking');
    
    const africastalking = AfricasTalking({
      apiKey: process.env.AFRICASTALKING_API_KEY,
      username: process.env.AFRICASTALKING_USERNAME,
    });

    const sms = africastalking.SMS;
    
    const result = await sms.send({
      to: [phoneNumber],
      message: message,
      from: process.env.AFRICASTALKING_SENDER_ID || 'CSAM'
    });

    return {
      success: true,
      provider: 'africastalking',
      result
    };
    */

    console.log('Africa\'s Talking not configured. Add credentials to .env');
    return this.logToConsole(phoneNumber, message);
  }

  /**
   * Send via Twilio
   * Documentation: https://www.twilio.com/docs/sms
   */
  async sendViaTwilio(phoneNumber, message) {
    // Uncomment and configure when ready to use
    /*
    const twilio = require('twilio');
    
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });

    return {
      success: true,
      provider: 'twilio',
      result
    };
    */

    console.log('Twilio not configured. Add credentials to .env');
    return this.logToConsole(phoneNumber, message);
  }

  /**
   * Send via Pindo (Rwanda-based)
   * Documentation: https://pindo.io/docs
   */
  async sendViaPindo(phoneNumber, message) {
    // Uncomment and configure when ready to use
    /*
    const axios = require('axios');
    
    const result = await axios.post('https://api.pindo.io/v1/sms/', {
      to: phoneNumber,
      text: message,
      sender: process.env.PINDO_SENDER_ID || 'CSAM'
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.PINDO_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    return {
      success: true,
      provider: 'pindo',
      result: result.data
    };
    */

    console.log('Pindo not configured. Add credentials to .env');
    return this.logToConsole(phoneNumber, message);
  }

  /**
   * Log to console (for testing/development)
   */
  logToConsole(phoneNumber, message) {
    console.log('\n========== SMS NOTIFICATION ==========');
    console.log(`To: ${phoneNumber}`);
    console.log(`Message: ${message}`);
    console.log('======================================\n');

    return {
      success: true,
      provider: 'console',
      message: 'SMS logged to console (development mode)'
    };
  }
}

module.exports = new SMSService();
