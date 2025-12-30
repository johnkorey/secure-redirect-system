/**
 * Stage 2: IP2Location Rules Validation
 * Performs IP-based validation using IP2Location API
 * 
 * ## Redirect Decision Logic
 * 
 * ### Usage Type
 * BOT: RSV, SES, DCH, CDN
 * VALID: MOB, ISP, LIB, EDU, MIL, GOV, ORG, COM
 * 
 * ### Ads Category
 * ads_category_name == "Data Centers" → BOT
 * 
 * ### Proxy / Threat Rules
 * If ANY is true → BOT:
 * - proxy_type == DCH (Data Center Hosting)
 * - is_vpn
 * - is_data_center
 * - is_public_proxy
 * - is_web_proxy
 * - is_web_crawler
 * - is_scanner
 * 
 * ### Special Overrides (HUMAN)
 * 1. is_consumer_privacy_network == true → HUMAN
 * 2. ISP contains "iCloud Private Relay" → HUMAN (Apple's privacy feature)
 * 3. proxy_type == "RES" (Residential) → HUMAN
 * 4. Residential proxy + ISP/MOB usage type → HUMAN (low trust)
 * 
 * ### NOT Used for Classification (stored for reference only)
 * - is_proxy: Too many false positives with residential ISPs
 * - fraud_score: Can cause false positives
 */

const IP2LOCATION_API_BASE = 'https://api.ip2location.io';

// Usage types that indicate BOT traffic
const BOT_USAGE_TYPES = ['RSV', 'SES', 'DCH', 'CDN'];

// Usage types that indicate VALID (human) traffic
const VALID_USAGE_TYPES = ['MOB', 'ISP', 'LIB', 'EDU', 'MIL', 'GOV', 'ORG', 'COM'];

/**
 * Fetch IP data from IP2Location API
 * @param {string} ip - IP address to lookup
 * @param {string} apiKey - IP2Location API key
 * @returns {Object} IP2Location data
 */
async function fetchIP2LocationData(ip, apiKey) {
  if (!apiKey) {
    console.warn('[IP2Location] API key not configured');
    return null;
  }

  try {
    const url = `${IP2LOCATION_API_BASE}/?key=${apiKey}&ip=${ip}&format=json`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`[IP2Location] API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    // Check for API errors
    if (data.error) {
      console.error('[IP2Location] API error:', data.error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('[IP2Location] Failed to fetch data:', error);
    return null;
  }
}

/**
 * Check for proxy/threat signals in IP data
 * @param {Object} ipData - IP2Location response data
 * @returns {Object} Proxy check results
 */
function checkProxySignals(ipData) {
  const signals = [];
  
  // NOTE: is_proxy is NOT used for classification (too many false positives)
  // It's stored in details for reference only
  
  // proxy_type == DCH check (Data Center Hosting)
  if (ipData.proxy_type && String(ipData.proxy_type).toUpperCase() === 'DCH') {
    signals.push('proxy_type:DCH');
  }
  
  if (ipData.is_vpn === true) {
    signals.push('is_vpn');
  }
  
  if (ipData.is_data_center === true) {
    signals.push('is_data_center');
  }
  
  if (ipData.is_public_proxy === true) {
    signals.push('is_public_proxy');
  }
  
  if (ipData.is_web_proxy === true) {
    signals.push('is_web_proxy');
  }
  
  if (ipData.is_web_crawler === true) {
    signals.push('is_web_crawler');
  }
  
  if (ipData.is_scanner === true) {
    signals.push('is_scanner');
  }
  
  return {
    hasSignals: signals.length > 0,
    signals
  };
}

/**
 * Validate IP using IP2Location rules
 * @param {string} ip - IP address to validate
 * @param {string} apiKey - IP2Location API key
 * @returns {Object} Validation result with classification and details
 */
export async function validateIP(ip, apiKey) {
  const result = {
    isValid: true,
    classification: 'HUMAN',
    trustLevel: 'high', // high, low
    reason: null,
    ipData: null,
    details: {
      country: null,
      region: null,
      city: null,
      isp: null,
      usageType: null,
      adsCategory: null,
      proxySignals: [],
      fraudScore: null,
      isConsumerPrivacyNetwork: false
    }
  };

  // Fetch IP2Location data
  const ipData = await fetchIP2LocationData(ip, apiKey);
  
  if (!ipData) {
    // If we can't fetch data, allow through but with low trust
    result.trustLevel = 'low';
    result.reason = 'IP_LOOKUP_FAILED';
    return result;
  }

  result.ipData = ipData;

  // Populate details
  result.details.country = ipData.country_name || ipData.country_code || null;
  result.details.region = ipData.region_name || null;
  result.details.city = ipData.city_name || null;
  result.details.isp = ipData.isp || ipData.as || null;
  result.details.usageType = ipData.usage_type || null;
  result.details.adsCategory = ipData.ads_category_name || ipData.ads_category || null;
  result.details.fraudScore = ipData.fraud_score ?? null;
  result.details.isConsumerPrivacyNetwork = ipData.is_consumer_privacy_network === true;

  // First, collect proxy signals (needed for fraud score decision)
  const proxyCheck = checkProxySignals(ipData);
  result.details.proxySignals = proxyCheck.signals;

  // === SPECIAL OVERRIDE: Consumer Privacy Network ===
  // If is_consumer_privacy_network is true, treat as HUMAN and override ALL other proxy findings
  if (ipData.is_consumer_privacy_network === true) {
    result.isValid = true;
    result.classification = 'HUMAN';
    result.trustLevel = 'high';
    result.reason = 'CONSUMER_PRIVACY_NETWORK_OVERRIDE';
    console.log(`[IP2Location] Consumer Privacy Network detected - treating as HUMAN (override)`);
    return result;
  }

  // === SPECIAL OVERRIDE: iCloud Private Relay ===
  // Apple's iCloud Private Relay is a consumer privacy feature for real Safari users
  // Always treat as HUMAN regardless of other signals (CDN, proxy, etc.)
  const ispName = (ipData.isp || ipData.as || '').toLowerCase();
  if (ispName.includes('icloud private relay') || ispName.includes('icloud-private-relay')) {
    result.isValid = true;
    result.classification = 'HUMAN';
    result.trustLevel = 'high';
    result.reason = 'ICLOUD_PRIVATE_RELAY_OVERRIDE';
    result.details.isPrivacyNetwork = true;
    console.log(`[IP2Location] iCloud Private Relay detected (ISP: ${ipData.isp}) - treating as HUMAN`);
    return result;
  }

  // === SPECIAL OVERRIDE: proxy_type == "RES" (Residential) ===
  // Residential proxies are typically real users on home networks
  // If proxy_type is RES, treat as HUMAN regardless of other signals
  const proxyType = (ipData.proxy_type || '').toUpperCase();
  if (proxyType === 'RES') {
    result.isValid = true;
    result.classification = 'HUMAN';
    result.trustLevel = 'high';
    result.reason = 'RESIDENTIAL_PROXY_TYPE_OVERRIDE';
    result.details.isProxy = true;
    result.details.proxyType = 'RES';
    console.log(`[IP2Location] proxy_type=RES (Residential) detected - treating as HUMAN`);
    return result;
  }

  // === SPECIAL OVERRIDE: Residential Proxy with ISP Usage Type ===
  // Starlink, mobile carriers, and other ISPs often get flagged as residential proxies
  // If usage_type is ISP/MOB and it's a residential proxy (not datacenter/VPN), treat as HUMAN
  const usageType = (ipData.usage_type || '').toUpperCase();
  const isResidentialProxy = ipData.is_residential_proxy === true || 
                             (ipData.proxy?.is_residential_proxy === true);
  const isISPorMobile = VALID_USAGE_TYPES.includes(usageType);
  
  if (isResidentialProxy && isISPorMobile && !ipData.is_data_center && !ipData.is_vpn) {
    result.isValid = true;
    result.classification = 'HUMAN';
    result.trustLevel = 'low';
    result.reason = 'RESIDENTIAL_PROXY_ISP_OVERRIDE';
    result.details.isProxy = true;
    console.log(`[IP2Location] Residential proxy with ISP usage type (${usageType}) - treating as HUMAN with low trust`);
    return result;
  }

  // === Rule 1: Usage Type Check ===
  // usageType already defined above
  if (BOT_USAGE_TYPES.includes(usageType)) {
    result.isValid = false;
    result.classification = 'BOT';
    result.reason = `BOT_USAGE_TYPE:${usageType}`;
    result.trustLevel = 'none';
    console.log(`[IP2Location] BOT usage type detected: ${usageType}`);
    return result;
  }

  // === Rule 2: Ads Category Check ===
  const adsCategory = (ipData.ads_category_name || ipData.ads_category || '').toLowerCase();
  
  if (adsCategory === 'data centers') {
    result.isValid = false;
    result.classification = 'BOT';
    result.reason = 'DATA_CENTER_ADS_CATEGORY';
    result.trustLevel = 'none';
    console.log(`[IP2Location] Data Center ads category detected`);
    return result;
  }

  // === Rule 3: Proxy / Threat Rules ===
  // If ANY proxy signal is true → BOT
  // NOTE: fraud_score is NOT used for classification (removed per user request)
  if (proxyCheck.hasSignals) {
    result.isValid = false;
    result.classification = 'BOT';
    result.reason = 'PROXY_THREAT_DETECTED';
    result.trustLevel = 'none';
    console.log(`[IP2Location] Proxy/threat signals detected: ${proxyCheck.signals.join(', ')}`);
    return result;
  }

  // All checks passed - valid human traffic
  result.reason = 'ALL_CHECKS_PASSED';
  console.log(`[IP2Location] All checks passed - HUMAN with high trust`);
  return result;
}

/**
 * Check if an IP is private/internal
 * @param {string} ip - IP address
 * @returns {boolean}
 */
function isPrivateIPAddress(ip) {
  if (!ip) return false;
  // Clean IPv6-mapped IPv4 addresses
  const cleanIP = ip.replace(/^::ffff:/, '');
  const parts = cleanIP.split('.');
  if (parts.length !== 4) return false;
  const [a, b] = parts.map(Number);
  
  // Private ranges: 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 127.x.x.x
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  
  return false;
}

/**
 * Get client IP from request
 * Handles various proxy headers and skips private IPs
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
export function getClientIP(req) {
  // Priority 1: Cloudflare (most reliable when using CF)
  const cfConnectingIP = req.headers['cf-connecting-ip'];
  if (cfConnectingIP && !isPrivateIPAddress(cfConnectingIP)) {
    return cfConnectingIP;
  }

  // Priority 2: True-Client-IP (Akamai/Cloudflare Enterprise)
  const trueClientIP = req.headers['true-client-ip'];
  if (trueClientIP && !isPrivateIPAddress(trueClientIP)) {
    return trueClientIP;
  }

  // Priority 3: X-Real-IP
  const realIP = req.headers['x-real-ip'];
  if (realIP && !isPrivateIPAddress(realIP)) {
    return realIP;
  }

  // Priority 4: X-Forwarded-For - find first PUBLIC IP
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map(ip => ip.trim().replace(/^::ffff:/, ''));
    // Find the first non-private IP (the real client)
    for (const ip of ips) {
      if (!isPrivateIPAddress(ip)) {
        return ip;
      }
    }
    // If all are private, return the first one anyway
    return ips[0];
  }

  // Priority 5: Zeabur specific headers
  const zeaburClientIP = req.headers['x-zeabur-client-ip'] || req.headers['x-envoy-external-address'];
  if (zeaburClientIP && !isPrivateIPAddress(zeaburClientIP)) {
    return zeaburClientIP;
  }

  // Fallback to connection remote address
  const remoteAddr = req.connection?.remoteAddress || 
                     req.socket?.remoteAddress || 
                     req.ip ||
                     'unknown';
  
  // Clean IPv6-mapped IPv4
  return remoteAddr.replace(/^::ffff:/, '');
}

export default {
  validateIP,
  getClientIP
};
