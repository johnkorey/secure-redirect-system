import UAParser from 'ua-parser-js';

/**
 * Stage 1: Local User-Agent Validation
 * Performs local validation without any API calls
 * 
 * ## Redirect Decision Logic
 * 
 * Block immediately if:
 * - No User-Agent
 * - Unknown browser
 * - Unknown device
 * - Headless or generic agent
 * 
 * If failed → BOT
 */

// Known valid browsers
const VALID_BROWSERS = [
  'chrome', 'firefox', 'safari', 'edge', 'opera', 'samsung', 
  'uc browser', 'vivaldi', 'brave', 'chromium', 'mobile safari',
  'chrome mobile', 'firefox mobile', 'opera mobile', 'ie', 'internet explorer',
  'android browser', 'silk', 'yandex', 'whale', 'puffin', 'qq browser',
  'miui browser', 'huawei browser'
];

// Known valid device types
const VALID_DEVICE_TYPES = ['mobile', 'tablet', 'desktop', 'smarttv', 'wearable', 'console'];

// Headless browser signatures - Block immediately
const HEADLESS_SIGNATURES = [
  'headless',
  'phantom',
  'selenium',
  'puppeteer',
  'playwright',
  'webdriver',
  'nightwatch',
  'cypress',
  'chromedriver',
  'geckodriver'
];

// Generic/bot agent signatures - Block immediately
const GENERIC_BOT_SIGNATURES = [
  'bot',
  'crawler',
  'spider',
  'scraper',
  'wget',
  'curl',
  'fetch',
  'http-client',
  'python',
  'java/',
  'go-http',
  'node-fetch',
  'axios',
  'request',
  'libwww',
  'lwp',
  'okhttp',
  'httpunit',
  'nutch',
  'linkchecker',
  'httrack',
  'apache-httpclient'
];

// Social media preview bots - comprehensive patterns
const SOCIAL_PREVIEW_BOTS = [
  // Meta/Facebook family (includes WhatsApp)
  'facebookexternalhit',
  'facebookcatalog',
  'facebot',
  'whatsapp',              // WhatsApp/2.x.x
  'wa.me',                 // WhatsApp short links
  // Telegram
  'telegrambot',
  'telegram',              // Some Telegram crawlers
  // Twitter/X
  'twitterbot',
  'twitter',
  // LinkedIn
  'linkedinbot',
  'linkedin',
  // Slack
  'slackbot',
  'slack-imgproxy',
  'slack',
  // Discord
  'discordbot',
  'discord',
  // Other social platforms
  'pinterest',
  'pinterestbot',
  'skypeuripreview',
  'skype',
  'viber',
  'line',                  // LINE messenger
  'kakaotalk',             // KakaoTalk
  'snapchat',
  'instagram',
  'embedly',
  'quora link preview',
  'redditbot',
  'vkshare',               // VK
  'w3c_validator',
  'baidushare',
  'getlinkinfo',
  'linkpreview',
  'preview',               // Generic preview crawlers
  'urlpreview'
];

// Search engine bots
const SEARCH_ENGINE_BOTS = [
  'googlebot',
  'bingbot',
  'yandex',
  'baiduspider',
  'duckduckbot',
  'sogou',
  'exabot',
  'facebot',
  'ia_archiver',
  'msnbot',
  'slurp',
  'teoma',
  'gigabot',
  'ahrefsbot',
  'semrushbot',
  'dotbot',
  'rogerbot',
  'screaming frog'
];

/**
 * Validate User-Agent string (Stage 1)
 * @param {string} userAgent - The User-Agent string to validate
 * @returns {Object} Validation result with classification and details
 */
export function validateUserAgent(userAgent) {
  const result = {
    isValid: true,
    classification: 'HUMAN',
    reason: null,
    details: {
      browser: null,
      browserVersion: null,
      os: null,
      osVersion: null,
      device: null,
      deviceType: null,
      isHeadless: false,
      isBot: false,
      botType: null
    }
  };

  // === Check 1: No User-Agent ===
  if (!userAgent || userAgent.trim() === '') {
    result.isValid = false;
    result.classification = 'BOT';
    result.reason = 'NO_USER_AGENT';
    console.log('[Stage1] BOT: No User-Agent provided');
    return result;
  }

  const uaLower = userAgent.toLowerCase();

  // === Check 2: Headless browser detection ===
  for (const signature of HEADLESS_SIGNATURES) {
    if (uaLower.includes(signature)) {
      result.isValid = false;
      result.classification = 'BOT';
      result.reason = 'HEADLESS_BROWSER';
      result.details.isHeadless = true;
      console.log(`[Stage1] BOT: Headless browser detected (${signature})`);
      return result;
    }
  }

  // === Check 3: Generic bot/agent detection ===
  for (const signature of GENERIC_BOT_SIGNATURES) {
    if (uaLower.includes(signature)) {
      result.isValid = false;
      result.classification = 'BOT';
      result.reason = 'GENERIC_BOT_AGENT';
      result.details.isBot = true;
      result.details.botType = 'generic';
      console.log(`[Stage1] BOT: Generic bot agent detected (${signature})`);
      return result;
    }
  }

  // === Check 4: Social preview bots ===
  for (const signature of SOCIAL_PREVIEW_BOTS) {
    if (uaLower.includes(signature)) {
      result.isValid = false;
      result.classification = 'BOT';
      result.reason = 'SOCIAL_PREVIEW_BOT';
      result.details.isBot = true;
      result.details.botType = 'social_preview';
      console.log(`[Stage1] BOT: Social preview bot detected (${signature})`);
      return result;
    }
  }

  // === Check 5: Search engine bots ===
  for (const signature of SEARCH_ENGINE_BOTS) {
    if (uaLower.includes(signature)) {
      result.isValid = false;
      result.classification = 'BOT';
      result.reason = 'SEARCH_ENGINE_BOT';
      result.details.isBot = true;
      result.details.botType = 'search_engine';
      console.log(`[Stage1] BOT: Search engine bot detected (${signature})`);
      return result;
    }
  }

  // Parse User-Agent for browser/device info
  const parser = new UAParser(userAgent);
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();

  result.details.browser = browser.name || null;
  result.details.browserVersion = browser.version || null;
  result.details.os = os.name || null;
  result.details.osVersion = os.version || null;
  result.details.device = device.model || null;
  result.details.deviceType = device.type || 'desktop'; // default to desktop if not mobile/tablet

  // === Check 6: Unknown browser ===
  const browserName = (browser.name || '').toLowerCase();
  const isKnownBrowser = VALID_BROWSERS.some(b => browserName.includes(b));
  
  if (!browser.name || !isKnownBrowser) {
    // Additional check: some valid User-Agents might not have browser name
    // but have valid OS and don't have bot signatures
    const hasValidOS = os.name && ['windows', 'macos', 'mac os', 'linux', 'android', 'ios', 'ubuntu', 'debian', 'chrome os'].some(
      validOS => (os.name || '').toLowerCase().includes(validOS)
    );
    
    if (!hasValidOS) {
      result.isValid = false;
      result.classification = 'BOT';
      result.reason = 'UNKNOWN_BROWSER';
      console.log(`[Stage1] BOT: Unknown browser (${browser.name || 'none'})`);
      return result;
    }
  }

  // === Check 7: Unknown device type ===
  // device.type can be undefined for desktop browsers, which is valid
  if (device.type && !VALID_DEVICE_TYPES.includes(device.type.toLowerCase())) {
    result.isValid = false;
    result.classification = 'BOT';
    result.reason = 'UNKNOWN_DEVICE';
    console.log(`[Stage1] BOT: Unknown device type (${device.type})`);
    return result;
  }

  console.log(`[Stage1] PASSED: Browser=${browser.name || 'unknown'}, Device=${device.type || 'desktop'}`);
  return result;
}

/**
 * Parse browser and device information from User-Agent
 * @param {string} userAgent - The User-Agent string
 * @returns {Object} Parsed browser and device info
 */
export function parseUserAgentDetails(userAgent) {
  if (!userAgent) {
    return {
      browser: 'Unknown',
      browserVersion: null,
      os: 'Unknown',
      osVersion: null,
      device: 'Unknown',
      deviceType: 'Unknown'
    };
  }

  const parser = new UAParser(userAgent);
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();

  return {
    browser: browser.name || 'Unknown',
    browserVersion: browser.version || null,
    os: os.name || 'Unknown',
    osVersion: os.version || null,
    device: device.model || (device.type ? device.type : 'Desktop'),
    deviceType: device.type || 'desktop'
  };
}

export default {
  validateUserAgent,
  parseUserAgentDetails
};
