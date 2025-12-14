import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

export default function SystemSettings() {
  const queryClient = useQueryClient();

  const { data: configs = [] } = useQuery({
    queryKey: ['system-configs'],
    queryFn: () => base44.entities.SystemConfig.list(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SystemConfig.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-configs'] });
      toast.success('Settings saved');
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.SystemConfig.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-configs'] });
      toast.success('Setting created');
    },
  });

  const getConfigValue = (key) => {
    const config = configs.find(c => c.config_key === key);
    return config?.config_value || '';
  };

  const handleSave = (key, value, type) => {
    const existing = configs.find(c => c.config_key === key);
    if (existing) {
      updateMutation.mutate({ id: existing.id, data: { config_value: value } });
    } else {
      createMutation.mutate({ config_key: key, config_value: value, config_type: type });
    }
  };

  const SettingField = ({ label, configKey, configType, placeholder }) => {
    const [value, setValue] = useState(getConfigValue(configKey));
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
          />
          <Button onClick={() => handleSave(configKey, value, configType)}>
            <Save className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">System Settings</h3>
      
      <Tabs defaultValue="ip2location">
        <TabsList>
          <TabsTrigger value="ip2location">IP2Location</TabsTrigger>
          <TabsTrigger value="api">API Limits</TabsTrigger>
          <TabsTrigger value="crypto">Crypto</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="telegram">Telegram</TabsTrigger>
        </TabsList>

        <TabsContent value="ip2location" className="space-y-4 mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h4 className="font-medium text-blue-900 mb-2">IP2Location Configuration</h4>
            <p className="text-sm text-blue-700">
              Configure your IP2Location API key for accurate bot detection and geolocation.
              Get your API key from <a href="https://www.ip2location.io/" target="_blank" rel="noopener noreferrer" className="underline">ip2location.io</a>
            </p>
          </div>
          <SettingField 
            label="IP2Location API Key" 
            configKey="ip2location_api_key" 
            configType="ip2location"
            placeholder="Enter your IP2Location API key"
          />
          <SettingField 
            label="Fraud Score Threshold" 
            configKey="fraud_score_threshold" 
            configType="ip2location"
            placeholder="3"
          />
          <SettingField 
            label="Enable IP Lookup" 
            configKey="ip_lookup_enabled" 
            configType="ip2location"
            placeholder="true"
          />
        </TabsContent>

        <TabsContent value="api" className="space-y-4 mt-4">
          <SettingField 
            label="Global Rate Limit" 
            configKey="rate_limit_global" 
            configType="api"
            placeholder="1000"
          />
          <SettingField 
            label="Default Daily Limit" 
            configKey="default_daily_limit" 
            configType="api"
            placeholder="1000"
          />
        </TabsContent>

        <TabsContent value="crypto" className="space-y-4 mt-4">
          <SettingField 
            label="BTC Wallet Address" 
            configKey="btc_wallet" 
            configType="crypto"
            placeholder="bc1..."
          />
          <SettingField 
            label="ETH Wallet Address" 
            configKey="eth_wallet" 
            configType="crypto"
            placeholder="0x..."
          />
          <SettingField 
            label="TRX Wallet Address" 
            configKey="trx_wallet" 
            configType="crypto"
            placeholder="T..."
          />
          <SettingField 
            label="USDT Wallet Address" 
            configKey="usdt_wallet" 
            configType="crypto"
            placeholder="T..."
          />
        </TabsContent>

        <TabsContent value="email" className="space-y-4 mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h4 className="font-medium text-blue-900 mb-2">Mailgun API Configuration</h4>
            <p className="text-sm text-blue-700">
              Configure Mailgun API for sending emails from multiple domains. Get your API key from <a href="https://app.mailgun.com/settings/api_security" target="_blank" rel="noopener noreferrer" className="underline font-medium">Mailgun Dashboard</a>
            </p>
          </div>
          <SettingField 
            label="Mailgun API Key" 
            configKey="mailgun_api_key" 
            configType="email"
            placeholder="key-xxxxxxxxxxxxxxxxxxxxxxxxxx"
          />
          <SettingField 
            label="Mailgun Domain" 
            configKey="mailgun_domain" 
            configType="email"
            placeholder="mg.yourdomain.com"
          />
          <SettingField 
            label="Mailgun Region" 
            configKey="mailgun_region" 
            configType="email"
            placeholder="us (or eu)"
          />
          <SettingField 
            label="From Email" 
            configKey="mailgun_from_email" 
            configType="email"
            placeholder="noreply@yourdomain.com"
          />
          <SettingField 
            label="From Name" 
            configKey="mailgun_from_name" 
            configType="email"
            placeholder="Secure Redirect"
          />
        </TabsContent>

        <TabsContent value="telegram" className="space-y-4 mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h4 className="font-medium text-blue-900 mb-2">Telegram Bot Configuration</h4>
            <p className="text-sm text-blue-700">
              Set up Telegram notifications for Community Chat messages. 
              See <a href="/TELEGRAM_SETUP.md" target="_blank" className="underline">setup guide</a> for instructions.
            </p>
          </div>
          
          <SettingField 
            label="Telegram Bot Token" 
            configKey="telegramBotToken" 
            configType="system"
            placeholder="123456:ABC-DEF..."
          />
          <SettingField 
            label="Admin Chat ID" 
            configKey="adminChatId" 
            configType="system"
            placeholder="123456789"
          />
          
          <div className="pt-4 space-y-3">
            <div className="flex gap-3">
              <Button 
                onClick={async () => {
                  try {
                    const response = await fetch('/api/telegram/test', {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                        'Content-Type': 'application/json'
                      }
                    });
                    const data = await response.json();
                    if (data.success) {
                      toast.success('✅ Test message sent! Check your Telegram.');
                    } else {
                      toast.error('❌ Failed: ' + (data.error || 'Unknown error'));
                    }
                  } catch (error) {
                    toast.error('❌ Error: ' + error.message);
                  }
                }}
                className="bg-emerald-500 hover:bg-emerald-600"
              >
                📤 Send Test Message
              </Button>
              
              <Button 
                onClick={async () => {
                  try {
                    const webhookUrl = window.location.origin + '/api/telegram/webhook';
                    const response = await fetch('/api/telegram/setup-webhook', {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({ webhookUrl })
                    });
                    const data = await response.json();
                    if (data.success) {
                      toast.success('✅ Webhook configured! You can now reply from Telegram.');
                    } else {
                      toast.error('❌ Failed: ' + (data.error || 'Unknown error'));
                    }
                  } catch (error) {
                    toast.error('❌ Error: ' + error.message);
                  }
                }}
                variant="outline"
              >
                🔗 Setup Bidirectional Chat
              </Button>
              
              <Button 
                onClick={async () => {
                  try {
                    const response = await fetch('/api/telegram/webhook-info', {
                      headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                      }
                    });
                    const data = await response.json();
                    if (data.success) {
                      const info = data.info;
                      toast.info(`Webhook URL: ${info.url || 'Not set'}\nPending: ${info.pending_update_count || 0}`);
                    } else {
                      toast.error('Failed to get webhook info');
                    }
                  } catch (error) {
                    toast.error('Error: ' + error.message);
                  }
                }}
                variant="ghost"
                size="sm"
              >
                ℹ️ Webhook Info
              </Button>
            </div>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800 font-medium mb-1">🔄 Bidirectional Chat Enabled</p>
              <p className="text-xs text-green-700">
                After clicking "Setup Bidirectional Chat", users can reply from either:
              </p>
              <ul className="text-xs text-green-700 mt-1 ml-4 list-disc">
                <li>💬 Community Chat widget (web)</li>
                <li>📱 Telegram messages (mobile/desktop)</li>
              </ul>
              <p className="text-xs text-green-600 mt-2">
                All messages sync in real-time!
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}