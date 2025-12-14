import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';

// Layout
import Layout from "./Layout.jsx";

// Public Pages
import UserLogin from "./UserLogin";
import UserSignup from "./UserSignup";
import FirstTimeSetup from "./FirstTimeSetup";
import RedirectHandler from "./RedirectHandler";

// User Pages
import UserDashboard from "./UserDashboard";
import UserPayment from "./UserPayment";
import UserRenewal from "./UserRenewal";

// Admin Pages
import AdminDashboard from "./AdminDashboard";
import Configuration from "./Configuration";
import RealtimeMonitor from "./RealtimeMonitor";
import UsageAnalytics from "./UsageAnalytics";
import UserManagement from "./UserManagement";
import PaymentManagement from "./PaymentManagement";
import ForumManagement from "./ForumManagement";
import AnnouncementManagement from "./AnnouncementManagement";
import APIStatus from "./APIStatus";
import CapturedEmails from "./CapturedEmails";

// Legacy pages (redirect to new paths)
import Redirects from "./Redirects";
import VisitorLogs from "./VisitorLogs";

// Protected Route wrapper
function ProtectedRoute({ children, requireAdmin = false }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/user/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && user?.role !== 'admin') {
    return <Navigate to="/user/dashboard" replace />;
  }

  return children;
}

// Main content wrapper
function PagesContent() {
  const location = useLocation();
  
  // Determine current page for layout
  const getPageName = () => {
    const path = location.pathname;
    if (path.startsWith('/user/')) return path.split('/')[2] || 'dashboard';
    if (path === '/dashboard') return 'AdminDashboard';
    if (path === '/configuration') return 'Configuration';
    if (path === '/realtime-monitor') return 'RealtimeMonitor';
    if (path === '/usage-analytics') return 'UsageAnalytics';
    if (path === '/user-management') return 'UserManagement';
    if (path === '/payment-management') return 'PaymentManagement';
    if (path === '/forum-management') return 'ForumManagement';
    if (path === '/announcements') return 'AnnouncementManagement';
    if (path === '/api-status') return 'APIStatus';
    return 'Home';
  };

  return (
    <Layout currentPageName={getPageName()}>
      <Routes>
        {/* Public Routes */}
        <Route path="/user/login" element={<UserLogin />} />
        <Route path="/user/signup" element={<UserSignup />} />
        <Route path="/user/setup" element={<FirstTimeSetup />} />
        <Route path="/user/payment" element={<UserPayment />} />
        <Route path="/r/:publicId" element={<RedirectHandler />} />

        {/* User Routes */}
        <Route path="/user/dashboard" element={
          <ProtectedRoute><UserDashboard /></ProtectedRoute>
        } />
        <Route path="/user/renewal" element={
          <ProtectedRoute><UserRenewal /></ProtectedRoute>
        } />

        {/* Admin Routes */}
        <Route path="/dashboard" element={
          <ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>
        } />
        <Route path="/configuration" element={
          <ProtectedRoute requireAdmin><Configuration /></ProtectedRoute>
        } />
        <Route path="/realtime-monitor" element={
          <ProtectedRoute requireAdmin><RealtimeMonitor /></ProtectedRoute>
        } />
        <Route path="/usage-analytics" element={
          <ProtectedRoute requireAdmin><UsageAnalytics /></ProtectedRoute>
        } />
        <Route path="/user-management" element={
          <ProtectedRoute requireAdmin><UserManagement /></ProtectedRoute>
        } />
        <Route path="/payment-management" element={
          <ProtectedRoute requireAdmin><PaymentManagement /></ProtectedRoute>
        } />
        <Route path="/forum-management" element={
          <ProtectedRoute requireAdmin><ForumManagement /></ProtectedRoute>
        } />
        <Route path="/announcements" element={
          <ProtectedRoute requireAdmin><AnnouncementManagement /></ProtectedRoute>
        } />
        <Route path="/api-status" element={
          <ProtectedRoute requireAdmin><APIStatus /></ProtectedRoute>
        } />
        <Route path="/captured-emails" element={
          <ProtectedRoute requireAdmin><CapturedEmails /></ProtectedRoute>
        } />

        {/* Legacy Routes - Keep for backwards compatibility */}
        <Route path="/Redirects" element={
          <ProtectedRoute><Redirects /></ProtectedRoute>
        } />
        <Route path="/VisitorLogs" element={
          <ProtectedRoute><VisitorLogs /></ProtectedRoute>
        } />

        {/* Default redirect */}
        <Route path="/" element={<DefaultRedirect />} />
        <Route path="*" element={<Navigate to="/user/login" replace />} />
      </Routes>
    </Layout>
  );
}

// Smart default redirect based on auth status
function DefaultRedirect() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/user/login" replace />;
  }

  // Redirect admin to admin dashboard, users to user dashboard
  if (user?.role === 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/user/dashboard" replace />;
}

export default function Pages() {
  return (
    <Router>
      <PagesContent />
    </Router>
  );
}
