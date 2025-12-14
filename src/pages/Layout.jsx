import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import ChatWidget from '@/components/ChatWidget';
import { 
  Shield, 
  LayoutDashboard, 
  Activity, 
  Settings, 
  Users, 
  CreditCard, 
  MessageSquare, 
  Megaphone,
  BarChart3,
  Menu,
  X,
  LogOut,
  ChevronRight,
  User,
  Mail
} from 'lucide-react';

// Admin navigation items
const adminNavItems = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { name: 'Realtime Monitor', icon: Activity, path: '/realtime-monitor' },
  { name: 'Configuration', icon: Settings, path: '/configuration' },
  { name: 'User Management', icon: Users, path: '/user-management' },
  { name: 'Captured Emails', icon: Mail, path: '/captured-emails' },
  { name: 'Payments', icon: CreditCard, path: '/payment-management' },
  { name: 'Forum', icon: MessageSquare, path: '/forum-management' },
  { name: 'Announcements', icon: Megaphone, path: '/announcements' },
  { name: 'API Status', icon: Shield, path: '/api-status' },
  { name: 'Analytics', icon: BarChart3, path: '/usage-analytics' }
];

// Admin page paths
const adminPaths = [
  '/dashboard',
  '/configuration',
  '/realtime-monitor',
  '/usage-analytics',
  '/user-management',
  '/payment-management',
  '/forum-management',
  '/announcements',
  '/api-status'
];

export default function Layout({ children }) {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Don't show layout for login page or redirect handler
  if (location.pathname === '/user/login' || location.pathname.startsWith('/r/')) {
    return <>{children}</>;
  }

  // If not authenticated, just render children
  if (!isAuthenticated) {
    return <>{children}</>;
  }

  const isAdminPage = adminPaths.some(path => location.pathname === path);
  const isAdmin = user?.role === 'admin';

  const handleLogout = () => {
    logout();
    window.location.href = '/user/login';
  };

  // User pages layout (simpler header)
  if (!isAdminPage) {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* User Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link to={isAdmin ? '/dashboard' : '/user/dashboard'} className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500 rounded-lg">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-slate-900 text-lg">Secure Redirect</span>
              </Link>

              <div className="flex items-center gap-4">
                {isAdmin && (
                  <Link to="/dashboard">
                    <Button variant="outline" size="sm">
                      Admin Panel
                    </Button>
                  </Link>
                )}
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">{user?.full_name || user?.email}</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main>{children}</main>
      </div>
    );
  }

  // Admin layout with sidebar
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-emerald-400" />
          <span className="font-bold text-white">Admin Panel</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-white"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-slate-900 border-r border-slate-800 z-40
        transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500 rounded-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white text-lg">Admin Panel</h1>
              <p className="text-xs text-slate-400">{user?.email}</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.path} 
                to={item.path}
                onClick={() => setSidebarOpen(false)}
              >
                <div className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg transition-all
                  ${isActive 
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }
                `}>
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                  {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800 space-y-2">
          <Link to="/user/dashboard">
            <Button
              variant="ghost"
              className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800"
            >
              <User className="w-4 h-4 mr-3" />
              User Dashboard
            </Button>
          </Link>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <LogOut className="w-4 h-4 mr-3" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="lg:ml-64 pt-16 lg:pt-0">
        {children}
      </main>

      {/* Floating Chat Widget - Available on all admin pages */}
      <ChatWidget />
    </div>
  );
}
