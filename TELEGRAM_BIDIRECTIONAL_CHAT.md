# Bidirectional Telegram Chat Setup

## Overview
Users can now chat from **both** the web and Telegram! Messages sync automatically in both directions.

---

## How It Works

### 📤 Web → Telegram (Already Working)
- User sends message in Community Chat widget
- Backend sends notification to Telegram
- Everyone receives notification instantly

### 📥 Telegram → Web (NEW!)
- User replies in Telegram
- Telegram sends update to your webhook
- Backend saves message to chat database
- Web chat shows the message (refreshes every 2s)

---

## Setup Steps

### Step 1: Configure Bot & Chat ID
```
Configuration → System Settings → Telegram Tab
```

1. **Telegram Bot Token:** Paste your bot token
2. **Admin Chat ID:** Paste your chat ID
3. Click **"📤 Send Test Message"** to verify

### Step 2: Setup Webhook
Click **"🔗 Setup Bidirectional Chat"** button

This tells Telegram where to send incoming messages:
```
Webhook URL: http://your-domain.com/api/telegram/webhook
```

### Step 3: Test It!
1. **Send a message** in Community Chat (web)
2. **Check Telegram** - you should receive notification
3. **Reply in Telegram**
4. **Check web chat** - your reply appears!

---

## Webhook Endpoint

### URL Format
```
POST http://your-domain.com/api/telegram/webhook
```

### What It Does
1. Receives Telegram updates (messages)
2. Identifies sender by Chat ID
3. Saves message to chat database
4. Message appears in web chat automatically

### Security
- Endpoint is public (Telegram needs access)
- Only processes text messages
- Validates message structure
- Links Chat ID to user account

---

## User Identification

### How Users Are Matched
1. **By Chat ID:** Matches `telegram_chat_id` in user profile
2. **Admin:** Matches `adminChatId` in system config
3. **Unknown:** Creates generic "Telegram User" entry

### Setting User Chat IDs
```
User Management → Edit User → telegram_chat_id
```

---

## Message Flow

### Scenario 1: Admin Sends from Web
```
Admin (Web) → Backend → Telegram Bot → All Users
```

### Scenario 2: User Replies from Telegram
```
User (Telegram) → Webhook → Backend → Database → Web Chat
```

### Scenario 3: Cross-Platform Conversation
```
Admin (Web) → Telegram → User sees notification
User (Telegram) → Webhook → Admin sees in web chat
Admin (Web) → Telegram → User sees notification
...
```

---

## Features

### ✅ Web Chat
- Send messages
- See all messages
- Real-time refresh (2s)
- Message grouping
- Typing indicators (future)

### ✅ Telegram
- Receive notifications
- Reply directly
- Rich formatting (HTML)
- Always accessible
- Mobile & desktop

### ✅ Message Attributes
- Sender name
- Role (Admin/User)
- Timestamp
- Source (web/telegram)
- Chat ID linkage

---

## Testing Checklist

- [ ] Configure Bot Token
- [ ] Configure Admin Chat ID
- [ ] Send test message (verify receipt)
- [ ] Setup webhook (click button)
- [ ] Send message from web → Check Telegram
- [ ] Reply from Telegram → Check web
- [ ] Send from another user → Verify sync
- [ ] Check message formatting
- [ ] Verify sender names correct

---

## Troubleshooting

### Webhook Not Working?
1. Check webhook info: Click **"ℹ️ Webhook Info"**
2. Verify URL is correct: `http://your-domain.com/api/telegram/webhook`
3. Check backend logs for webhook calls
4. Make sure domain is publicly accessible

### Messages Not Appearing in Web?
1. Web chat refreshes every 2 seconds
2. Hard refresh browser (Ctrl+Shift+R)
3. Check backend logs for webhook receipt
4. Verify message was saved to database

### Wrong Sender Name?
1. Check `telegram_chat_id` matches in user profile
2. Admin messages use `adminChatId` from config
3. Unknown Chat IDs show as "Telegram User"

### Webhook Fails to Set?
1. Bot token must be correct
2. Domain must be publicly accessible
3. HTTPS recommended (HTTP works for testing)
4. Check firewall allows port 3001

---

## Advanced Configuration

### Group Chat Support
1. Add bot to Telegram group
2. Make bot an admin
3. Get group Chat ID (negative number)
4. Use as Chat ID in user profile

### Multiple Admins
1. Each admin adds their Chat ID
2. All get notifications
3. All can reply from Telegram
4. Web shows who sent each message

### Custom Webhooks
```javascript
POST /api/telegram/setup-webhook
{
  "webhookUrl": "https://custom.domain.com/webhook"
}
```

---

## Message Format Examples

### From Web (HTML)
```html
💬 <b>New Chat Message</b>

👤 User: John
12/13/2024, 10:30 AM

Hello from the web!
```

### From Telegram (Plain Text)
```
Saved as:
- sender_name: John
- sender_role: user
- message: "Hello from Telegram!"
- source: telegram
```

---

## API Endpoints

### Setup Webhook
```
POST /api/telegram/setup-webhook
Authorization: Bearer <token>
Body: { "webhookUrl": "..." }
```

### Get Webhook Info
```
GET /api/telegram/webhook-info
Authorization: Bearer <token>
```

### Receive Telegram Updates (Webhook)
```
POST /api/telegram/webhook
Body: Telegram Update object
```

---

## Security Notes

⚠️ **Webhook is public** - Telegram needs to access it  
✅ **Message validation** - Only text messages processed  
✅ **User verification** - Chat ID matched to accounts  
✅ **Admin controls** - Only admins setup webhook  

---

## Future Enhancements

- [ ] Message reactions
- [ ] File/image support
- [ ] Typing indicators
- [ ] Read receipts
- [ ] Message editing
- [ ] Message deletion
- [ ] Thread support

---

## Need Help?

Check:
1. Backend logs for webhook calls
2. Telegram bot logs (@BotFather)
3. Webhook info endpoint
4. Browser console for errors

Test:
1. Send test message
2. Check webhook status
3. Try from different users
4. Verify Chat IDs correct

