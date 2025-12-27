import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Users, Bot, Target, TrendingUp, Activity, Globe, Calendar, RefreshCw, UserCheck, Filter } from 'lucide-react';
import { motion } from 'framer-motion';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AdminDashboard() {
  const [timeRange, setTimeRange] = useState('24h');
  const [visitorTypeFilter, setVisitorTypeFilter] = useState('all');
  const [page, setPage] = useState(1);

  // Fetch aggregated summary stats (ALL TIME - single efficient query)
  const { data: summary = { total: 0, humans: 0, bots: 0, humanRate: 0, activeUsers: 0 }, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['admin-analytics-summary'],
    queryFn: () => base44.entities.AdminAnalytics.getSummary(),
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    staleTime: 25000,
  });

  // Fetch daily chart data (7 days - for charts)
  const { data: dailyData = [], isLoading: dailyLoading, refetch: refetchDaily } = useQuery({
    queryKey: ['admin-analytics-daily'],
    queryFn: () => base44.entities.AdminAnalytics.getDaily(),
    refetchInterval: 30000,
    staleTime: 25000,
  });

  // Fetch recent activity (paginated, max 5000 records)
  const { data: recentData = { data: [], pagination: {} }, isLoading: recentLoading, refetch: refetchRecent } = useQuery({
    queryKey: ['admin-analytics-recent', page, 100, visitorTypeFilter, timeRange],
    queryFn: () => base44.entities.AdminAnalytics.getRecent(page, 100, visitorTypeFilter, timeRange),
    refetchInterval: 5000, // More frequent for recent activity
    staleTime: 4000,
  });

  const { data: realtimeEvents = [] } = useQuery({
    queryKey: ['realtime-events'],
    queryFn: () => base44.entities.RealtimeEvent.list('-created_date', 100),
    refetchInterval: 5000,
  });

  const { data: apiUsers = [] } = useQuery({
    queryKey: ['api-users'],
    queryFn: () => base44.entities.APIUser.list(),
    refetchInterval: 30000,
  });

  const isLoading = summaryLoading || dailyLoading || recentLoading;

  // Get time range label
  const getTimeRangeLabel = () => {
    switch (timeRange) {
      case '24h': return 'Last 24 Hours';
      case '7d': return 'Last 7 Days';
      case '30d': return 'Last 30 Days';
      case 'all': return 'All Time';
      default: return 'Last 24 Hours';
    }
  };

  // Detection methods breakdown
  const detectionMethods = realtimeEvents.reduce((acc, event) => {
    const method = event.detection_method || 'Unknown';
    acc[method] = (acc[method] || 0) + 1;
    return acc;
  }, {});

  const detectionData = Object.entries(detectionMethods).map(([name, value]) => ({
    name,
    value
  }));

  // Transform daily data for chart display
  const trendData = useMemo(() => {
    if (timeRange === '24h') {
      // For 24h, use the most recent daily data point or show hourly breakdown from recent activity
      return dailyData.slice(-1).map(d => ({
        label: 'Today',
        humans: d.humans,
        bots: d.bots
      }));
    }
    return dailyData.map(d => ({
      label: d.date,
      humans: d.humans,
      bots: d.bots
    }));
  }, [dailyData, timeRange]);

  const handleRefresh = () => {
    refetchSummary();
    refetchDaily();
    refetchRecent();
  };

  // Summary stats (ALL TIME - from aggregated endpoint)
  const totalVisitors = summary.total;
  const humanCount = summary.humans;
  const botCount = summary.bots;
  const accuracyRate = summary.humanRate;

  const statCards = [
    { title: 'Total Visitors', value: totalVisitors, icon: Activity, color: 'bg-blue-500', trend: 'All time', subtitle: 'all-time' },
    { title: 'Human Visitors', value: humanCount, icon: UserCheck, color: 'bg-emerald-500', trend: `${accuracyRate}% accuracy`, subtitle: 'all-time' },
    { title: 'Detected Bots', value: botCount, icon: Bot, color: 'bg-amber-500', trend: `${100 - accuracyRate}% of traffic`, subtitle: 'all-time' },
    { title: 'Active API Users', value: summary.activeUsers || apiUsers.filter(u => u.status === 'active').length, icon: Globe, color: 'bg-purple-500', trend: `${apiUsers.length} total`, subtitle: '' }
  ];

  const recentActivity = recentData.data || [];
  const pagination = recentData.pagination || {};

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-slate-900">Dashboard Overview</h1>
            <span className="flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              Live
            </span>
            {isLoading && (
              <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />
            )}
          </div>
          <p className="text-slate-500">Monitor traffic metrics and system performance • Auto-refreshes every 5s</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Grid - ALL TIME totals */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-xl ${stat.color} text-white`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  {stat.subtitle && (
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">
                      {stat.subtitle}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-slate-500 mb-1">{stat.title}</p>
                <p className="text-3xl font-bold text-slate-900 mb-2">{stat.value.toLocaleString()}</p>
                <p className="text-xs text-emerald-600 font-medium">{stat.trend}</p>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Visitor Trends (7 Days) */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Visitor Trends (Last 7 Days)
          </h3>
          {dailyLoading ? (
            <div className="flex items-center justify-center h-[300px]">
              <RefreshCw className="w-8 h-8 text-slate-300 animate-spin" />
            </div>
          ) : (
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
          )}
        </Card>

        {/* Detection Methods */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Detection Methods</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={detectionData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {detectionData.map((entry, index) => (
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Recent Activity ({getTimeRangeLabel()})
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Showing {recentActivity.length} of {pagination.total?.toLocaleString() || 0} visitors
              {pagination.total > 5000 && <span className="text-amber-600 ml-1">(max 5,000 displayed)</span>}
            </p>
          </div>
          
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <Select value={visitorTypeFilter} onValueChange={(v) => { setVisitorTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Visitors</SelectItem>
                  <SelectItem value="HUMAN">Humans Only</SelectItem>
                  <SelectItem value="BOT">Bots Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <Select value={timeRange} onValueChange={(v) => { setTimeRange(v); setPage(1); }}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24 Hours</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        
        {recentLoading ? (
          <div className="flex items-center justify-center h-[200px]">
            <RefreshCw className="w-8 h-8 text-slate-300 animate-spin" />
          </div>
        ) : (
          <>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {recentActivity.map((visitor) => (
                <div key={visitor.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full ${visitor.classification === 'HUMAN' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <div>
                      <p className="font-medium text-slate-900">
                        {visitor.ip_address || 'Unknown IP'} • {visitor.country || 'Unknown'}
                      </p>
                      <p className="text-sm text-slate-500">
                        {visitor.browser} on {visitor.device} • ISP: {visitor.isp || 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      visitor.classification === 'HUMAN' 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {visitor.classification}
                    </span>
                    <span className="text-sm text-slate-400">
                      {new Date(visitor.created_date).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
              {recentActivity.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No visitors found for this time range</p>
                </div>
              )}
            </div>
            
            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
                <p className="text-sm text-slate-500">
                  Page {pagination.page} of {pagination.pages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                    disabled={page >= pagination.pages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
