/**
 * Mailgun Management Service
 * Handles domain management and Mailgun API operations
 */

/**
 * Get Mailgun API configuration
 */
function getMailgunApiConfig(systemConfigs) {
  const getConfig = (key) => {
    const config = Array.from(systemConfigs.values()).find(c => c.config_key === key);
    return config?.config_value || '';
  };

  const apiKey = getConfig('mailgun_api_key') || process.env.MAILGUN_API_KEY || '';
  const region = getConfig('mailgun_region') || 'us';
  
  return {
    apiKey,
    region,
    baseUrl: region === 'eu' ? 'https://api.eu.mailgun.net/v3' : 'https://api.mailgun.net/v3'
  };
}

/**
 * Make authenticated request to Mailgun API
 */
async function mailgunRequest(endpoint, method = 'GET', body = null, apiKey, baseUrl) {
  const options = {
    method,
    headers: {
      'Authorization': `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
      'Content-Type': 'application/json'
    }
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const url = `${baseUrl}${endpoint}`;
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Mailgun API error: ${response.status}`);
  }

  return data;
}

/**
 * List all domains
 */
export async function listDomains(systemConfigs) {
  const { apiKey, baseUrl } = getMailgunApiConfig(systemConfigs);
  
  if (!apiKey) {
    throw new Error('Mailgun API key not configured');
  }

  return await mailgunRequest('/domains', 'GET', null, apiKey, baseUrl);
}

/**
 * Get domain details
 */
export async function getDomain(domainName, systemConfigs) {
  const { apiKey, baseUrl } = getMailgunApiConfig(systemConfigs);
  
  if (!apiKey) {
    throw new Error('Mailgun API key not configured');
  }

  return await mailgunRequest(`/domains/${domainName}`, 'GET', null, apiKey, baseUrl);
}

/**
 * Add a new domain
 */
export async function addDomain(domainName, systemConfigs, options = {}) {
  const { apiKey, baseUrl } = getMailgunApiConfig(systemConfigs);
  
  if (!apiKey) {
    throw new Error('Mailgun API key not configured');
  }

  // Use form-urlencoded for domain creation
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('name', domainName);
  
  if (options.spam_action) {
    form.append('spam_action', options.spam_action); // disabled, block, or tag
  }
  
  if (options.wildcard !== undefined) {
    form.append('wildcard', options.wildcard ? 'true' : 'false');
  }

  if (options.force_dkim_authority !== undefined) {
    form.append('force_dkim_authority', options.force_dkim_authority ? 'true' : 'false');
  }

  if (options.dkim_key_size) {
    form.append('dkim_key_size', options.dkim_key_size); // 1024 or 2048
  }

  if (options.web_scheme) {
    form.append('web_scheme', options.web_scheme); // http or https
  }

  const response = await fetch(`${baseUrl}/domains`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
      ...form.getHeaders()
    },
    body: form
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Failed to add domain: ${response.status}`);
  }

  return data;
}

/**
 * Delete a domain
 */
export async function deleteDomain(domainName, systemConfigs) {
  const { apiKey, baseUrl } = getMailgunApiConfig(systemConfigs);
  
  if (!apiKey) {
    throw new Error('Mailgun API key not configured');
  }

  const response = await fetch(`${baseUrl}/domains/${domainName}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Failed to delete domain: ${response.status}`);
  }

  return data;
}

/**
 * Verify domain
 */
export async function verifyDomain(domainName, systemConfigs) {
  const { apiKey, baseUrl } = getMailgunApiConfig(systemConfigs);
  
  if (!apiKey) {
    throw new Error('Mailgun API key not configured');
  }

  const response = await fetch(`${baseUrl}/domains/${domainName}/verify`, {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Failed to verify domain: ${response.status}`);
  }

  return data;
}

/**
 * Get domain connection settings (SMTP credentials)
 */
export async function getDomainConnection(domainName, systemConfigs) {
  const { apiKey, baseUrl } = getMailgunApiConfig(systemConfigs);
  
  if (!apiKey) {
    throw new Error('Mailgun API key not configured');
  }

  return await mailgunRequest(`/domains/${domainName}/connection`, 'GET', null, apiKey, baseUrl);
}

/**
 * Update domain connection settings
 */
export async function updateDomainConnection(domainName, settings, systemConfigs) {
  const { apiKey, baseUrl } = getMailgunApiConfig(systemConfigs);
  
  if (!apiKey) {
    throw new Error('Mailgun API key not configured');
  }

  const FormData = (await import('form-data')).default;
  const form = new FormData();
  
  if (settings.require_tls !== undefined) {
    form.append('require_tls', settings.require_tls ? 'true' : 'false');
  }
  
  if (settings.skip_verification !== undefined) {
    form.append('skip_verification', settings.skip_verification ? 'true' : 'false');
  }

  const response = await fetch(`${baseUrl}/domains/${domainName}/connection`, {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
      ...form.getHeaders()
    },
    body: form
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Failed to update connection: ${response.status}`);
  }

  return data;
}

/**
 * Get domain tracking settings
 */
export async function getTrackingSettings(domainName, systemConfigs) {
  const { apiKey, baseUrl } = getMailgunApiConfig(systemConfigs);
  
  if (!apiKey) {
    throw new Error('Mailgun API key not configured');
  }

  return await mailgunRequest(`/domains/${domainName}/tracking`, 'GET', null, apiKey, baseUrl);
}

/**
 * Update domain tracking settings
 */
export async function updateTrackingSettings(domainName, settings, systemConfigs) {
  const { apiKey, baseUrl } = getMailgunApiConfig(systemConfigs);
  
  if (!apiKey) {
    throw new Error('Mailgun API key not configured');
  }

  const FormData = (await import('form-data')).default;
  const form = new FormData();
  
  if (settings.open !== undefined) {
    form.append('open', settings.open ? 'yes' : 'no');
  }
  
  if (settings.click !== undefined) {
    form.append('click', settings.click ? 'yes' : 'no');
  }
  
  if (settings.unsubscribe !== undefined) {
    form.append('unsubscribe', settings.unsubscribe ? 'yes' : 'no');
  }

  const response = await fetch(`${baseUrl}/domains/${domainName}/tracking`, {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
      ...form.getHeaders()
    },
    body: form
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Failed to update tracking: ${response.status}`);
  }

  return data;
}

/**
 * Get account info
 */
export async function getAccountInfo(systemConfigs) {
  const { apiKey, baseUrl } = getMailgunApiConfig(systemConfigs);
  
  if (!apiKey) {
    throw new Error('Mailgun API key not configured');
  }

  // Account endpoint is at root level
  const accountUrl = baseUrl.replace('/v3', '/v4/accounts');
  
  const response = await fetch(accountUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Failed to get account info: ${response.status}`);
  }

  return data;
}

export default {
  listDomains,
  getDomain,
  addDomain,
  deleteDomain,
  verifyDomain,
  getDomainConnection,
  updateDomainConnection,
  getTrackingSettings,
  updateTrackingSettings,
  getAccountInfo
};

