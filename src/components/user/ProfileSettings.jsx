import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertCircle, Key, Eye, EyeOff, CreditCard, Clock } from 'lucide-react';
import { toast } from 'sonner';

// Detect backend URL dynamically
function getBackendUrl() {
  if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;
  const hostname = window.location.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `http://${hostname}:3001`;
  }
  return '';
}
const API_URL = getBackendUrl();

export default function ProfileSettings({ apiUser }) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [showRegenDialog, setShowRegenDialog] = useState(false);
  const [showRenewDialog, setShowRenewDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [renewLoading, setRenewLoading] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Check subscription status
  const subscriptionExpiry = apiUser?.subscription_expiry ? new Date(apiUser.subscription_expiry) : null;
  const now = new Date();
  const isExpired = subscriptionExpiry && subscriptionExpiry < now;
  const daysUntilExpiry = subscriptionExpiry ? Math.ceil((subscriptionExpiry - now) / (1000 * 60 * 60 * 24)) : 0;
  const isExpiringSoon = daysUntilExpiry > 0 && daysUntilExpiry <= 7;

  const handleStartRenewal = async (plan) => {
    setRenewLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/user/start-renewal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ accessType: plan })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      // Navigate to renewal payment page
      navigate(`/user/renewal?session=${data.sessionId}`);
    } catch (error) {
      toast.error(error.message || 'Failed to start renewal');
    } finally {
      setRenewLoading(false);
      setShowRenewDialog(false);
    }
  };

  const updateProfileMutation = useMutation({
    mutationFn: (data) => base44.entities.APIUser.update(apiUser.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user'] }); // Match UserDashboard query key
      toast.success('Profile updated!');
    },
  });

  const regenerateApiKeyMutation = useMutation({
    mutationFn: () => {
      const newKey = `ak_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setNewApiKey(newKey);
      return base44.entities.APIUser.update(apiUser.id, { api_key: newKey });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user'] }); // Match UserDashboard query key
      toast.success('API key regenerated!');
    },
  });

  return (
    <div className="space-y-6">
      {/* Telegram Alert */}
      {!apiUser?.telegram_chat_id && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900">No Telegram Chat ID Configured</p>
              <p className="text-sm text-amber-700 mt-1">
                Contact admin to set up Telegram notifications for Community Chat messages and system alerts.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Profile Information */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Profile Information</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Username</Label>
            <Input value={apiUser?.username || ''} disabled />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              value={apiUser?.email || ''}
              onChange={(e) => updateProfileMutation.mutate({ email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Telegram Chat ID</Label>
            <Input
              value={apiUser?.telegram_chat_id || ''}
              readOnly
              placeholder="Contact admin to set up Telegram notifications"
              className="bg-slate-50"
            />
            <p className="text-xs text-slate-500">
              💬 Get Community Chat notifications on Telegram • 🔔 Receive alerts for new messages • 📱 Stay updated on the go
            </p>
            {apiUser?.telegram_chat_id && (
              <p className="text-xs text-emerald-600 font-medium">
                ✓ Telegram notifications enabled
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Display Name (Forum)</Label>
            <Input
              value={apiUser?.display_name || ''}
              onChange={(e) => updateProfileMutation.mutate({ display_name: e.target.value })}
              placeholder="Your city or alias"
            />
          </div>
        </div>
      </Card>

      {/* API Key Management */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">API Key Management</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Your API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiUser?.api_key || ''}
                  readOnly
                  className="pr-10 font-mono"
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(apiUser?.api_key || '');
                  toast.success('API key copied!');
                }}
              >
                Copy
              </Button>
            </div>
          </div>

          <Dialog open={showRegenDialog} onOpenChange={setShowRegenDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full text-red-600 border-red-200">
                <Key className="w-4 h-4 mr-2" />
                Regenerate API Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Regenerate API Key?</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-slate-600">
                  This will invalidate your current API key. All applications using the old key will stop working.
                </p>
                {newApiKey && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <p className="text-sm text-emerald-700 mb-2 font-medium">New API Key:</p>
                    <code className="text-xs bg-white px-2 py-1 rounded block">{newApiKey}</code>
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        navigator.clipboard.writeText(newApiKey);
                        toast.success('New API key copied!');
                      }}
                    >
                      Copy New Key
                    </Button>
                  </div>
                )}
                <Button
                  onClick={() => regenerateApiKeyMutation.mutate()}
                  className="w-full bg-red-600 hover:bg-red-700"
                >
                  Confirm Regeneration
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <div className="space-y-2">
            <Label>Referral Code</Label>
            <Input value={apiUser?.referral_code || 'N/A'} disabled />
          </div>
        </div>
      </Card>

      {/* Subscription Status Alert */}
      {isExpired && (
        <Card className="p-4 bg-red-50 border-red-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-900">Subscription Expired</p>
              <p className="text-sm text-red-700 mt-1">
                Your subscription expired on {subscriptionExpiry.toLocaleDateString()}. Renew now to continue using the service.
              </p>
            </div>
            <Button 
              size="sm" 
              className="bg-red-600 hover:bg-red-700"
              onClick={() => setShowRenewDialog(true)}
            >
              <CreditCard className="w-4 h-4 mr-1" />
              Renew Now
            </Button>
          </div>
        </Card>
      )}

      {isExpiringSoon && !isExpired && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-amber-900">Subscription Expiring Soon</p>
              <p className="text-sm text-amber-700 mt-1">
                Your subscription expires in {daysUntilExpiry} day{daysUntilExpiry > 1 ? 's' : ''} ({subscriptionExpiry.toLocaleDateString()}). Renew early to avoid interruption.
              </p>
            </div>
            <Button 
              size="sm" 
              variant="outline"
              className="border-amber-600 text-amber-700 hover:bg-amber-100"
              onClick={() => setShowRenewDialog(true)}
            >
              <CreditCard className="w-4 h-4 mr-1" />
              Renew
            </Button>
          </div>
        </Card>
      )}

      {/* Subscription Management */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Subscription Management</h3>
        <div className="space-y-4">
          <div className={`flex items-center justify-between p-4 rounded-lg ${isExpired ? 'bg-red-50' : 'bg-slate-50'}`}>
            <div>
              <p className="font-medium text-slate-900">Current Plan</p>
              <p className="text-sm text-slate-500 capitalize">{apiUser?.access_type || 'None'}</p>
            </div>
            <div className="text-right">
              <p className="font-medium text-slate-900">{(apiUser?.daily_request_limit || 20000).toLocaleString()} requests/day</p>
              <p className="text-sm text-slate-500">
                Links: {apiUser?.daily_link_limit || 2}/day • Status: {isExpired ? <span className="text-red-600">Expired</span> : apiUser?.status || 'Active'}
              </p>
              {subscriptionExpiry && (
                <p className={`text-xs mt-1 ${isExpired ? 'text-red-500' : 'text-slate-400'}`}>
                  {isExpired ? 'Expired' : 'Expires'}: {subscriptionExpiry.toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          <Button
            onClick={() => setShowRenewDialog(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Renew Subscription
          </Button>
        </div>
      </Card>

      {/* Renewal Dialog */}
      <Dialog open={showRenewDialog} onOpenChange={setShowRenewDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renew Subscription</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Select a plan to renew your subscription. Your new subscription will be added to your remaining time.
            </p>
            
            <div className="space-y-2">
              {[
                { id: 'daily', name: 'Daily', price: 100, links: 1, duration: '1 day' },
                { id: 'weekly', name: 'Weekly', price: 300, links: 2, duration: '7 days' },
                { id: 'monthly', name: 'Monthly', price: 900, links: 2, duration: '30 days' }
              ].map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    selectedPlan === plan.id
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-emerald-300'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-slate-900">{plan.name}</p>
                      <p className="text-sm text-slate-500">{plan.links} link{plan.links > 1 ? 's' : ''}/day • {plan.duration}</p>
                    </div>
                    <p className="text-xl font-bold text-emerald-600">${plan.price}</p>
                  </div>
                </button>
              ))}
            </div>

            <Button
              onClick={() => handleStartRenewal(selectedPlan)}
              disabled={!selectedPlan || renewLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {renewLoading ? 'Processing...' : 'Continue to Payment'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Subscription Plans */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Subscription Plans</h3>
        <p className="text-sm text-slate-500 mb-6">Choose a plan or renew your subscription</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Daily Plan */}
          <div className={`border rounded-lg p-4 transition-all ${apiUser?.access_type === 'daily' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300 hover:shadow-md'}`}>
            <div className="text-center mb-4">
              <h4 className="font-semibold text-slate-900">Daily</h4>
              <p className="text-3xl font-bold text-slate-900 mt-2">$100</p>
              <p className="text-sm text-slate-500">per day</p>
            </div>
            <ul className="space-y-2 text-sm text-slate-600 mb-4">
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <strong>1 redirect link</strong> per day
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                Full bot detection
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                IP analysis & filtering
              </li>
            </ul>
            <Button className="w-full" variant="outline" disabled={apiUser?.access_type === 'daily'}>
              {apiUser?.access_type === 'daily' ? 'Current Plan' : 'Select'}
            </Button>
          </div>

          {/* Weekly Plan */}
          <div className={`border-2 rounded-lg p-4 relative shadow-lg ${apiUser?.access_type === 'weekly' ? 'border-emerald-500 bg-emerald-50' : 'border-emerald-500'}`}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs px-3 py-1 rounded-full">
              Popular
            </div>
            <div className="text-center mb-4">
              <h4 className="font-semibold text-slate-900">Weekly</h4>
              <p className="text-3xl font-bold text-emerald-600 mt-2">$300</p>
              <p className="text-sm text-slate-500">per week</p>
            </div>
            <ul className="space-y-2 text-sm text-slate-600 mb-4">
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <strong>2 redirect links</strong> per day
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                Full bot detection
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                Telegram alerts
              </li>
            </ul>
            <Button className="w-full bg-emerald-500 hover:bg-emerald-600" disabled={apiUser?.access_type === 'weekly'}>
              {apiUser?.access_type === 'weekly' ? 'Current Plan' : 'Select'}
            </Button>
          </div>

          {/* Monthly Plan */}
          <div className={`border rounded-lg p-4 transition-all ${apiUser?.access_type === 'monthly' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300 hover:shadow-md'}`}>
            <div className="text-center mb-4">
              <h4 className="font-semibold text-slate-900">Monthly</h4>
              <p className="text-3xl font-bold text-slate-900 mt-2">$900</p>
              <p className="text-sm text-slate-500">per month</p>
            </div>
            <ul className="space-y-2 text-sm text-slate-600 mb-4">
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <strong>2 redirect links</strong> per day
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                Full bot detection
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                All premium features
              </li>
            </ul>
            <Button className="w-full" variant="outline" disabled={apiUser?.access_type === 'monthly'}>
              {apiUser?.access_type === 'monthly' ? 'Current Plan' : 'Select'}
            </Button>
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center mt-4">
          Contact admin for payment. We accept BTC, ETH, USDT (TRC20/ERC20), and TRX.
        </p>
      </Card>
    </div>
  );
}