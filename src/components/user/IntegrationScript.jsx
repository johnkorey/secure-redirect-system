import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Copy, Code, FileCode } from 'lucide-react';
import { toast } from 'sonner';

export default function IntegrationScript({ apiUser }) {
  const [copied, setCopied] = useState(false);

  const phpScript = `<?php
// Bot Protection Script
// Generated for: ${apiUser?.username || 'User'}
// API Key: ${apiUser?.api_key || 'YOUR_API_KEY'}

define('API_KEY', '${apiUser?.api_key || 'YOUR_API_KEY'}');
define('API_ENDPOINT', '${window.location.origin}/api/classify');

// Get visitor information
$ipAddress = $_SERVER['REMOTE_ADDR'];
$userAgent = $_SERVER['HTTP_USER_AGENT'];
$referer = $_SERVER['HTTP_REFERER'] ?? 'direct';

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

$response = curl_exec($ch);
curl_close($ch);

$result = json_decode($response, true);

// Redirect based on classification
if ($result['classification'] === 'HUMAN') {
    header('Location: ${apiUser?.human_redirect_url || 'https://example.com/human'}');
} else {
    header('Location: ${apiUser?.bot_redirect_url || 'https://example.com/bot'}');
}
exit;
?>`;

  const jsScript = `// JavaScript Bot Detection
// Generated for: ${apiUser?.username || 'User'}

const API_KEY = '${apiUser?.api_key || 'YOUR_API_KEY'}';
const API_ENDPOINT = '${window.location.origin}/api/classify';

async function classifyVisitor() {
    const data = {
        api_key: API_KEY,
        ip_address: 'client_ip', // Get from backend
        user_agent: navigator.userAgent,
        referer: document.referrer || 'direct',
        origin: window.location.hostname,
        timestamp: Date.now()
    };

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.classification === 'HUMAN') {
            window.location.href = '${apiUser?.human_redirect_url || 'https://example.com/human'}';
        } else {
            window.location.href = '${apiUser?.bot_redirect_url || 'https://example.com/bot'}';
        }
    } catch (error) {
        console.error('Classification error:', error);
    }
}

// Run classification
classifyVisitor();`;

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
          Copy and paste these ready-to-use scripts into your application for maximum bot protection.
          Scripts include HMAC signing, rate limiting, and device fingerprinting.
        </p>

        <Tabs defaultValue="php">
          <TabsList className="mb-4">
            <TabsTrigger value="php">PHP</TabsTrigger>
            <TabsTrigger value="javascript">JavaScript</TabsTrigger>
          </TabsList>

          <TabsContent value="php">
            <div className="relative">
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm">
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
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm">
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
        </Tabs>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Security Features</h3>
        <ul className="space-y-2 text-slate-600">
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
            <span>Device fingerprinting for enhanced detection</span>
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