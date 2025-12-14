import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Shield, Mail, Lock, User, Loader2, AlertCircle, Check } from 'lucide-react';
import { motion } from 'framer-motion';
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

const PLANS = [
  { id: 'daily', name: 'Daily', price: 100, links: 1, requests: 20000, duration: '1 day' },
  { id: 'weekly', name: 'Weekly', price: 300, links: 2, requests: 20000, duration: '7 days', popular: true },
  { id: 'monthly', name: 'Monthly', price: 900, links: 2, requests: 20000, duration: '30 days' }
];

export default function UserSignup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Form, 2: Verify Email
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [testCode, setTestCode] = useState('');
  
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    accessType: 'weekly',
    referralCode: '',
    disclaimerAccepted: false
  });
  
  const [verificationCode, setVerificationCode] = useState('');

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (!form.disclaimerAccepted) {
      setError('You must accept the terms and conditions');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/user/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username || form.email.split('@')[0],
          email: form.email,
          password: form.password,
          accessType: form.accessType,
          referralCode: form.referralCode || null,
          disclaimerAccepted: form.disclaimerAccepted
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      setSessionId(data.sessionId);
      if (data.testCode) {
        setTestCode(data.testCode);
      }
      setStep(2);
      toast.success('Verification code sent to your email!');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/user/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, verificationCode })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      toast.success('Email verified! Redirecting to payment...');
      navigate(`/user/payment?session=${sessionId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/user/resend-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend code');
      }

      if (data.testCode) {
        setTestCode(data.testCode);
      }
      toast.success('New verification code sent!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedPlan = PLANS.find(p => p.id === form.accessType);

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
          <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-slate-400">Smart traffic filtering & redirect management</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'
              }`}>
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && <div className={`w-12 h-1 mx-2 ${step > s ? 'bg-emerald-500' : 'bg-slate-700'}`} />}
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-8 text-xs text-slate-400 mb-8">
          <span className={step >= 1 ? 'text-emerald-400' : ''}>Details</span>
          <span className={step >= 2 ? 'text-emerald-400' : ''}>Verify</span>
          <span className={step >= 3 ? 'text-emerald-400' : ''}>Payment</span>
        </div>

        <Card className="border-slate-700 bg-slate-800/50 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl text-white">
              {step === 1 ? 'Choose Your Plan' : 'Verify Email'}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {step === 1 ? 'Select a subscription plan and create your account' : 'Enter the verification code sent to your email'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </motion.div>
            )}

            {step === 1 ? (
              <form onSubmit={handleSignup} className="space-y-6">
                {/* Plan Selection */}
                <div className="grid grid-cols-3 gap-3">
                  {PLANS.map((plan) => (
                    <div
                      key={plan.id}
                      onClick={() => setForm({ ...form, accessType: plan.id })}
                      className={`relative p-4 rounded-lg cursor-pointer transition-all ${
                        form.accessType === plan.id
                          ? 'bg-emerald-500/20 border-2 border-emerald-500'
                          : 'bg-slate-700/50 border-2 border-transparent hover:border-slate-600'
                      }`}
                    >
                      {plan.popular && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs px-2 py-0.5 rounded-full">
                          Popular
                        </span>
                      )}
                      <div className="text-center">
                        <p className="text-white font-semibold">{plan.name}</p>
                        <p className="text-2xl font-bold text-emerald-400 mt-1">${plan.price}</p>
                        <p className="text-xs text-slate-400 mt-1">{plan.links} link{plan.links > 1 ? 's' : ''}/day • 20K req</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Username</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        placeholder="johndoe"
                        value={form.username}
                        onChange={(e) => setForm({ ...form, username: e.target.value })}
                        className="pl-10 bg-slate-700/50 border-slate-600 text-white"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Email *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="pl-10 bg-slate-700/50 border-slate-600 text-white"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Password *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        type="password"
                        placeholder="Min. 6 characters"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        className="pl-10 bg-slate-700/50 border-slate-600 text-white"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Confirm Password *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        type="password"
                        placeholder="Confirm password"
                        value={form.confirmPassword}
                        onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                        className="pl-10 bg-slate-700/50 border-slate-600 text-white"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">Referral Code (Optional)</Label>
                  <Input
                    placeholder="Enter referral code"
                    value={form.referralCode}
                    onChange={(e) => setForm({ ...form, referralCode: e.target.value })}
                    className="bg-slate-700/50 border-slate-600 text-white"
                  />
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="disclaimer"
                    checked={form.disclaimerAccepted}
                    onCheckedChange={(checked) => setForm({ ...form, disclaimerAccepted: checked })}
                    className="mt-1"
                  />
                  <label htmlFor="disclaimer" className="text-sm text-slate-400 cursor-pointer">
                    I agree to the Terms of Service and Privacy Policy. I understand that this is a paid service and no refunds will be issued.
                  </label>
                </div>

                {/* Summary */}
                <div className="p-4 bg-slate-700/30 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Selected Plan:</span>
                    <span className="text-white font-medium">{selectedPlan?.name} - ${selectedPlan?.price}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-slate-400">Daily Limits:</span>
                    <span className="text-emerald-400">{selectedPlan?.links} link{selectedPlan?.links > 1 ? 's' : ''} • 20K requests</span>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Continue to Verification'
                  )}
                </Button>

                <p className="text-center text-sm text-slate-400">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/user/login')}
                    className="text-emerald-400 hover:text-emerald-300"
                  >
                    Sign in
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="space-y-6">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-8 h-8 text-emerald-400" />
                  </div>
                  <p className="text-slate-300">
                    We sent a verification code to<br />
                    <span className="text-emerald-400 font-medium">{form.email}</span>
                  </p>
                </div>

                {testCode && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-center">
                    <p className="text-xs text-amber-400 mb-1">Test Mode - Verification Code:</p>
                    <p className="text-2xl font-mono font-bold text-amber-300">{testCode}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-slate-300">Verification Code</Label>
                  <Input
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    className="bg-slate-700/50 border-slate-600 text-white text-center text-2xl tracking-widest"
                    maxLength={6}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium"
                  disabled={isLoading || verificationCode.length !== 6}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify & Continue to Payment'
                  )}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={isLoading}
                    className="text-sm text-slate-400 hover:text-emerald-400"
                  >
                    Didn't receive the code? Resend
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

