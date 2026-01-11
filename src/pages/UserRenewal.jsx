import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Copy, CheckCircle2, Loader2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

// Use relative URLs - backend serves frontend on same origin
const API_URL = '';

const CRYPTO_OPTIONS = [
  { id: 'BTC', name: 'Bitcoin', color: 'bg-orange-500' },
  { id: 'ETH', name: 'Ethereum', color: 'bg-blue-500' },
  { id: 'USDT_TRC20', name: 'USDT (TRC20)', color: 'bg-emerald-500' },
  { id: 'TRX', name: 'Tron', color: 'bg-red-500' },
  { id: 'LTC', name: 'Litecoin', color: 'bg-slate-500' }
];

export default function UserRenewal() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session');

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCrypto, setSelectedCrypto] = useState('USDT_TRC20');
  const [transactionHash, setTransactionHash] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (sessionId) {
      fetchSession();
    } else {
      navigate('/user/dashboard');
    }
  }, [sessionId]);

  const fetchSession = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/user/renewal-session/${sessionId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Session not found');
      }
      
      const data = await response.json();
      setSession(data);
    } catch (error) {
      toast.error(error.message);
      navigate('/user/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!transactionHash.trim()) {
      toast.error('Please enter the transaction hash');
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/user/complete-renewal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId,
          transactionHash: transactionHash.trim(),
          cryptoType: selectedCrypto
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setCompleted(true);
      toast.success('Subscription renewed successfully!');

      // Redirect to dashboard after 3 seconds
      setTimeout(() => {
        navigate('/user/dashboard');
      }, 3000);
    } catch (error) {
      toast.error(error.message || 'Failed to complete renewal');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center bg-slate-800/50 border-emerald-500/30">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Renewal Complete!</h2>
          <p className="text-slate-400 mb-4">
            Your {session?.accessType} subscription has been renewed.
          </p>
          <p className="text-sm text-slate-500">Redirecting to dashboard...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/user/dashboard')}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">Renew Subscription</h1>
            <p className="text-slate-400">Complete payment to renew your plan</p>
          </div>
        </div>

        <div className="grid gap-6">
          {/* Order Summary */}
          <Card className="p-6 bg-slate-800/50 border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <CreditCard className="w-5 h-5 text-emerald-500" />
              <h2 className="text-lg font-semibold text-white">Order Summary</h2>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-400">Plan</span>
                <span className="text-white font-medium capitalize">{session?.accessType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Duration</span>
                <span className="text-white">{session?.pricing?.durationDays} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Daily Links</span>
                <span className="text-white">{session?.pricing?.dailyLinkLimit} link{session?.pricing?.dailyLinkLimit > 1 ? 's' : ''}/day</span>
              </div>
              <div className="border-t border-slate-700 my-3"></div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-medium">Total</span>
                <span className="text-2xl font-bold text-emerald-400">${session?.pricing?.amount}</span>
              </div>
            </div>
          </Card>

          {/* Crypto Selection */}
          <Card className="p-6 bg-slate-800/50 border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">Select Payment Method</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {CRYPTO_OPTIONS.map((crypto) => (
                <button
                  key={crypto.id}
                  onClick={() => setSelectedCrypto(crypto.id)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    selectedCrypto === crypto.id
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full ${crypto.color} mx-auto mb-1`}></div>
                  <p className="text-white text-sm font-medium">{crypto.name}</p>
                </button>
              ))}
            </div>
          </Card>

          {/* Wallet Address */}
          <Card className="p-6 bg-slate-800/50 border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4">
              Send ${session?.pricing?.amount} to this address
            </h2>
            
            <div className="bg-slate-900 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between gap-2">
                <code className="text-emerald-400 text-sm break-all">
                  {session?.wallets?.[selectedCrypto] || 'Wallet not configured'}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(session?.wallets?.[selectedCrypto] || '')}
                  className="text-slate-400 hover:text-white shrink-0"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Transaction Hash</Label>
              <Input
                value={transactionHash}
                onChange={(e) => setTransactionHash(e.target.value)}
                placeholder="Enter your transaction hash after payment"
                className="bg-slate-900 border-slate-600 text-white"
              />
              <p className="text-xs text-slate-500">
                After sending payment, paste the transaction hash here for verification.
              </p>
            </div>
          </Card>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={!transactionHash.trim() || submitting}
            className="w-full py-6 text-lg bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Verifying Payment...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5 mr-2" />
                Complete Renewal
              </>
            )}
          </Button>

          <p className="text-center text-xs text-slate-500">
            By completing this payment, you agree to our terms of service.
          </p>
        </div>
      </div>
    </div>
  );
}

