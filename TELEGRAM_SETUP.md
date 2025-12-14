# Telegram Integration Setup Guide

## Overview
Community Chat messages are automatically sent to Telegram. Admin receives all messages, and users can opt-in to receive notifications.

---

## Step 1: Create Telegram Bot

1. **Open Telegram** and search for `@BotFather`
2. **Send:** `/newbot`
3. **Choose a name:** e.g., "MyApp Community Bot"
4. **Choose a username:** e.g., "myapp_community_bot"
5. **Copy the Bot Token** (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

---

## Step 2: Get Your Chat ID

### For Admin:
1. **Start a chat** with your new bot (click the link BotFather provides)
2. **Send any message** to the bot (e.g., "Hello")
3. **Visit this URL** in your browser (replace TOKEN):
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
4. **Find your Chat ID** in the response:
   ```json
   {
     "message": {
       "chat": {
         "id": 123456789  ← This is your Chat ID
       }
     }
   }
   ```

### For Users:
- Users need to send a message to the bot first
- Then admin can use the same `/getUpdates` method to find their Chat IDs
- Or use `@userinfobot` on Telegram to get Chat ID

---

## Step 3: Configure in App

### Admin Configuration:
1. **Go to:** Configuration → System Settings → Telegram tab
2. **Telegram Bot Token:** Paste your bot token
3. **Admin Chat ID:** Paste your chat ID
4. **Save Settings**

### User Configuration:
1. **Go to:** User Management
2. **Edit a user**
3. **Add their `telegram_chat_id`** field
4. **Save**

---

## Step 4: Test It!

1. **Send a message** in Community Chat
2. **Check Telegram** - you should receive:

```
💬 New Chat Message

👤 User: John
12/13/2024, 10:30:15 AM

Hello everyone!
```

---

## Message Format

**User Messages:**
```
💬 New Chat Message
👤 User: Sarah
12/13/2024, 10:30 AM
This is my message
```

**Admin Messages:**
```
💬 New Chat Message
👑 Admin: Support Team
12/13/2024, 10:31 AM
Welcome to the community!
```

---

## Who Gets Notified?

✅ **Admin** - Always receives all messages  
✅ **Users with telegram_chat_id** - Opt-in only  
❌ **Message sender** - Not notified of own messages  

---

## Troubleshooting

**Not receiving messages?**
1. Check bot token is correct
2. Verify chat IDs are correct
3. Make sure you started chat with bot first
4. Check backend logs for errors

**Wrong chat ID format?**
- Chat IDs are numbers (can be negative for groups)
- Example: `123456789` or `-987654321`

**Want group notifications?**
1. Add bot to your Telegram group
2. Make it an admin
3. Use group Chat ID (negative number)

---

## Security Notes

⚠️ **Keep your Bot Token secret!**  
⚠️ **Only admins should have access to system settings**  
✅ **Bot can only send messages, not read them**  
✅ **Users must opt-in by providing chat ID**

---

## Next Steps

- Populate all user Telegram Chat IDs
- Test with different message types
- Set up group chat for team discussions
- Enable notifications for important alerts

