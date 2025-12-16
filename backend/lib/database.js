/**
 * JSON File-based Database Module
 * Provides persistent storage using JSON files
 * No native compilation required - works on all platforms
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Default database structure
const defaultData = {
  users: {},
  apiUsers: {},
  redirects: {},
  hostedLinks: {},
  visitorLogs: [],
  realtimeEvents: [],
  payments: {},
  announcements: {},
  forumMessages: [],
  systemConfigs: {},
  signupSessions: {},
  domains: {},
  capturedEmails: [],
  ipRanges: {},
  ispConfigs: {},
  userAgentPatterns: {}
};

// Load or initialize database
let data = defaultData;

function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
      data = { ...defaultData, ...JSON.parse(fileContent) };
      console.log('[DATABASE] Loaded from', DB_FILE);
    } else {
      saveDatabase();
      console.log('[DATABASE] Created new database at', DB_FILE);
    }
  } catch (error) {
    console.error('[DATABASE] Error loading database:', error);
    data = defaultData;
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[DATABASE] Error saving database:', error);
  }
}

// Debounced save to avoid too many writes
let saveTimeout = null;
function debouncedSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveDatabase, 100);
}

// Initialize database
loadDatabase();

// ==========================================
// Map-like wrapper for object storage
// ==========================================
function createStore(storeName) {
  return {
    get: (key) => data[storeName][key],
    set: (key, value) => {
      data[storeName][key] = value;
      debouncedSave();
    },
    has: (key) => key in data[storeName],
    delete: (key) => {
      delete data[storeName][key];
      debouncedSave();
    },
    values: () => Object.values(data[storeName]),
    keys: () => Object.keys(data[storeName]),
    entries: () => Object.entries(data[storeName]),
    get size() {
      return Object.keys(data[storeName]).length;
    },
    // Additional helper methods
    findByEmail: (email) => {
      return Object.values(data[storeName]).find(item => 
        item.email?.toLowerCase() === email?.toLowerCase()
      );
    },
    findById: (id) => data[storeName][id],
    list: () => Object.values(data[storeName]),
    create: (item) => {
      if (!item.id) throw new Error('Item must have an id');
      data[storeName][item.id] = item;
      debouncedSave();
      return item;
    },
    update: (id, updates) => {
      if (data[storeName][id]) {
        data[storeName][id] = { ...data[storeName][id], ...updates };
        debouncedSave();
        return data[storeName][id];
      }
      return null;
    }
  };
}

// ==========================================
// Array-like wrapper for array storage
// ==========================================
function createArrayStore(storeName, maxSize = 10000, retentionDays = null) {
  
  // Cleanup old data based on retention period
  const cleanupOldData = () => {
    if (retentionDays && data[storeName].length > 0) {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const beforeCount = data[storeName].length;
      
      data[storeName] = data[storeName].filter(item => {
        const itemDate = new Date(item.created_date || item.captured_at || item.timestamp || 0);
        return itemDate >= cutoffDate;
      });
      
      const removed = beforeCount - data[storeName].length;
      if (removed > 0) {
        console.log(`[DATABASE] Cleaned up ${removed} old entries from ${storeName} (older than ${retentionDays} days)`);
        debouncedSave();
      }
    }
  };
  
  return {
    push: (item) => {
      data[storeName].push(item);
      // Trim if too large (fallback safety)
      if (data[storeName].length > maxSize) {
        data[storeName] = data[storeName].slice(-maxSize);
      }
      debouncedSave();
      return item;
    },
    filter: (fn) => data[storeName].filter(fn),
    find: (fn) => data[storeName].find(fn),
    map: (fn) => data[storeName].map(fn),
    getAll: () => [...data[storeName]],
    get length() {
      return data[storeName].length;
    },
    shift: () => {
      const item = data[storeName].shift();
      debouncedSave();
      return item;
    },
    slice: (start, end) => data[storeName].slice(start, end),
    // Additional helpers
    list: (limit = 10000) => data[storeName].slice(-limit).reverse(),
    create: (item) => {
      data[storeName].push(item);
      if (data[storeName].length > maxSize) {
        data[storeName] = data[storeName].slice(-maxSize);
      }
      debouncedSave();
      return item;
    },
    count: () => data[storeName].length,
    countByField: (field, value) => {
      return data[storeName].filter(item => item[field] === value).length;
    },
    cleanup: cleanupOldData,
    getRetentionDays: () => retentionDays
  };
}

// ==========================================
// Create stores
// ==========================================
export const users = createStore('users');
export const apiUsers = createStore('apiUsers');
export const redirects = createStore('redirects');
export const payments = createStore('payments');
export const announcements = createStore('announcements');
export const systemConfigs = {
  ...createStore('systemConfigs'),
  getValue: (key, defaultValue = '') => {
    const config = Object.values(data.systemConfigs).find(c => c.config_key === key);
    return config?.config_value || defaultValue;
  },
  findByKey: (key) => {
    return Object.values(data.systemConfigs).find(c => c.config_key === key);
  }
};
export const signupSessions = createStore('signupSessions');
export const domains = createStore('domains');
export const ipRanges = createStore('ipRanges');
export const ispConfigs = createStore('ispConfigs');
export const userAgentPatterns = createStore('userAgentPatterns');
export const hostedLinks = createStore('hostedLinks');

// 7-day retention for visitor logs (max 500k as safety limit)
export const visitorLogs = {
  ...createArrayStore('visitorLogs', 500000, 7),
  countByClassification: (classification) => {
    return data.visitorLogs.filter(l => l.classification === classification).length;
  }
};

// 7-day retention for realtime events (max 100k as safety limit)
export const realtimeEvents = createArrayStore('realtimeEvents', 100000, 7);

// 30-day retention for forum messages
export const forumMessages = createArrayStore('forumMessages', 50000, 30);

// 90-day retention for captured emails (max 500k as safety limit)
export const capturedEmails = createArrayStore('capturedEmails', 500000, 90);

// ==========================================
// Stats helpers
// ==========================================
export const stats = {
  getTotalRequests: () => data.visitorLogs.length,
  getTotalHumans: () => data.visitorLogs.filter(l => l.classification === 'HUMAN').length,
  getTotalBots: () => data.visitorLogs.filter(l => l.classification === 'BOT').length,
  getApiUserCount: () => Object.keys(data.apiUsers).length,
  getRedirectCount: () => Object.keys(data.redirects).length
};

// ==========================================
// Utility functions
// ==========================================
export function forceSave() {
  saveDatabase();
}

export function reload() {
  loadDatabase();
}

// ==========================================
// Scheduled cleanup for time-based retention
// ==========================================
function runScheduledCleanup() {
  console.log('[DATABASE] Running scheduled cleanup...');
  visitorLogs.cleanup();
  realtimeEvents.cleanup();
  forumMessages.cleanup();
  capturedEmails.cleanup();
  console.log('[DATABASE] Cleanup complete. Current counts:');
  console.log(`  - visitorLogs: ${visitorLogs.length}`);
  console.log(`  - realtimeEvents: ${realtimeEvents.length}`);
  console.log(`  - forumMessages: ${forumMessages.length}`);
  console.log(`  - capturedEmails: ${capturedEmails.length}`);
}

// Run cleanup on startup
setTimeout(runScheduledCleanup, 5000);

// Run cleanup every 6 hours
setInterval(runScheduledCleanup, 6 * 60 * 60 * 1000);

// Export default with all stores
export default {
  users,
  apiUsers,
  redirects,
  hostedLinks,
  visitorLogs,
  realtimeEvents,
  payments,
  announcements,
  forumMessages,
  systemConfigs,
  signupSessions,
  domains,
  capturedEmails,
  ipRanges,
  ispConfigs,
  userAgentPatterns,
  stats,
  forceSave,
  reload,
  runScheduledCleanup
};

console.log('[DATABASE] JSON file storage initialized with 7-day retention for logs');
