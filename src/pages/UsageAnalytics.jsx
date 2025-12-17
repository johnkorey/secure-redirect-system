import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, Activity, Clock, Filter, Bot, UserCheck, RefreshCw } from 'lucide-react';

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];

export default function UsageAnalytics() {
  const [classificationFilter, setClassificationFilter] = useState('all');
  
  // Fetch aggregated summary stats (single efficient query)
  const { data: summary = { total: 0, humans: 0, bots: 0, humanRate: 0 }, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['admin-analytics-summary'],
    queryFn: () => base44.entities.AdminAnalytics.getSummary(),
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    staleTime: 25000,
  });

  // Fetch daily chart data (7 rows max)
  const { data: dailyData = [], isLoading: dailyLoading, refetch: refetchDaily } = useQuery({
    queryKey: ['admin-analytics-daily'],
    queryFn: () => base44.entities.AdminAnalytics.getDaily(),
    refetchInterval: 30000,
    staleTime: 25000,
  });

  // Fetch top users (10 rows max)
  const { data: topUsers = [], isLoading: topUsersLoading, refetch: refetchTopUsers } = useQuery({
    queryKey: ['admin-analytics-top-users'],
    queryFn: () => base44.entities.AdminAnalytics.getTopUsers(),
    refetchInterval: 30000,
    staleTime: 25000,
  });

  // Fetch API users for active count
  const { data: apiUsers = [] } = useQuery({
    queryKey: ['api-users'],
    queryFn: () => base44.entities.APIUser.list(),
    refetchInterval: 60000,
  });

  // Filter daily data based on classification (for the chart visualization)
  const filteredDailyData = dailyData.map(day => {
    if (classificationFilter === 'all') {
      return day;
    } else if (classificationFilter === 'HUMAN') {
      return { ...day, total: day.humans, bots: 0 };
    } else {
      return { ...day, total: day.bots, humans: 0 };
    }
  });

  // Calculate filtered totals
  const filteredTotal = classificationFilter === 'all' 
    ? summary.total 
    : classificationFilter === 'HUMAN' 
      ? summary.humans 
      : summary.bots;

  // Classification breakdown for pie chart
  const outcomeData = [
    { name: 'Humans', value: summary.humans },
    { name: 'Bots', value: summary.bots }
  ];

  const isLoading = summaryLoading || dailyLoading || topUsersLoading;

  const handleRefresh = () => {
    refetchSummary();
    refetchDaily();
    refetchTopUsers();
  };

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
            {isLoading && (
              <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />
            )}
          </div>
          <p className="text-slate-500">
            7-day API usage statistics • Auto-refreshes every 30s
            {summary.cachedAt && (
              <span className="ml-2 text-xs text-slate-400">
                (cached)
              </span>
            )}
          </p>
        </div>
        
        {/* Classification Filter */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="mr-2"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
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
              All ({summary.total.toLocaleString()})
            </Button>
            <Button
              variant={classificationFilter === 'HUMAN' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setClassificationFilter('HUMAN')}
              className={`rounded-none border-x border-slate-200 ${classificationFilter === 'HUMAN' ? 'bg-emerald-600 text-white' : ''}`}
            >
              <UserCheck className="w-4 h-4 mr-1" />
              Humans ({summary.humans.toLocaleString()})
            </Button>
            <Button
              variant={classificationFilter === 'BOT' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setClassificationFilter('BOT')}
              className={`rounded-none ${classificationFilter === 'BOT' ? 'bg-amber-600 text-white' : ''}`}
            >
              <Bot className="w-4 h-4 mr-1" />
              Bots ({summary.bots.toLocaleString()})
            </Button>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <p className="text-sm text-slate-500">Total Requests (7d)</p>
          </div>
          <p className="text-3xl font-bold text-slate-900">{filteredTotal.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-2">
            {classificationFilter !== 'all' && `Showing ${classificationFilter.toLowerCase()}s only`}
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
          <p className="text-3xl font-bold text-slate-900">45ms</p>
          <p className="text-xs text-emerald-600 mt-2">
            Fast classification
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <p className="text-sm text-slate-500">Human Detection Rate</p>
          </div>
          <p className="text-3xl font-bold text-slate-900">
            {summary.humanRate || 0}%
          </p>
          <p className="text-xs text-slate-500 mt-2">Accuracy metric</p>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Requests */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Daily Requests (7 Days)</h3>
          {dailyLoading ? (
            <div className="flex items-center justify-center h-[300px]">
              <RefreshCw className="w-8 h-8 text-slate-300 animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={filteredDailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip />
                <Legend />
                <Bar dataKey="humans" fill="#10b981" name="Humans" />
                <Bar dataKey="bots" fill="#f59e0b" name="Bots" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Classification Breakdown */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Classification Breakdown (7 Days)</h3>
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
              <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} name="Total Requests" />
              <Line type="monotone" dataKey="humans" stroke="#10b981" strokeWidth={2} name="Humans" />
              <Line type="monotone" dataKey="bots" stroke="#f59e0b" strokeWidth={2} name="Bots" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Top Users */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Top API Users
            <span className="text-sm font-normal text-slate-500 ml-2">
              (Human vs Bot Visits - 7 Days)
            </span>
          </h3>
          {topUsersLoading ? (
            <div className="flex items-center justify-center h-[350px]">
              <RefreshCw className="w-8 h-8 text-slate-300 animate-spin" />
            </div>
          ) : topUsers.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart 
                  data={topUsers} 
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
              
              {/* Data table for clarity */}
              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="grid grid-cols-4 gap-2 text-xs font-medium text-slate-500 mb-2">
                  <div>User</div>
                  <div className="text-emerald-600">Humans</div>
                  <div className="text-amber-600">Bots</div>
                  <div>Total</div>
                </div>
                {topUsers.map((user, idx) => (
                  <div key={idx} className="grid grid-cols-4 gap-2 text-sm py-1 border-b border-slate-100">
                    <div className="font-medium text-slate-700 truncate">{user.name}</div>
                    <div className="text-emerald-600 font-semibold">{user.humans.toLocaleString()}</div>
                    <div className="text-amber-600 font-semibold">{user.bots.toLocaleString()}</div>
                    <div className="text-slate-500">{user.total.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-slate-400">
              <div className="text-center">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No user activity yet</p>
                <p className="text-sm mt-1">Data will appear once users start generating traffic</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
