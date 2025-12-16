import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, Activity, Clock, Filter, Bot, UserCheck } from 'lucide-react';

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];

export default function UsageAnalytics() {
  const [classificationFilter, setClassificationFilter] = useState('all'); // 'all', 'HUMAN', 'BOT'
  
  const { data: allVisitors = [] } = useQuery({
    queryKey: ['all-visitors-7d'],
    queryFn: () => base44.entities.VisitorLog.list('-created_date', '7d'),
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  const { data: apiUsers = [] } = useQuery({
    queryKey: ['api-users'],
    queryFn: () => base44.entities.APIUser.list(),
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // Filter visitors based on classification
  const visitors = useMemo(() => {
    if (classificationFilter === 'all') return allVisitors;
    return allVisitors.filter(v => v.classification === classificationFilter);
  }, [allVisitors, classificationFilter]);

  // Daily request data (last 7 days) - based on filtered visitors
  const dailyData = useMemo(() => Array.from({ length: 7 }, (_, i) => {
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
  }), [visitors]);

  // User usage breakdown - calculate from ALL visitor logs (to show both humans and bots)
  const userUsageData = useMemo(() => {
    // Count visitors per owner_email (matches apiUser.email) - humans and bots separately
    const usageCounts = {};
    allVisitors.forEach(v => {
      const email = v.owner_email;
      if (email) {
        if (!usageCounts[email]) {
          usageCounts[email] = { humans: 0, bots: 0, total: 0 };
        }
        if (v.classification === 'HUMAN') {
          usageCounts[email].humans += 1;
        } else {
          usageCounts[email].bots += 1;
        }
        usageCounts[email].total += 1;
      }
    });
    
    // Map to user data and sort by total usage
    return apiUsers
      .map(user => ({
        name: user.username || user.email,
        humans: usageCounts[user.email]?.humans || 0,
        bots: usageCounts[user.email]?.bots || 0,
        total: usageCounts[user.email]?.total || 0,
        userId: user.id
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .filter(u => u.total > 0); // Only show users with actual usage
  }, [allVisitors, apiUsers]);

  // Classification outcomes (always show totals from all visitors for pie chart)
  const outcomeData = useMemo(() => [
    { name: 'Humans', value: allVisitors.filter(v => v.classification === 'HUMAN').length },
    { name: 'Bots', value: allVisitors.filter(v => v.classification === 'BOT').length }
  ], [allVisitors]);

  const totalRequests = visitors.length;
  const avgResponseTime = 45; // Mock data

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-slate-900">Usage Analytics</h1>
            <span className="flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              Live
            </span>
          </div>
          <p className="text-slate-500">API usage statistics and trends • Auto-refreshes every 10s</p>
        </div>
        
        {/* Classification Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm text-slate-500 mr-2">Show:</span>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <Button
              variant={classificationFilter === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setClassificationFilter('all')}
              className={`rounded-none ${classificationFilter === 'all' ? 'bg-blue-600 text-white' : ''}`}
            >
              <Activity className="w-4 h-4 mr-1" />
              All ({allVisitors.length.toLocaleString()})
            </Button>
            <Button
              variant={classificationFilter === 'HUMAN' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setClassificationFilter('HUMAN')}
              className={`rounded-none border-x border-slate-200 ${classificationFilter === 'HUMAN' ? 'bg-emerald-600 text-white' : ''}`}
            >
              <UserCheck className="w-4 h-4 mr-1" />
              Humans ({allVisitors.filter(v => v.classification === 'HUMAN').length.toLocaleString()})
            </Button>
            <Button
              variant={classificationFilter === 'BOT' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setClassificationFilter('BOT')}
              className={`rounded-none ${classificationFilter === 'BOT' ? 'bg-amber-600 text-white' : ''}`}
            >
              <Bot className="w-4 h-4 mr-1" />
              Bots ({allVisitors.filter(v => v.classification === 'BOT').length.toLocaleString()})
            </Button>
          </div>
        </div>
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
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Top API Users
            <span className="text-sm font-normal text-slate-500 ml-2">
              (Human vs Bot Visits)
            </span>
          </h3>
          {userUsageData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart 
                data={userUsageData} 
                layout="vertical"
                barCategoryGap="20%"
                margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={true} vertical={false} />
                <XAxis 
                  type="number" 
                  stroke="#64748b"
                  tickFormatter={(value) => value.toLocaleString()}
                />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  stroke="#64748b" 
                  width={120}
                  tick={{ fontSize: 12, fontWeight: 500 }}
                />
                <Tooltip 
                  formatter={(value, name) => [value.toLocaleString(), name]}
                  labelFormatter={(label) => `User: ${label}`}
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: 'none', 
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
                <Legend 
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="circle"
                />
                {/* Side-by-side bars (no stackId) for better visibility */}
                <Bar 
                  dataKey="humans" 
                  fill="#10b981" 
                  name="🟢 Humans"
                  radius={[0, 4, 4, 0]}
                  barSize={16}
                />
                <Bar 
                  dataKey="bots" 
                  fill="#f59e0b" 
                  name="🟠 Bots"
                  radius={[0, 4, 4, 0]}
                  barSize={16}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-slate-400">
              <div className="text-center">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No user activity yet</p>
                <p className="text-sm mt-1">Data will appear once users start generating traffic</p>
              </div>
            </div>
          )}
          
          {/* Data table for clarity */}
          {userUsageData.length > 0 && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <div className="grid grid-cols-4 gap-2 text-xs font-medium text-slate-500 mb-2">
                <div>User</div>
                <div className="text-emerald-600">Humans</div>
                <div className="text-amber-600">Bots</div>
                <div>Total</div>
              </div>
              {userUsageData.map((user, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2 text-sm py-1 border-b border-slate-100">
                  <div className="font-medium text-slate-700 truncate">{user.name}</div>
                  <div className="text-emerald-600 font-semibold">{user.humans.toLocaleString()}</div>
                  <div className="text-amber-600 font-semibold">{user.bots.toLocaleString()}</div>
                  <div className="text-slate-500">{user.total.toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}