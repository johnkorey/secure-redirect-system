import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Users, Bot, TrendingUp, Link2, Settings, Code, MessageSquare, LogOut, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import HostedLinksManager from '../components/user/HostedLinksManager';
import ProfileSettings from '../components/user/ProfileSettings';
import IntegrationScript from '../components/user/IntegrationScript';
import ChatWidget from '../components/ChatWidget';

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444'];

export default function UserDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [timeRange, setTimeRange] = useState('24h');
  const [visitorFilter, setVisitorFilter] = useState('all'); // 'all', 'human', 'bot'

  const { data: currentUser, refetch: refetchUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => base44.auth.me(),
  });

  // apiUser comes from the /api/auth/me endpoint
  const apiUser = currentUser?.apiUser;

  const { data: visitors = [], isLoading: visitorsLoading, error: visitorsError } = useQuery({
    queryKey: ['my-visitors', currentUser?.id],
    queryFn: async () => {
      console.log('[DEBUG] Fetching visitors for user:', currentUser?.id);
      const result = await base44.entities.VisitorLog.filter({ user_id: currentUser?.id });
      console.log('[DEBUG] Visitors fetched:', result?.length || 0);
      return result;
    },
    enabled: !!currentUser?.id,
  });

  // Debug logging
  if (visitorsError) {
    console.error('[ERROR] Failed to fetch visitors:', visitorsError);
  }

  // Get time range label
  const getTimeRangeLabel = () => {
    switch (timeRange) {
      case '24h': return 'Last 24 Hours';
      case '7d': return 'Last 7 Days';
      case '30d': return 'Last 30 Days';
      case '90d': return 'Last 90 Days';
      case 'all': return 'All Time';
      default: return 'Last 24 Hours';
    }
  };

  // Get time range cutoff
  const getTimeRangeCutoff = (range) => {
    const now = new Date();
    switch (range) {
      case '24h':
        return new Date(now - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now - 30 * 24 * 60 * 60 * 1000);
      case '90d':
        return new Date(now - 90 * 24 * 60 * 60 * 1000);
      case 'all':
        return new Date(0); // Beginning of time
      default:
        return new Date(now - 24 * 60 * 60 * 1000);
    }
  };

  // Filter visitors by time range
  const timeFilteredVisitors = useMemo(() => {
    const cutoff = getTimeRangeCutoff(timeRange);
    return visitors.filter(v => {
      const visitDate = new Date(v.created_date || v.visit_timestamp);
      return visitDate >= cutoff;
    });
  }, [visitors, timeRange]);

  const totalVisitors = timeFilteredVisitors.length;
  const humanCount = timeFilteredVisitors.filter(v => v.classification === 'HUMAN').length;
  const botCount = timeFilteredVisitors.filter(v => v.classification === 'BOT').length;
  const humanRate = totalVisitors > 0 ? Math.round((humanCount / totalVisitors) * 100) : 0;

  // Calculate number of days for trend chart based on time range
  const getTrendDays = () => {
    switch (timeRange) {
      case '24h': return 24; // Show hourly data
      case '7d': return 7;
      case '30d': return 30;
      case '90d': return 90;
      case 'all': return Math.min(90, Math.ceil((Date.now() - new Date(visitors[0]?.created_date || Date.now()).getTime()) / (24 * 60 * 60 * 1000)));
      default: return 7;
    }
  };

  // Daily/Hourly trends based on time range
  const dailyData = useMemo(() => {
    if (timeRange === '24h') {
      // Show hourly data for last 24 hours
      return Array.from({ length: 24 }, (_, i) => {
        const hour = new Date();
        hour.setHours(hour.getHours() - (23 - i), 0, 0, 0);
        const nextHour = new Date(hour);
        nextHour.setHours(nextHour.getHours() + 1);
        
        const hourVisitors = timeFilteredVisitors.filter(v => {
          const vDate = new Date(v.created_date || v.visit_timestamp);
          return vDate >= hour && vDate < nextHour;
        });
        
        return {
          date: hour.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
          humans: hourVisitors.filter(v => v.classification === 'HUMAN').length,
          bots: hourVisitors.filter(v => v.classification === 'BOT').length
        };
      });
    } else {
      // Show daily data
      const days = getTrendDays();
      return Array.from({ length: days }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (days - 1 - i));
        date.setHours(0, 0, 0, 0);
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        
        const dayVisitors = timeFilteredVisitors.filter(v => {
          const vDate = new Date(v.created_date || v.visit_timestamp);
          return vDate >= date && vDate < nextDay;
        });
        
        return {
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          humans: dayVisitors.filter(v => v.classification === 'HUMAN').length,
          bots: dayVisitors.filter(v => v.classification === 'BOT').length
        };
      });
    }
  }, [timeFilteredVisitors, timeRange]);

  const classificationData = [
    { name: 'Humans', value: humanCount },
    { name: 'Bots', value: botCount }
  ];

  // Filter visitors based on selected filter (classification)
  const filteredVisitors = timeFilteredVisitors.filter(v => {
    if (visitorFilter === 'all') return true;
    if (visitorFilter === 'human') return v.classification === 'HUMAN';
    if (visitorFilter === 'bot') return v.classification === 'BOT';
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-emerald-500 rounded-lg">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">User Dashboard</h1>
                <p className="text-sm text-slate-500">{apiUser?.username || 'Loading...'}</p>
              </div>
            </div>
            <Button variant="ghost" onClick={() => base44.auth.logout()}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="links" className="flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Hosted Links
            </TabsTrigger>
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="integration" className="flex items-center gap-2">
              <Code className="w-4 h-4" />
              Integration
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Time Range Filter */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-slate-600" />
                <span className="text-sm font-medium text-slate-700">Time Range:</span>
              </div>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24 Hours</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="90d">Last 90 Days</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Subscription Status */}
            <Card className="p-6 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-1 bg-white/20 rounded text-xs font-semibold">
                      {apiUser?.access_type?.toUpperCase() || 'SUBSCRIPTION'}
                    </span>
                  </div>
                  <p className="text-2xl font-bold capitalize">{apiUser?.access_type || 'Active'} Plan</p>
                  <p className="text-sm text-emerald-100 mt-2">
                    Links today: {apiUser?.links_created_today || 0} / {apiUser?.daily_link_limit || 2}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-emerald-100 text-sm">Status</p>
                  <p className="text-xl font-semibold capitalize">{apiUser?.status || 'Active'}</p>
                  {apiUser?.subscription_expiry && (
                    <p className="text-xs text-emerald-100 mt-1">
                      Expires: {new Date(apiUser.subscription_expiry).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-white/20">
                <div className="flex items-center gap-6 text-sm text-emerald-100">
                  <span>✓ {apiUser?.daily_link_limit || 2} link{(apiUser?.daily_link_limit || 2) > 1 ? 's' : ''}/day</span>
                  <span>✓ {((apiUser?.daily_request_limit || 20000) / 1000).toFixed(0)}K requests/day</span>
                  <span>✓ Full bot detection</span>
                </div>
              </div>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  <p className="text-sm text-slate-500">Total Visitors</p>
                </div>
                <p className="text-3xl font-bold text-slate-900">{totalVisitors}</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="w-5 h-5 text-emerald-600" />
                  <p className="text-sm text-slate-500">Humans</p>
                </div>
                <p className="text-3xl font-bold text-emerald-600">{humanCount}</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Bot className="w-5 h-5 text-amber-600" />
                  <p className="text-sm text-slate-500">Bots</p>
                </div>
                <p className="text-3xl font-bold text-amber-600">{botCount}</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                  <p className="text-sm text-slate-500">Human Rate</p>
                </div>
                <p className="text-3xl font-bold text-purple-600">{humanRate}%</p>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  Traffic Trends ({getTimeRangeLabel()})
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="humans" stroke="#10b981" strokeWidth={2} name="Humans" />
                    <Line type="monotone" dataKey="bots" stroke="#f59e0b" strokeWidth={2} name="Bots" />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  Classification Breakdown ({getTimeRangeLabel()})
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={classificationData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {classificationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Recent Activity ({getTimeRangeLabel()})
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Showing {filteredVisitors.length} visitor{filteredVisitors.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={visitorFilter === 'all' ? 'default' : 'outline'}
                    onClick={() => setVisitorFilter('all')}
                    className={visitorFilter === 'all' ? 'bg-slate-900' : ''}
                  >
                    All ({totalVisitors})
                  </Button>
                  <Button
                    size="sm"
                    variant={visitorFilter === 'human' ? 'default' : 'outline'}
                    onClick={() => setVisitorFilter('human')}
                    className={visitorFilter === 'human' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                  >
                    <Users className="w-3 h-3 mr-1" />
                    Humans ({humanCount})
                  </Button>
                  <Button
                    size="sm"
                    variant={visitorFilter === 'bot' ? 'default' : 'outline'}
                    onClick={() => setVisitorFilter('bot')}
                    className={visitorFilter === 'bot' ? 'bg-amber-600 hover:bg-amber-700' : ''}
                  >
                    <Bot className="w-3 h-3 mr-1" />
                    Bots ({botCount})
                  </Button>
                </div>
              </div>
              {filteredVisitors.length > 0 ? (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {filteredVisitors.map((visitor) => (
                    <div key={visitor.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          visitor.classification === 'HUMAN' ? 'bg-emerald-100' : 'bg-amber-100'
                        }`}>
                          {visitor.classification === 'HUMAN' ? (
                            <Users className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Bot className="w-4 h-4 text-amber-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">
                            {visitor.country || 'Unknown'} • {visitor.city || 'Unknown'}
                          </p>
                          <p className="text-sm text-slate-500">
                            {visitor.browser || 'Unknown'} • {visitor.device || 'Unknown'}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-slate-400">
                        {new Date(visitor.created_date).toLocaleTimeString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  {visitorFilter === 'human' ? (
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  ) : visitorFilter === 'bot' ? (
                    <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  ) : (
                    <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  )}
                  <p>
                    {visitorFilter === 'all' 
                      ? 'No visitor data yet' 
                      : `No ${visitorFilter === 'human' ? 'human' : 'bot'} visitors yet`}
                  </p>
                  {visitorFilter === 'all' && (
                    <p className="text-sm mt-2">Start using your redirect links to see analytics here</p>
                  )}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Hosted Links Tab */}
          <TabsContent value="links">
            <HostedLinksManager apiUser={apiUser} />
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <ProfileSettings apiUser={apiUser} />
          </TabsContent>

          {/* Integration Tab */}
          <TabsContent value="integration">
            <IntegrationScript apiUser={apiUser} />
          </TabsContent>

          {/* Forum Tab */}
        </Tabs>
      </div>

      {/* Floating Chat Widget */}
      <ChatWidget />
    </div>
  );
}