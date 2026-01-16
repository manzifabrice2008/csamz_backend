# 🚀 Quick Fix for Gmail Email Authentication

## The Problem
You're seeing: `535-5.7.8 Username and Password not accepted`

This happens because Gmail requires an **App Password** instead of your regular password.

## ⚡ Quick Solution (5 minutes)

### Step 1: Generate Gmail App Password

1. **Enable 2-Step Verification** (if not already):
   - Visit: https://myaccount.google.com/security
   - Click "2-Step Verification" → Follow setup

2. **Create App Password**:
   - Visit: https://myaccount.google.com/apppasswords
   - Select "Mail" → "Other (Custom name)" → Enter "CSAM Backend"
   - Click "Generate"
   - **Copy the 16-character password** (example: `abcd efgh ijkl mnop`)

### Step 2: Update Your .env File

Open `backend/.env` and update:

```env
EMAIL_USER=fabricebesigye@gmail.com
EMAIL_PASSWORD=abcdefghijklmnop
```

⚠️ **Important**: Remove ALL spaces from the App Password!

### Step 3: Test the Configuration

Run the test script:

```bash
cd backend
npm run test-email
```

Or use the setup wizard:

```bash
npm run setup-email
```

### Step 4: Restart Your Server

```bash
npm run dev
```

You should now see: `✅ Email service is ready to send messages`

## 🎯 Alternative: Use Setup Wizard

For interactive setup, run:

```bash
cd backend
npm run setup-email
```

This will guide you through the entire process step-by-step.

## ✅ Verification

After setup, when you restart the server, you should see:
- `✅ Email service is ready to send messages` (on startup)
- No more authentication errors when sending emails

## 📧 Test Email

The test script will send a test email to your Gmail address to verify everything works.

## ❓ Still Having Issues?

1. Make sure 2-Step Verification is enabled
2. Verify the App Password has no spaces
3. Check that you're using the App Password, not your regular password
4. Ensure the App Password was generated for "Mail"

---

**Current Configuration:**
- Email: fabricebesigye@gmail.com
- Host: smtp.gmail.com
- Port: 587
- Security: TLS

