/**
 * Main System API Client
 * Communicates with the main Secure Redirect System
 */

const API_URL = process.env.MAIN_API_URL;
const API_KEY = process.env.COMPANION_API_KEY;

/**
 * Fetch redirect configuration from main system
 * @param {string} publicId - Public redirect ID
 * @returns {Promise<object>} - Redirect configuration
 * @throws {Error} - If redirect not found or API error
 */
export async function getRedirectConfig(publicId) {
  try {
    const response = await fetch(`${API_URL}/public/redirect/${publicId}`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('REDIRECT_NOT_FOUND');
      }
      if (response.status === 410) {
        throw new Error('REDIRECT_INACTIVE');
      }
      throw new Error('API_ERROR');
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Main API] Get redirect config error:', error);
    throw error;
  }
}

/**
 * Classify visitor as human or bot
 * @param {string} ip - Visitor IP address
 * @param {string} userAgent - Visitor user agent
 * @returns {Promise<object>} - Classification result
 */
export async function classifyVisitor(ip, userAgent) {
  try {
    const response = await fetch(`${API_URL}/public/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Companion-Key': API_KEY
      },
      body: JSON.stringify({ ip, userAgent })
    });
    
    if (!response.ok) {
      console.error('[Main API] Classification API error:', response.status);
      // Default to human on error (safer)
      return { 
        classification: 'human', 
        confidence: 0.5, 
        reason: 'API error - default to human' 
      };
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Main API] Classification error:', error);
    // Default to human on error
    return { 
      classification: 'human', 
      confidence: 0.5, 
      reason: 'Error - default to human' 
    };
  }
}

/**
 * Log visit to main system
 * @param {object} data - Visit data
 * @returns {Promise<object>} - Log result
 */
export async function logVisit(data) {
  try {
    const response = await fetch(`${API_URL}/public/log-visit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Companion-Key': API_KEY
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      console.error('[Main API] Log visit API error:', response.status);
      return { success: false };
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Main API] Log visit error:', error);
    return { success: false };
  }
}

