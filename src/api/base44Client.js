/**
 * Backend API Client - Full SaaS API
 */

// ALWAYS use relative URLs (empty string) in production build
// Backend serves both frontend and API on same port, so relative URLs work everywhere
const BACKEND_URL = '';

// Debug logging
console.log('[DEBUG base44Client] BACKEND_URL set to empty (relative URLs)', 'hostname:', window.location.hostname, 'origin:', window.location.origin, 'PROD:', import.meta.env.PROD);

function getToken() {
  return localStorage.getItem('token');
}

async function apiFetch(endpoint, options = {}) {
  const url = `${BACKEND_URL}${endpoint}`;
  console.log('[DEBUG apiFetch] BACKEND_URL:', BACKEND_URL, 'endpoint:', endpoint, 'final URL:', url, 'window.location.origin:', window.location.origin);
  const token = getToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  console.log('[DEBUG apiFetch] About to fetch:', url);
  const response = await fetch(url, { ...options, headers });
  console.log('[DEBUG apiFetch] Response received from:', response.url, 'status:', response.status);

  if (response.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/user/login';
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'API request failed');
  }

  if (response.status === 204) return null;
  return response.json();
}

// Helper for CRUD operations
function createCrudEntity(basePath) {
  return {
    list: (sortBy, limit) => apiFetch(`${basePath}${limit ? `?limit=${limit}` : ''}`),
    filter: (filters) => apiFetch(basePath).then(items => 
      items.filter(item => Object.entries(filters).every(([k, v]) => item[k] === v))
    ),
    get: (id) => apiFetch(`${basePath}/${id}`),
    create: (data) => apiFetch(basePath, { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiFetch(`${basePath}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiFetch(`${basePath}/${id}`, { method: 'DELETE' }),
  };
}

// Entity definitions
const Redirect = createCrudEntity('/api/redirects');
const VisitorLog = {
  ...createCrudEntity('/api/visitors'),
  list: (sortBy, timeRange = '7d') => apiFetch(`/api/visitors?timeRange=${timeRange}`),
  listByTimeRange: (timeRange = '7d') => apiFetch(`/api/visitors?timeRange=${timeRange}`),
};
const APIUser = createCrudEntity('/api/api-users');
const Payment = {
  ...createCrudEntity('/api/payments'),
  list: () => apiFetch('/api/payments'),
};
const Announcement = createCrudEntity('/api/announcements');
const ForumMessage = {
  ...createCrudEntity('/api/forum-messages'),
  list: (sortBy, limit = 100) => apiFetch(`/api/forum-messages?limit=${limit}`),
};
const IPRange = createCrudEntity('/api/ip-ranges');
const ISPConfig = createCrudEntity('/api/isp-config');
const UserAgentPattern = createCrudEntity('/api/user-agent-patterns');
const HostedLink = createCrudEntity('/api/hosted-links');

const RealtimeEvent = {
  list: (sortBy, limit = 50) => apiFetch(`/api/realtime-events?limit=${limit}`),
};

const SystemConfig = {
  // Key-value config store
  list: () => apiFetch('/api/system-configs'),
  create: (data) => apiFetch('/api/system-configs', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiFetch(`/api/system-configs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiFetch(`/api/system-configs/${id}`, { method: 'DELETE' }),
  filter: () => apiFetch('/api/system-configs'),
  // Legacy system config object
  getLegacy: () => apiFetch('/api/system-config'),
  updateLegacy: (data) => apiFetch('/api/system-config', { method: 'PUT', body: JSON.stringify(data) }),
};

const Stats = {
  get: () => apiFetch('/api/stats'),
};

const UserProfile = {
  get: () => apiFetch('/api/user/profile'),
  update: (data) => apiFetch('/api/user/profile', { method: 'PUT', body: JSON.stringify(data) }),
};

const UserMetrics = {
  get: (hours = 24) => apiFetch(`/api/user/metrics?hours=${hours}`),
  trends: () => apiFetch('/api/user/trends'),
  recentActivity: (limit = 50, visitorType = 'all') => 
    apiFetch(`/api/user/recent-activity?limit=${limit}&visitorType=${visitorType}`),
};

const RedirectConfig = {
  get: () => apiFetch('/api/user/redirect-config'),
  update: (data) => apiFetch('/api/user/redirect-config', { method: 'POST', body: JSON.stringify(data) }),
};

// Export in compatible format
export const base44 = {
  entities: {
    Redirect,
    VisitorLog,
    APIUser,
    Payment,
    Announcement,
    ForumMessage,
    IPRange,
    ISPConfig,
    UserAgentPattern,
    HostedLink,
    RealtimeEvent,
    SystemConfig,
    Stats,
    UserProfile,
    UserMetrics,
    RedirectConfig,
  },
  auth: {
    me: () => apiFetch('/api/auth/me'),
    isLoggedIn: () => !!getToken(),
    logout: () => {
      localStorage.removeItem('token');
      window.location.href = '/user/login';
    },
  },
};

export default base44;
