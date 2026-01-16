# Email System Setup Guide - CSAM Zaccaria TSS

## Overview
The email system uses **Nodemailer** to send automated emails for:
- Application confirmations to students
- Application status updates (approved/rejected)
- Admin notifications for new applications

---

## Setup Instructions

### 1. Install Dependencies
```bash
cd backend
npm install nodemailer dotenv
```

### 2. Configure Environment Variables

Create a `.env` file in the `backend` folder:

```env
# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_school_email@gmail.com
EMAIL_PASSWORD=your_app_password_here
ADMIN_EMAIL=admin@csam.edu
```

---

## Gmail Setup (Recommended)

### Step 1: Enable 2-Factor Authentication
1. Go to your Google Account: https://myaccount.google.com/
2. Click **Security**
3. Enable **2-Step Verification**

### Step 2: Generate App Password
1. Go to: https://myaccount.google.com/apppasswords
2. Select **Mail** and **Other (Custom name)**
3. Name it: "CSAM School System"
4. Click **Generate**
5. Copy the 16-character password
6. Paste it in `.env` as `EMAIL_PASSWORD`

**Example:**
```env
EMAIL_USER=csam.school@gmail.com
EMAIL_PASSWORD=abcd efgh ijkl mnop
```

---

## Email Templates

### 1. Application Confirmation Email
**Sent to:** Student
**When:** Immediately after application submission
**Contains:**
- Confirmation message
- Application details (program, date)
- Next steps information
- Contact information

### 2. Application Status Update Email
**Sent to:** Student
**When:** Admin approves or rejects application
**Contains:**
- Status (Approved/Rejected)
- Admin notes (if any)
- Next steps (for approved applications)
- Required documents list

### 3. Admin Notification Email
**Sent to:** Admin
**When:** New application is submitted
**Contains:**
- Student information
- Program applied for
- Link to review application
- All application details

---

## Testing Email System

### Test 1: Application Submission
```bash
# Submit a test application via API
curl -X POST http://localhost:5000/api/applications \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Test Student",
    "email": "test@example.com",
    "phone_number": "+250788123456",
    "date_of_birth": "2000-01-01",
    "gender": "Male",
    "address": "Kigali, Rwanda",
    "program": "Software Development"
  }'
```

**Expected:**
- Student receives confirmation email
- Admin receives notification email

### Test 2: Status Update
```bash
# Approve application (requires admin token)
curl -X PATCH http://localhost:5000/api/applications/1/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "status": "approved",
    "admin_notes": "Congratulations! Please visit our office."
  }'
```

**Expected:**
- Student receives approval email with next steps

---

## Alternative Email Providers

### Outlook/Hotmail
```env
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_USER=your_email@outlook.com
EMAIL_PASSWORD=your_password
```

### Yahoo Mail
```env
EMAIL_HOST=smtp.mail.yahoo.com
EMAIL_PORT=587
EMAIL_USER=your_email@yahoo.com
EMAIL_PASSWORD=your_app_password
```

### Custom SMTP Server
```env
EMAIL_HOST=mail.yourschool.edu
EMAIL_PORT=587
EMAIL_USER=noreply@yourschool.edu
EMAIL_PASSWORD=your_password
```

---

## Troubleshooting

### Error: "Invalid login"
**Solution:** 
- Check EMAIL_USER and EMAIL_PASSWORD are correct
- For Gmail: Use App Password, not regular password
- Enable "Less secure app access" (not recommended)

### Error: "Connection timeout"
**Solution:**
- Check EMAIL_HOST and EMAIL_PORT
- Verify firewall allows SMTP connections
- Try port 465 with `secure: true`

### Emails not sending
**Solution:**
- Check backend console for errors
- Verify `.env` file is in `backend` folder
- Test with: `node -e "require('./services/email').sendApplicationConfirmation({full_name:'Test', email:'test@example.com', program:'Test', phone_number:'123'})"`

### Emails going to spam
**Solution:**
- Use a professional email domain
- Add SPF and DKIM records to your domain
- Avoid spam trigger words in subject/body
- Use a verified sender email

---

## Email Service Features

### Automatic Sending
✅ Emails send automatically (no manual action needed)
✅ Async sending (doesn't block API response)
✅ Error handling (logs errors, doesn't crash server)

### Email Content
✅ HTML templates with styling
✅ Plain text fallback
✅ Responsive design
✅ School branding (colors, logo)

### Security
✅ Environment variables for credentials
✅ No hardcoded passwords
✅ Secure SMTP connection (TLS)

---

## Production Recommendations

### 1. Use Professional Email Service
- **SendGrid** - 100 emails/day free
- **Mailgun** - 5,000 emails/month free
- **Amazon SES** - Very cheap, reliable
- **Postmark** - Transactional emails

### 2. Domain Email
Use `noreply@csam.edu` instead of Gmail

### 3. Email Queue
For high volume, use a queue system:
- Bull (Redis-based)
- RabbitMQ
- AWS SQS

### 4. Monitoring
- Track email delivery rates
- Monitor bounce rates
- Log all email attempts

---

## API Endpoints

### Submit Application (Public)
```
POST /api/applications
```
**Emails sent:**
- Confirmation to student
- Notification to admin

### Update Status (Admin)
```
PATCH /api/applications/:id/status
```
**Emails sent:**
- Status update to student

---

## Email Service Functions

Located in: `backend/services/email.js`

### `sendApplicationConfirmation(studentData)`
Sends confirmation email to student after application submission.

### `sendApplicationStatusUpdate(studentData, status, adminNotes)`
Sends status update email (approved/rejected) to student.

### `sendAdminNotification(studentData)`
Sends notification email to admin about new application.

---

## Support

For issues or questions:
- Check backend console logs
- Review `.env` configuration
- Test with simple email first
- Contact system administrator

---

## Summary

✅ **Nodemailer** configured
✅ **3 email types** implemented
✅ **Gmail setup** documented
✅ **Error handling** included
✅ **Production ready**

Email system is fully functional and ready to use!
