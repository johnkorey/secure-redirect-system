/**
 * Email Service using Mailgun API
 * Supports sending from multiple domains
 */

import FormData from 'form-data';

/**
 * Get Mailgun config from database configs
 */
export async function getMailgunConfig(systemConfigs) {
  const getConfig = async (key) => {
    return await systemConfigs.getValue(key);
  };

  return {
    mailgun_api_key: await getConfig('mailgun_api_key') || process.env.MAILGUN_API_KEY || '',
    mailgun_domain: await getConfig('mailgun_domain') || process.env.MAILGUN_DOMAIN || '',
    mailgun_from_email: await getConfig('mailgun_from_email') || 'noreply@example.com',
    mailgun_from_name: await getConfig('mailgun_from_name') || 'Secure Redirect',
    mailgun_region: await getConfig('mailgun_region') || 'us' // 'us' or 'eu'
  };
}

/**
 * Get Mailgun API base URL based on region
 */
function getMailgunApiUrl(region) {
  return region === 'eu' ? 'https://api.eu.mailgun.net/v3' : 'https://api.mailgun.net/v3';
}

/**
 * Send verification email
 */
export async function sendVerificationEmail(to, code, config) {
  const subject = 'Your Verification Code';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background: #f8fafc; padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .logo { text-align: center; margin-bottom: 30px; }
        .code { background: #10b981; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 20px; border-radius: 8px; letter-spacing: 8px; margin: 20px 0; }
        .message { color: #64748b; text-align: center; line-height: 1.6; }
        .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <h1 style="color: #10b981; margin: 0;">🛡️ Secure Redirect</h1>
        </div>
        <p class="message">Use the following code to verify your email address:</p>
        <div class="code">${code}</div>
        <p class="message">This code expires in 10 minutes.</p>
        <p class="message" style="font-size: 14px;">If you didn't request this code, you can safely ignore this email.</p>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Secure Redirect. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(to, subject, html, config);
}

/**
 * Send payment confirmation email
 */
export async function sendPaymentConfirmationEmail(to, details, config) {
  const subject = 'Payment Confirmed - Account Activated';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background: #f8fafc; padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .success { background: #10b981; color: white; text-align: center; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .details { background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .details p { margin: 8px 0; color: #475569; }
        .api-key { background: #1e293b; color: #10b981; font-family: monospace; padding: 15px; border-radius: 8px; word-break: break-all; margin: 20px 0; }
        .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 8px; color: #92400e; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1 style="color: #10b981; text-align: center;">🎉 Welcome!</h1>
        <div class="success">
          <h2 style="margin: 0;">Payment Confirmed</h2>
          <p style="margin: 10px 0 0 0;">Your account is now active</p>
        </div>
        <div class="details">
          <p><strong>Plan:</strong> ${details.accessType}</p>
          <p><strong>Daily Links:</strong> ${details.dailyLinkLimit} redirect links per day</p>
          <p><strong>Expires:</strong> ${details.expiryDate}</p>
        </div>
        <p style="color: #64748b; text-align: center;">Your API Key:</p>
        <div class="api-key">${details.apiKey}</div>
        <div class="warning">
          ⚠️ <strong>Important:</strong> Save your API key securely. You won't be able to see it again after closing this email.
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(to, subject, html, config);
}

/**
 * Core send email function using Mailgun API
 */
async function sendEmail(to, subject, html, config, fromEmail = null, fromName = null) {
  const mailgunConfig = getMailgunConfig(config);
  
  // Check if Mailgun is configured
  if (!mailgunConfig.mailgun_api_key || !mailgunConfig.mailgun_domain) {
    console.log('[EMAIL] Would send email to:', to);
    console.log('[EMAIL] Subject:', subject);
    console.log('[EMAIL] (Mailgun not configured - email not sent)');
    return { success: true, simulated: true };
  }

  try {
    const apiUrl = getMailgunApiUrl(mailgunConfig.mailgun_region);
    const domain = mailgunConfig.mailgun_domain;
    
    // Allow custom from email/name or use defaults
    const finalFromEmail = fromEmail || mailgunConfig.mailgun_from_email;
    const finalFromName = fromName || mailgunConfig.mailgun_from_name;
    
    // Create form data for Mailgun API
    const form = new FormData();
    form.append('from', `${finalFromName} <${finalFromEmail}>`);
    form.append('to', to);
    form.append('subject', subject);
    form.append('html', html);

    const response = await fetch(`${apiUrl}/${domain}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`api:${mailgunConfig.mailgun_api_key}`).toString('base64')}`,
        ...form.getHeaders()
      },
      body: form
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Mailgun API error');
    }

    console.log('[EMAIL] Sent via Mailgun to:', to, 'MessageId:', data.id);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('[EMAIL] Failed to send via Mailgun:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Generate 6-digit verification code
 */
export function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default {
  getMailgunConfig,
  sendVerificationEmail,
  sendPaymentConfirmationEmail,
  generateVerificationCode
};

