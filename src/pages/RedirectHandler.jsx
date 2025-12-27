import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Shield, AlertCircle } from 'lucide-react';

// Backend API URL
// Detect backend URL dynamically
function getBackendUrl() {
  if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;
  const hostname = window.location.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `http://${hostname}:3001`;
  }
  return '';
}
const BACKEND_URL = getBackendUrl();

export default function RedirectHandler() {
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState('initializing');
  const processedRef = useRef(false);
  
  // Get publicId from URL params (React Router)
  const { publicId: routePublicId } = useParams();
  
  // Fallback: Extract from URL path if not from params
  const pathParts = window.location.pathname.split('/');
  const publicId = routePublicId || pathParts[pathParts.indexOf('r') + 1];

  useEffect(() => {
    // Prevent double processing
    if (processedRef.current) return;
    
    if (!publicId) {
      setError('Invalid redirect URL');
      setIsProcessing(false);
      return;
    }

    processedRef.current = true;
    setStage('processing');

    // The backend handles everything - just redirect to it
    // This frontend page is only shown briefly while redirecting
    const backendRedirectUrl = `${BACKEND_URL}/r/${publicId}`;
    
    console.log(`[RedirectHandler] Redirecting to backend: ${backendRedirectUrl}`);
    
    // Redirect to backend which will handle the full decision logic
    window.location.href = backendRedirectUrl;

  }, [publicId]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Redirect Error</h2>
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
          <Shield className="w-8 h-8 text-slate-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-3">Processing Request</h2>
        <p className="text-slate-600 mb-6">
          {stage === 'initializing' && 'Initializing...'}
          {stage === 'processing' && 'Analyzing traffic...'}
        </p>
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
          <span className="text-sm text-slate-500">Please wait</span>
        </div>
      </div>
    </div>
  );
}
