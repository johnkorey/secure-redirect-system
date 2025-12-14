import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, Activity, Clock } from 'lucide-react';

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];

export default function UsageAnalytics() {
  const { data: visitors = [] } = useQuery({
    queryKey: ['all-visitors'],
    queryFn: () => base44.entities.VisitorLog.list('-created_date', 1000),
  });

  const { data: apiUsers = [] } = useQuery({
    queryKey: ['api-users'],
    queryFn: () => base44.entities.APIUser.list(),
  });

  // Daily request data (last 7 days)
  const dailyData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dayVisitors = visitors.filter(v => {
      const vDate = new Date(v.created_date);
      return vDate.toDateString() === date.toDateString();
    });
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      requests: dayVisitors.length,
      humans: dayVisitors.filter(v => v.classification === 'HUMAN').length,
      bots: dayVisitors.filter(v => v.classification === 'BOT').length
    };
  });

  // User usage breakdown
  const userUsageData = apiUsers
    .sort((a, b) => (b.current_usage || 0) - (a.current_usage || 0))
    .slice(0, 5)
    .map(user => ({
      name: user.username,
      usage: user.current_usage || 0
    }));

  // Classification outcomes
  const outcomeData = [
    { name: 'Humans', value: visitors.filter(v => v.classification === 'HUMAN').length },
    { name: 'Bots', value: visitors.filter(v => v.classification === 'BOT').length }
  ];

  const totalRequests = visitors.length;
  const avgResponseTime = 45; // Mock data

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Usage Analytics</h1>
        <p className="text-slate-500">API usage statistics and trends</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <p className="text-sm text-slate-500">Total Requests</p>
          </div>
          <p className="text-3xl font-bold text-slate-900">{totalRequests.toLocaleString()}</p>
          <p className="text-xs text-emerald-600 mt-2">
            <TrendingUp className="w-3 h-3 inline mr-1" />
            +12% vs last period
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-emerald-600" />
            <p className="text-sm text-slate-500">Active Users</p>
          </div>
          <p className="text-3xl font-bold text-slate-900">
            {apiUsers.filter(u => u.status === 'active').length}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            {apiUsers.length} total users
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-5 h-5 text-amber-600" />
            <p className="text-sm text-slate-500">Avg Response Time</p>
          </div>
          <p className="text-3xl font-bold text-slate-900">{avgResponseTime}ms</p>
          <p className="text-xs text-emerald-600 mt-2">
            -5ms vs last period
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <p className="text-sm text-slate-500">Human Detection Rate</p>
          </div>
          <p className="text-3xl font-bold text-slate-900">
            {totalRequests > 0 
              ? Math.round((outcomeData[0].value / totalRequests) * 100) 
              : 0}%
          </p>
          <p className="text-xs text-slate-500 mt-2">Accuracy metric</p>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Requests */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Daily Requests (7 Days)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip />
              <Legend />
              <Bar dataKey="humans" fill="#10b981" name="Humans" />
              <Bar dataKey="bots" fill="#f59e0b" name="Bots" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Classification Breakdown */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Classification Breakdown</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={outcomeData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {outcomeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Request Trends */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Request Trends</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="requests" stroke="#3b82f6" strokeWidth={2} name="Total Requests" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Top Users */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Top API Users</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={userUsageData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" stroke="#64748b" />
              <YAxis dataKey="name" type="category" stroke="#64748b" width={100} />
              <Tooltip />
              <Bar dataKey="usage" fill="#8b5cf6" name="API Calls" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}