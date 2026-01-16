# Gmail Email Setup Guide

## Problem
If you're seeing the error: `535-5.7.8 Username and Password not accepted`, Gmail is rejecting your authentication.

## Solution: Use Gmail App Password

Gmail requires an **App Password** instead of your regular password for third-party applications.

### Steps to Create Gmail App Password:

1. **Enable 2-Step Verification** (if not already enabled):
   - Go to: https://myaccount.google.com/security
   - Click on "2-Step Verification"
   - Follow the setup process

2. **Generate App Password**:
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" as the app
   - Select "Other (Custom name)" as the device
   - Enter "CSAM Backend" as the name
   - Click "Generate"
   - **Copy the 16-character password** (it will look like: `abcd efgh ijkl mnop`)

3. **Update your .env file**:
   ```env
   EMAIL_USER=fabricebesigye@gmail.com
   EMAIL_PASSWORD=abcdefghijklmnop
   ```
   ⚠️ **Important**: Remove spaces from the App Password when pasting it into .env

4. **Restart your backend server**:
   ```bash
   npm run dev
   ```

## Alternative: OAuth2 (Advanced)

For production, consider using OAuth2 instead of App Passwords. This requires:
- Google Cloud Console setup
- OAuth2 credentials
- More complex configuration

## Testing

After setting up, the email service will verify the connection on server start. You should see:
```
✅ Email service is ready to send messages
```

If you still see errors, check:
- App Password is correct (no spaces)
- 2-Step Verification is enabled
- App Password was generated for "Mail"

## Current Configuration

Your current email settings in `.env`:
- **Email**: fabricebesigye@gmail.com
- **Host**: smtp.gmail.com
- **Port**: 587
- **Security**: TLS

