const nodemailer = require('nodemailer');
require('dotenv').config();

// Check if email is configured
const isEmailConfigured = () => {
  return process.env.EMAIL_USER && process.env.EMAIL_PASSWORD;
};

// Cache transporter to avoid recreating it
let cachedTransporter = null;
let verificationAttempted = false;

// Create transporter
const createTransporter = () => {
  if (!isEmailConfigured()) {
    console.warn('⚠️  Email service not configured. Set EMAIL_USER and EMAIL_PASSWORD in .env file.');
    return null;
  }
  
  // Return cached transporter if available
  if (cachedTransporter) {
    return cachedTransporter;
  }
  
  const port = Number(process.env.EMAIL_PORT) || 587;
  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';

  cachedTransporter = nodemailer.createTransport({
    host: host,
    port: port,
    secure: port === 465, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    tls: {
      // Do not fail on invalid certs
      rejectUnauthorized: false,
      ciphers: 'SSLv3'
    },
    debug: false, // Disable debug to reduce noise
    logger: false
  });

  // Verify connection configuration only once on first use
  if (!verificationAttempted) {
    verificationAttempted = true;
    cachedTransporter.verify(function (error, success) {
      if (error) {
        console.error('❌ Email service configuration error:', error.message);
        if (error.code === 'EAUTH') {
          console.error('\n📧 Gmail Authentication Failed!');
          console.error('To fix this issue, run: npm run setup-email');
          console.error('Or see: backend/EMAIL_QUICK_FIX.md\n');
        }
      } else {
        console.log('✅ Email service is ready to send messages');
      }
    });
  }

  return cachedTransporter;
};

// Send admin password reset email
const sendAdminPasswordReset = async (admin, resetToken) => {
  try {
    const transporter = createTransporter();

    if (!transporter) {
      console.log('📧 Email not configured - Skipping admin password reset email');
      return { success: false, error: 'Email service not configured' };
    }

    const frontendUrl = process.env.ADMIN_APP_URL || 'http://localhost:5173/admin';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"CSAM System" <${process.env.EMAIL_USER}>`,
      to: admin.email,
      subject: 'Admin Password Reset Instructions',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1e3a8a; color: white; padding: 25px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #1e3a8a; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
            .code { font-size: 16px; font-weight: bold; letter-spacing: 2px; padding: 12px; background: #e0e7ff; display: inline-block; border-radius: 6px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hello <strong>${admin.full_name || admin.username}</strong>,</p>
              <p>We received a request to reset your administrator password for the CSAM Zaccaria TVET system.</p>
              <p>If you initiated this request, click the button below to set a new password. This link is valid for 1 hour.</p>
              <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </p>
              <p>If the button above does not work, copy and paste this URL into your browser:</p>
              <p class="code">${resetUrl}</p>
              <p>If you did not request a password reset, please ignore this email or contact the system administrator immediately.</p>
            </div>
            <div class="footer">
              <p>CSAM Zaccaria TVET • System Security Team</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hello ${admin.full_name || admin.username},

We received a request to reset your administrator password for the CSAM Zaccaria TVET system.

Reset your password using the link below (valid for 1 hour):
${resetUrl}

If you did not request a password reset, please ignore this email.
`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Admin password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending admin password reset email:', error.message);
    if (error.code === 'EAUTH') {
      console.error('📧 Authentication failed. Please check GMAIL_SETUP.md for instructions on using App Password.');
    }
    return { success: false, error: error.message };
  }
};

// Send application confirmation email to student
const sendApplicationConfirmation = async (studentData) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      console.log('📧 Email not configured - Skipping application confirmation email');
      return { success: false, error: 'Email service not configured' };
    }

    const mailOptions = {
      from: `"CSAM Zaccaria TVET" <${process.env.EMAIL_USER}>`,
      to: studentData.email,
      subject: 'Application Received - CSAM Zaccaria TVET',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .info-box { background: white; padding: 20px; margin: 20px 0; border-left: 4px solid #667eea; border-radius: 5px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            h1 { margin: 0; font-size: 28px; }
            h2 { color: #667eea; margin-top: 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎓 Application Received!</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${studentData.full_name}</strong>,</p>
              
              <p>Thank you for applying to <strong>CSAM Zaccaria TVET</strong>! We have successfully received your application.</p>
              
              <div class="info-box">
                <h2>Application Details</h2>
                <p><strong>Program:</strong> ${studentData.program}</p>
                <p><strong>Application Date:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <p><strong>Status:</strong> Pending Review</p>
              </div>
              
              <h3>What Happens Next?</h3>
              <ol>
                <li>Our admissions team will review your application</li>
                <li>You will receive an email notification about your application status</li>
                <li>If approved, you'll receive further instructions</li>
              </ol>
              
              <p><strong>Important:</strong> Please keep this email for your records. You may be contacted via email or phone (${studentData.phone_number}) for additional information.</p>
              
              <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0;"><strong>⚠️ Note:</strong> If you did not submit this application, please contact us immediately at <a href="mailto:${process.env.EMAIL_USER}">${process.env.EMAIL_USER}</a></p>
              </div>
              
              <div class="footer">
                <p><strong>CSAM Zaccaria TVET</strong></p>
                <p>Center for Skill Acquisition and Management</p>
                <p>Email: ${process.env.EMAIL_USER} | Phone: +255 123 456 789</p>
                <p>&copy; ${new Date().getFullYear()} CSAM Zaccaria TVET. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Dear ${studentData.full_name},

Thank you for applying to CSAM Zaccaria TVET! We have successfully received your application.

Application Details:
- Program: ${studentData.program}
- Application Date: ${new Date().toLocaleDateString()}
- Status: Pending Review

What Happens Next?
1. Our admissions team will review your application
2. You will receive an email notification about your application status
3. If approved, you'll receive further instructions

Please keep this email for your records.

Best regards,
CSAM Zaccaria TVET
Email: ${process.env.EMAIL_USER}
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Application confirmation email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending application confirmation email:', error.message);
    if (error.code === 'EAUTH') {
      console.error('📧 Authentication failed. Please check GMAIL_SETUP.md for instructions on using App Password.');
    }
    return { success: false, error: error.message };
  }
};

// Send application status update email
const sendApplicationStatusUpdate = async (studentData, status, adminNotes = '') => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      console.log('📧 Email not configured - Skipping status update email');
      return { success: false, error: 'Email service not configured' };
    }

    const isApproved = status === 'approved';
    const statusColor = isApproved ? '#10b981' : '#ef4444';
    const statusText = isApproved ? 'Approved ✅' : 'Update on Your Application';
    const statusEmoji = isApproved ? '🎉' : '📋';

    const mailOptions = {
      from: `"CSAM Zaccaria TVET" <${process.env.EMAIL_USER}>`,
      to: studentData.email,
      subject: `Application ${isApproved ? 'Approved' : 'Status Update'} - CSAM Zaccaria TVET`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${statusColor}; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .status-box { background: white; padding: 20px; margin: 20px 0; border-left: 4px solid ${statusColor}; border-radius: 5px; text-align: center; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            h1 { margin: 0; font-size: 28px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${statusEmoji} ${statusText}</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${studentData.full_name}</strong>,</p>
              
              ${isApproved ? `
                <div class="status-box">
                  <h2 style="color: ${statusColor}; margin: 0;">Congratulations!</h2>
                  <p style="font-size: 18px; margin: 10px 0;">Your application has been <strong>APPROVED</strong>!</p>
                </div>
                
                <p>We are pleased to inform you that your application for <strong>${studentData.program}</strong> has been approved.</p>
                
                <h3>Next Steps:</h3>
                <ol>
                  <li>Visit our school office with the following documents:
                    <ul>
                      <li>Valid ID or Birth Certificate</li>
                      <li>Previous academic certificates</li>
                      <li>Passport-size photos (2 copies)</li>
                    </ul>
                  </li>
                  <li>Complete the registration process</li>
                  <li>Pay the required fees</li>
                  <li>Receive your student ID and class schedule</li>
                </ol>
                
                ${adminNotes ? `
                  <div style="background: #e0f2fe; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>Additional Information:</strong></p>
                    <p style="margin: 10px 0 0 0;">${adminNotes}</p>
                  </div>
                ` : ''}
                
                <p><strong>Office Hours:</strong> Monday - Friday, 8:00 AM - 5:00 PM</p>
                <p>We look forward to welcoming you to CSAM Zaccaria TVET!</p>
              ` : `
                <div class="status-box">
                  <h2 style="color: ${statusColor}; margin: 0;">Application Status Update</h2>
                  <p style="font-size: 18px; margin: 10px 0;">Status: <strong>${status.toUpperCase()}</strong></p>
                </div>
                
                <p>We wanted to update you on the status of your application for <strong>${studentData.program}</strong>.</p>
                
                ${adminNotes ? `
                  <div style="background: #fee2e2; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>Message from Admissions:</strong></p>
                    <p style="margin: 10px 0 0 0;">${adminNotes}</p>
                  </div>
                ` : ''}
                
                <p>If you have any questions, please don't hesitate to contact us.</p>
              `}
              
              <div class="footer">
                <p><strong>CSAM Zaccaria TVET</strong></p>
                <p>Center for Skill Acquisition and Management</p>
                <p>Email: ${process.env.EMAIL_USER} | Phone: +255 123 456 789</p>
                <p>&copy; ${new Date().getFullYear()} CSAM Zaccaria TVET. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Dear ${studentData.full_name},

${isApproved ? 'Congratulations! Your application has been APPROVED!' : 'Application Status Update'}

Your application for ${studentData.program} status: ${status.toUpperCase()}

${adminNotes ? `Message from Admissions:\n${adminNotes}\n` : ''}

${isApproved ? `
Next Steps:
1. Visit our school office with required documents
2. Complete registration process
3. Pay required fees
4. Receive student ID and class schedule

Office Hours: Monday - Friday, 8:00 AM - 5:00 PM
` : ''}

Best regards,
CSAM Zaccaria TVET
Email: ${process.env.EMAIL_USER}
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Status update email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending status update email:', error.message);
    if (error.code === 'EAUTH') {
      console.error('📧 Authentication failed. Please check GMAIL_SETUP.md for instructions on using App Password.');
    }
    return { success: false, error: error.message };
  }
};

// Send notification to admin about new application
const sendAdminNotification = async (studentData) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      console.log('📧 Email not configured - Skipping admin notification email');
      return { success: false, error: 'Email service not configured' };
    }

    const mailOptions = {
      from: `"CSAM System" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      subject: '🔔 New Student Application Received',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #667eea; color: white; padding: 20px; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 10px 10px; }
            .info-row { display: flex; padding: 10px; border-bottom: 1px solid #ddd; }
            .info-label { font-weight: bold; width: 150px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>🔔 New Application Received</h2>
            </div>
            <div class="content">
              <p>A new student application has been submitted and requires review.</p>
              
              <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin-top: 0;">Student Information</h3>
                <div class="info-row">
                  <div class="info-label">Name:</div>
                  <div>${studentData.full_name}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Email:</div>
                  <div>${studentData.email}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Phone:</div>
                  <div>${studentData.phone_number}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Program:</div>
                  <div><strong>${studentData.program}</strong></div>
                </div>
                <div class="info-row">
                  <div class="info-label">Date of Birth:</div>
                  <div>${studentData.date_of_birth}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Address:</div>
                  <div>${studentData.address}</div>
                </div>
              </div>
              
              <p style="text-align: center;">
                <a href="http://localhost:5173/admin/applications" class="button">Review Application</a>
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Admin notification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending admin notification:', error.message);
    if (error.code === 'EAUTH') {
      console.error('📧 Authentication failed. Please check GMAIL_SETUP.md for instructions on using App Password.');
    }
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendApplicationConfirmation,
  sendApplicationStatusUpdate,
  sendAdminNotification,
  sendAdminPasswordReset,
};
