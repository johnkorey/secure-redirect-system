/**
 * Telegram Bot Service
 * Sends notifications to Telegram
 */

import fetch from 'node-fetch';

/**
 * Send a message to Telegram
 * @param {string} botToken - Telegram Bot Token
 * @param {string} chatId - Telegram Chat ID
 * @param {string} message - Message text
 * @param {object} options - Additional options (parse_mode, etc.)
 */
export async function sendTelegramMessage(botToken, chatId, message, options = {}) {
  if (!botToken || !chatId) {
    console.log('[Telegram] Missing bot token or chat ID');
    return { success: false, error: 'Missing credentials' };
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: options.parse_mode || 'HTML',
      disable_web_page_preview: options.disable_preview !== false,
      ...options
    };

    console.log(`[Telegram] Sending message to chat ${chatId}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.ok) {
      console.log('[Telegram] Message sent successfully');
      return { success: true, data };
    } else {
      console.error('[Telegram] Failed to send message:', data.description);
      return { success: false, error: data.description };
    }
  } catch (error) {
    console.error('[Telegram] Error sending message:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Format a chat message for Telegram
 * @param {object} message - Chat message object
 * @returns {string} Formatted message
 */
export function formatChatMessageForTelegram(message) {
  const senderName = message.sender_name || 'Unknown User';
  const senderRole = message.sender_role === 'admin' ? '👑 Admin' : '👤 User';
  const timestamp = new Date(message.created_at || message.created_date).toLocaleString();
  
  return `
<b>💬 New Chat Message</b>

<b>${senderRole}</b>: ${senderName}
<i>${timestamp}</i>

${message.message}
  `.trim();
}

/**
 * Send chat notification to all subscribed users
 * @param {object} db - Database instance
 * @param {object} message - Chat message object
 */
export async function notifyChatMessage(db, message) {
  try {
    // Get Telegram bot token from system config
    const botToken = db.systemConfigs.getValue('telegramBotToken');
    
    if (!botToken) {
      console.log('[Telegram] No bot token configured, skipping notifications');
      return;
    }

    // Get admin chat ID for notifications
    const adminChatId = db.systemConfigs.getValue('adminChatId');
    
    // Format the message
    const telegramMessage = formatChatMessageForTelegram(message);

    // Send to admin
    if (adminChatId) {
      console.log('[Telegram] Sending chat notification to admin');
      await sendTelegramMessage(botToken, adminChatId, telegramMessage);
    }

    // Send to all users who have telegram_chat_id set (opt-in)
    const apiUsers = Array.from(db.apiUsers.values());
    const subscribedUsers = apiUsers.filter(user => 
      user.telegram_chat_id && 
      user.telegram_chat_id.trim() !== '' &&
      user.email !== message.sender_email // Don't notify the sender
    );

    console.log(`[Telegram] Notifying ${subscribedUsers.length} subscribed users`);
    
    for (const user of subscribedUsers) {
      try {
        await sendTelegramMessage(botToken, user.telegram_chat_id, telegramMessage);
      } catch (error) {
        console.error(`[Telegram] Failed to send to user ${user.email}:`, error.message);
      }
    }

    console.log('[Telegram] Chat notifications sent');
  } catch (error) {
    console.error('[Telegram] Error in notifyChatMessage:', error.message);
  }
}

/**
 * Set webhook for Telegram bot
 * @param {string} botToken - Telegram Bot Token
 * @param {string} webhookUrl - Your webhook URL
 */
export async function setTelegramWebhook(botToken, webhookUrl) {
  try {
    const url = `https://api.telegram.org/bot${botToken}/setWebhook`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message']
      })
    });

    const data = await response.json();
    
    if (data.ok) {
      console.log('[Telegram] Webhook set successfully:', webhookUrl);
      return { success: true, data };
    } else {
      console.error('[Telegram] Failed to set webhook:', data.description);
      return { success: false, error: data.description };
    }
  } catch (error) {
    console.error('[Telegram] Error setting webhook:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Delete webhook for Telegram bot
 * @param {string} botToken - Telegram Bot Token
 */
export async function deleteWebhook(botToken) {
  try {
    const url = `https://api.telegram.org/bot${botToken}/deleteWebhook`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const data = await response.json();
    
    if (data.ok) {
      console.log('[Telegram] Webhook deleted successfully');
      return { success: true };
    } else {
      console.error('[Telegram] Failed to delete webhook:', data.description);
      return { success: false, error: data.description };
    }
  } catch (error) {
    console.error('[Telegram] Error deleting webhook:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get webhook info
 * @param {string} botToken - Telegram Bot Token
 */
export async function getWebhookInfo(botToken) {
  try {
    const url = `https://api.telegram.org/bot${botToken}/getWebhookInfo`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.ok) {
      return { success: true, info: data.result };
    } else {
      return { success: false, error: data.description };
    }
  } catch (error) {
    console.error('[Telegram] Error getting webhook info:', error.message);
    return { success: false, error: error.message };
  }
}

export default {
  sendTelegramMessage,
  formatChatMessageForTelegram,
  notifyChatMessage,
  setTelegramWebhook,
  deleteWebhook,
  getWebhookInfo
};

