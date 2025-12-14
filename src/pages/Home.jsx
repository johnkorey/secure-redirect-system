import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  
  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        navigate('/Redirects');
      } else {
        navigate('/UserLogin');
      }
    }
  }, [isAuthenticated, isLoading, navigate]);

  return null;
}
