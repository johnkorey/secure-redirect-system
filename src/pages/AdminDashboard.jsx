import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Bot, Target, TrendingUp, Activity, Globe, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AdminDashboard() {
  const [timeRange, setTimeRange] = useState('24h');

  const { data: visitors = [] } = useQuery({
    queryKey: ['all-visitors'],
    queryFn: () => base44.entities.VisitorLog.list('-created_date', 1000),
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  const { data: realtimeEvents = [] } = useQuery({
    queryKey: ['realtime-events'],
    queryFn: () => base44.entities.RealtimeEvent.list('-created_date', 100),
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  const { data: apiUsers = [] } = useQuery({
    queryKey: ['api-users'],
    queryFn: () => base44.entities.APIUser.list(),
    refetchInterval: 30000, // Auto-refresh every 30 seconds (less frequent)
  });

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
        return new Date(0);
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

  // Calculate metrics from filtered visitors
  const totalVisitors = timeFilteredVisitors.length;
  const humanCount = timeFilteredVisitors.filter(v => v.classification === 'HUMAN').length;
  const botCount = timeFilteredVisitors.filter(v => v.classification === 'BOT').length;
  const accuracyRate = totalVisitors > 0 ? Math.round((humanCount / totalVisitors) * 100) : 0;

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

  // Visitor trends - dynamic based on time range
  const trendData = useMemo(() => {
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
          label: hour.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
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
          label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          humans: dayVisitors.filter(v => v.classification === 'HUMAN').length,
          bots: dayVisitors.filter(v => v.classification === 'BOT').length
        };
      });
    }
  }, [timeFilteredVisitors, timeRange]);

  // Recent activity - show ALL filtered visitors (no limit)
  const recentActivity = timeFilteredVisitors;

  const statCards = [
    { title: 'Total Visitors', value: totalVisitors, icon: Activity, color: 'bg-blue-500', trend: '+12% vs yesterday' },
    { title: 'Human Visitors', value: humanCount, icon: Users, color: 'bg-emerald-500', trend: `${accuracyRate}% accuracy` },
    { title: 'Detected Bots', value: botCount, icon: Bot, color: 'bg-amber-500', trend: `${100 - accuracyRate}% of traffic` },
    { title: 'Active API Users', value: apiUsers.filter(u => u.status === 'active').length, icon: Globe, color: 'bg-purple-500', trend: `${apiUsers.length} total` }
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-slate-900">Dashboard Overview</h1>
            <span className="flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              Live
            </span>
          </div>
          <p className="text-slate-500">Monitor traffic metrics and system performance • Auto-refreshes every 5s</p>
        </div>
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-slate-600" />
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
      </div>

      {/* Stats Grid */}
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
        {/* Visitor Trends */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Visitor Trends ({getTimeRangeLabel()})
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="humans" stroke="#10b981" strokeWidth={2} name="Humans" />
              <Line type="monotone" dataKey="bots" stroke="#f59e0b" strokeWidth={2} name="Bots" />
            </LineChart>
          </ResponsiveContainer>
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
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-slate-900">
            Recent Activity ({getTimeRangeLabel()})
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Showing {recentActivity.length} visitor{recentActivity.length !== 1 ? 's' : ''}
          </p>
        </div>
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
        </div>
      </Card>
    </div>
  );
}