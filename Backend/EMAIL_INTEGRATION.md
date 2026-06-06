# Email Integration Setup

## Overview
Email sending has been integrated into the waitlist offer cycle. When a customer doesn't pick up the phone (`call_no_answer`), an email is automatically sent to notify them about the available appointment slot.

## Flow
1. **Call Attempt**: Customer doesn't pick up → Fonio webhook receives `no-answer` status
2. **Email Triggered**: System fetches customer email and sends reminder email
3. **Communication Logged**: Email attempt is logged in `communicationLogs` table with status (sent/failed/skipped)
4. **Next Call**: After email is sent, system calls next person on waitlist

## Environment Configuration

Add the following environment variables to your `.env` file:

```env
# SMTP Configuration
SMTP_HOST=smtp.gmail.com           # Your SMTP server host
SMTP_PORT=587                      # SMTP port (587 for TLS, 465 for SSL)
SMTP_SECURE=false                  # Set to "true" for SSL (port 465)
SMTP_USER=your-email@gmail.com     # SMTP username
SMTP_PASSWORD=your-app-password    # SMTP password (use app-specific password for Gmail)
SMTP_FROM_EMAIL=noreply@company.com # From address for outgoing emails
```

## Example: Gmail Setup

1. Enable 2-Factor Authentication on your Gmail account
2. Generate an [App Password](https://myaccount.google.com/apppasswords)
3. Add to `.env`:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=xxxx xxxx xxxx xxxx  # Your 16-character app password
   SMTP_FROM_EMAIL=your-email@gmail.com
   ```

## Example: Other Providers

### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASSWORD=SG.xxxxxxxxxxxxx
SMTP_FROM_EMAIL=noreply@company.com
```

### AWS SES
```env
SMTP_HOST=email-smtp.region.amazonaws.com  # e.g., email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_FROM_EMAIL=verified-email@company.com
```

## Development Mode

If SMTP credentials are not configured in development:
- Emails will **NOT be sent** (graceful skip)
- A warning will be logged: `[email] No SMTP configured, email will NOT be sent in development mode`
- Communication log will show status: `skipped`

## Email Template

The email sent includes:
- Customer first name greeting
- Client/service name
- Slot date and time
- Duration
- Call reminder message
- Instructions to reply or contact

Example email content:
```
Subject: [Client Name] — Appointment Slot Available

Hi [FirstName],

We have an available appointment slot for [Client Name].

Slot Details:
Date & Time: [Slot Date & Time]
Duration: [Duration] minutes

You just missed our call, but we're sending you this reminder so you don't forget!

Please reply to this email or contact us if you'd like to confirm this appointment.
```

## Communication Log Tracking

All email attempts are logged in the `communicationLogs` table:

| Field | Value |
|-------|-------|
| `channel` | `"email"` |
| `direction` | `"outbound"` |
| `eventType` | `"no_answer_followup_email"` |
| `status` | `"requested"` → `"sent"` \| `"failed"` \| `"skipped"` |
| `externalRef` | Email result/error details (JSON) |

Query example:
```sql
SELECT * FROM communicationLogs 
WHERE channel = 'email' 
  AND eventType = 'no_answer_followup_email'
ORDER BY createdAt DESC;
```

## Error Handling

- **No customer email**: Email skipped silently, logged as `skipped`
- **SMTP connection error**: Logged as `failed`, error details in `externalRef`
- **Email send timeout**: Caught and logged, webhook still completes successfully
- **Any error**: Does NOT block the next person from being called

## Testing

### Manual Test Email
```bash
curl -X POST http://localhost:3005/api/webhooks/fonio \
  -H "Content-Type: application/json" \
  -d '{
    "status": "no-answer",
    "context": {
      "offerId": "test-offer-id"
    }
  }'
```

### Check Logs
```bash
# View email communication logs
SELECT * FROM communicationLogs WHERE channel = 'email' ORDER BY createdAt DESC LIMIT 10;
```

## Customization

To modify email template or behavior:
1. Edit [src/modules/email/email.service.js](../email/email.service.js)
2. Update `sendWaitlistOfferEmail()` function
3. Restart server

## Future Enhancements

Potential improvements:
- [ ] Customer email preference/opt-in
- [ ] WhatsApp fallback if email fails
- [ ] Scheduled email queuing (send after 30 seconds delay)
- [ ] Email open/click tracking
- [ ] Per-client branded email templates
- [ ] Multi-language email support
