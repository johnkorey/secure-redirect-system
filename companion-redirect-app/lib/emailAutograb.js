/**
 * Email Autograb Utilities
 * Extracts and manipulates email addresses in URLs
 */

/**
 * Extract emails from URL using various formats
 * Supports: ?email=, $email, *email, #email=, and base64-encoded emails
 * @param {string} url - Full URL string
 * @returns {string[]} - Array of extracted email addresses
 */
export function extractEmailsFromURL(url) {
  const emails = [];
  const decodedUrl = decodeURIComponent(url);
  
  // Pattern 1: ?email=test@example.com or &email=test@example.com
  const queryPattern = /[?&]email=([^&\s]+@[^&\s]+\.[^&\s]+)/gi;
  let match;
  while ((match = queryPattern.exec(decodedUrl)) !== null) {
    emails.push(match[1]);
  }
  
  // Pattern 2: $email@domain.com or *email@domain.com
  const separatorPattern = /[\$\*]([^\s\/\?&#]+@[^\s\/\?&#]+\.[^\s\/\?&#]+)/gi;
  while ((match = separatorPattern.exec(decodedUrl)) !== null) {
    emails.push(match[1]);
  }
  
  // Pattern 3: #email=test@example.com
  const hashPattern = /#email=([^\s&]+@[^\s&]+\.[^\s&]+)/gi;
  while ((match = hashPattern.exec(decodedUrl)) !== null) {
    emails.push(match[1]);
  }
  
  // Pattern 4: Base64-encoded emails after separators ($, *, ?, &, #)
  // Base64 pattern: alphanumeric + / + = (padding)
  const base64Pattern = /[\$\*\?&#]([A-Za-z0-9+/]{20,}={0,2})/g;
  let base64Match;
  
  while ((base64Match = base64Pattern.exec(decodedUrl)) !== null) {
    const base64String = base64Match[1];
    try {
      // Decode base64 (works in Node.js environment)
      const decoded = Buffer.from(base64String, 'base64').toString('utf-8');
      
      // Check if decoded string contains a valid email
      const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
      const decodedEmails = decoded.match(emailRegex);
      if (decodedEmails) {
        emails.push(...decodedEmails);
        console.log(`[EMAIL-AUTOGRAB] Decoded base64: ${base64String} -> ${decodedEmails[0]}`);
      }
    } catch (e) {
      // Not valid base64 or doesn't contain email, skip
    }
  }
  
  // Remove duplicates
  return [...new Set(emails)];
}

/**
 * Extract parameters after redirect ID
 * @param {string} fullPath - Full URL path
 * @param {string} redirectId - The redirect ID
 * @returns {string} - Parameters string after redirect ID
 */
export function extractParametersAfterRedirectId(fullPath, redirectId) {
  const idIndex = fullPath.indexOf(redirectId);
  if (idIndex === -1) return '';
  
  const afterId = fullPath.substring(idIndex + redirectId.length);
  return afterId;
}

/**
 * Strip email parameters from URL string
 * @param {string} params - Parameters string
 * @returns {string} - Parameters with email addresses removed
 */
export function stripEmailsFromParams(params) {
  let cleaned = params;
  
  // Remove ?email=, &email=, #email=
  cleaned = cleaned.replace(/[?&#]email=[^&\s]*/gi, '');
  
  // Remove $email or *email patterns
  cleaned = cleaned.replace(/[\$\*][^\s\/\?&#]+@[^\s\/\?&#]+\.[^\s\/\?&#]+/gi, '');
  
  // Clean up double ampersands
  cleaned = cleaned.replace(/&&+/g, '&');
  
  // Remove leading & or ?
  cleaned = cleaned.replace(/^[&?]+/, '');
  
  return cleaned;
}

/**
 * Append parameters to destination URL
 * Handles trailing slashes to prevent @ misinterpretation
 * @param {string} destinationUrl - Base destination URL
 * @param {string} parameters - Parameters to append
 * @returns {string} - Complete URL with parameters
 */
export function appendParametersToURL(destinationUrl, parameters) {
  if (!parameters) return destinationUrl;
  
  let url = destinationUrl;
  
  // Add trailing slash if needed to prevent @ misinterpretation as username
  if (!url.endsWith('/') && parameters.includes('@')) {
    url += '/';
  }
  
  // If parameters start with special chars, append directly
  if (parameters.startsWith('?') || parameters.startsWith('#') || 
      parameters.startsWith('$') || parameters.startsWith('*')) {
    return url + parameters;
  }
  
  // Otherwise add ? if URL doesn't have query params
  const separator = url.includes('?') ? '&' : '?';
  return url + separator + parameters;
}

