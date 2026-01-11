import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Loader2, AlertCircle, Check, Copy, Wallet, Clock, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

// Use relative URLs - backend serves frontend on same origin
const API_URL = '';

const CRYPTO_OPTIONS = [
  { id: 'BTC', name: 'Bitcoin', icon: '₿', color: 'text-orange-500' },
  { id: 'ETH', name: 'Ethereum', icon: 'Ξ', color: 'text-blue-400' },
  { id: 'USDT_TRC20', name: 'USDT (TRC20)', icon: '₮', color: 'text-green-500' },
  { id: 'TRX', name: 'Tron', icon: 'T', color: 'text-red-500' }
];

export default function UserPayment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setToken, setUser } = useAuth();
  
  const sessionId = searchParams.get('session');
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [signupData, setSignupData] = useState(null);
  const [selectedCrypto, setSelectedCrypto] = useState('USDT_TRC20');
  const [transactionHash, setTransactionHash] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [completionData, setCompletionData] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      navigate('/user/signup');
      return;
    }
    fetchSignupData();
  }, [sessionId]);

  const fetchSignupData = async () => {
    try {
      const response = await fetch(`${API_URL}/api/user/pending-signup/${sessionId}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Session not found');
      }
      
      setSignupData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!transactionHash.trim()) {
      setError('Please enter the transaction hash');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/user/complete-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          transactionHash: transactionHash.trim(),
          cryptoType: selectedCrypto
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Payment verification failed');
      }

      // Store token and user data
      if (data.token) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user);
      }

      setCompletionData(data);
      setIsComplete(true);
      toast.success('Payment verified! Account activated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const selectedWallet = signupData?.wallets?.[selectedCrypto] || 'Not configured';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (isComplete && completionData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <Card className="border-emerald-500/50 bg-slate-800/50 backdrop-blur-xl shadow-2xl">
            <CardContent className="pt-8 pb-6 text-center">
              <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Account Activated!</h2>
              <p className="text-slate-400 mb-6">Your payment has been verified successfully.</p>

              <div className="bg-slate-700/50 rounded-lg p-4 mb-6 text-left">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-sm">Plan:</span>
                    <span className="text-white font-medium capitalize">{completionData.subscription?.accessType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-sm">Daily Links:</span>
                    <span className="text-emerald-400 font-medium">{completionData.subscription?.dailyLinkLimit || 2}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-sm">Expires:</span>
                    <span className="text-white">{new Date(completionData.subscription?.expiresAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 rounded-lg p-4 mb-6">
                <p className="text-xs text-slate-400 mb-2">Your API Key (save this!):</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-emerald-400 font-mono break-all">
                    {completionData.apiKey}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(completionData.apiKey)}
                    className="text-slate-400 hover:text-white"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-6">
                <p className="text-xs text-amber-400">
                  ⚠️ Save your API key now! You won't be able to see it again.
                </p>
              </div>

              <Button
                onClick={() => navigate('/user/dashboard')}
                className="w-full bg-emerald-500 hover:bg-emerald-600"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDI1MzUiIGZpbGwtb3BhY2l0eT0iMC40Ij48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJWMThoMnY0em0wLTZoLTJ2LTRoMnY0eiIvPjwvZz48L2c+PC9zdmc+')] opacity-20"></div>
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500 rounded-2xl mb-4 shadow-lg shadow-emerald-500/30">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Complete Payment</h1>
          <p className="text-slate-400">Send payment to activate your account</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                s <= 2 ? 'bg-emerald-500 text-white' : 'bg-emerald-500/50 text-white'
              }`}>
                {s < 3 ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && <div className={`w-12 h-1 mx-2 ${s < 3 ? 'bg-emerald-500' : 'bg-slate-700'}`} />}
            </div>
          ))}
        </div>

        {error && !signupData && (
          <Card className="border-red-500/50 bg-slate-800/50 mb-6">
            <CardContent className="pt-6 text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-red-400 mb-4">{error}</p>
              <Button onClick={() => navigate('/user/signup')} variant="outline">
                Start Over
              </Button>
            </CardContent>
          </Card>
        )}

        {signupData && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Order Summary */}
            <Card className="border-slate-700 bg-slate-800/50 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-lg text-white">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between py-2 border-b border-slate-700">
                  <span className="text-slate-400">Plan</span>
                  <span className="text-white font-medium capitalize">{signupData.accessType}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-700">
                  <span className="text-slate-400">Duration</span>
                  <span className="text-white">{signupData.pricing?.durationDays} days</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-700">
                  <span className="text-slate-400">Daily Links</span>
                  <span className="text-emerald-400 font-medium">
                    {signupData.accessType === 'daily' ? 1 : 2} per day
                  </span>
                </div>
                <div className="flex justify-between py-3 text-lg">
                  <span className="text-white font-semibold">Total</span>
                  <span className="text-emerald-400 font-bold">${signupData.pricing?.amount}</span>
                </div>

                <div className="p-3 bg-slate-700/50 rounded-lg">
                  <p className="text-xs text-slate-400 mb-1">Account Email:</p>
                  <p className="text-white">{signupData.email}</p>
                </div>
              </CardContent>
            </Card>

            {/* Payment Form */}
            <Card className="border-slate-700 bg-slate-800/50 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Wallet className="w-5 h-5" />
                  Payment Details
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Select cryptocurrency and send payment
                </CardDescription>
              </CardHeader>
              <CardContent>
                {error && signupData && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmitPayment} className="space-y-4">
                  {/* Crypto Selection */}
                  <div className="grid grid-cols-2 gap-2">
                    {CRYPTO_OPTIONS.map((crypto) => (
                      <button
                        key={crypto.id}
                        type="button"
                        onClick={() => setSelectedCrypto(crypto.id)}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          selectedCrypto === crypto.id
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                        }`}
                      >
                        <span className={`text-xl ${crypto.color}`}>{crypto.icon}</span>
                        <p className="text-white text-sm mt-1">{crypto.name}</p>
                      </button>
                    ))}
                  </div>

                  {/* Wallet Address */}
                  <div className="space-y-2">
                    <Label className="text-slate-300">Send ${signupData.pricing?.amount} to:</Label>
                    <div className="flex gap-2">
                      <Input
                        value={selectedWallet}
                        readOnly
                        className="bg-slate-900 border-slate-600 text-white font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => copyToClipboard(selectedWallet)}
                        className="border-slate-600"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    {selectedWallet === 'Not configured' && (
                      <p className="text-xs text-amber-400">
                        ⚠️ Wallet not configured. Contact admin.
                      </p>
                    )}
                  </div>

                  {/* Transaction Hash */}
                  <div className="space-y-2">
                    <Label className="text-slate-300">Transaction Hash *</Label>
                    <Input
                      placeholder="Enter transaction hash after sending"
                      value={transactionHash}
                      onChange={(e) => setTransactionHash(e.target.value)}
                      className="bg-slate-700/50 border-slate-600 text-white font-mono text-sm"
                      required
                    />
                    <p className="text-xs text-slate-500">
                      Paste the transaction hash from your wallet after sending
                    </p>
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <p className="text-xs text-amber-400">
                      Verification may take a few minutes. Your account will be activated after confirmation.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                    disabled={isSubmitting || !transactionHash.trim()}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Verifying Payment...
                      </>
                    ) : (
                      'Verify Payment & Activate Account'
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </motion.div>
    </div>
  );
}
