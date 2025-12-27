import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Bot, List, RefreshCw, Calendar } from 'lucide-react';
import VisitorTable from '../components/visitors/VisitorTable';
import { motion } from 'framer-motion';

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

export default function VisitorLogs() {
  const [filter, setFilter] = useState('all');
  const [timeRange, setTimeRange] = useState('7d');

  const { data: allVisitors = [], isLoading, error, refetch } = useQuery({
    queryKey: ['visitor-logs', timeRange],
    queryFn: () => base44.entities.VisitorLog.listByTimeRange(timeRange, 5000),
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  const getTimeRangeLabel = () => {
    switch (timeRange) {
      case '24h': return 'Last 24 Hours';
      case '7d': return 'Last 7 Days';
      case '30d': return 'Last 30 Days';
      case '90d': return 'Last 90 Days';
      case 'all': return 'All Time';
      default: return 'Last 7 Days';
    }
  };

  const filteredVisitors = filter === 'all' 
    ? allVisitors 
    : allVisitors.filter(v => v.classification === filter.toUpperCase());

  const humanCount = allVisitors.filter(v => v.classification === 'HUMAN').length;
  const botCount = allVisitors.filter(v => v.classification === 'BOT').length;

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-2xl shadow-lg max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Connection Error</h2>
          <p className="text-slate-600 mb-4">Cannot connect to backend server.</p>
          <p className="text-sm text-slate-500">Make sure the backend is running at:</p>
          <code className="block mt-2 p-2 bg-slate-100 rounded text-sm">{BACKEND_URL}</code>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">Visitor Logs</h1>
              <p className="text-lg text-slate-500">Monitor all redirect traffic and classifications • {getTimeRangeLabel()}</p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-40 bg-white">
                  <Calendar className="w-4 h-4 mr-2 text-slate-500" />
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
              <Button
                variant="outline"
                onClick={() => refetch()}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <List className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Total Visitors</p>
                  <p className="text-2xl font-bold text-slate-900">{allVisitors.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Users className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-emerald-700">Human Visitors</p>
                  <p className="text-2xl font-bold text-emerald-900">{humanCount}</p>
                </div>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Bot className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-amber-700">Detected Bots</p>
                  <p className="text-2xl font-bold text-amber-900">{botCount}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <Tabs value={filter} onValueChange={setFilter} className="mb-6">
            <TabsList className="bg-slate-100">
              <TabsTrigger value="all" className="flex items-center gap-2">
                <List className="w-4 h-4" />
                All ({allVisitors.length})
              </TabsTrigger>
              <TabsTrigger value="human" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Humans ({humanCount})
              </TabsTrigger>
              <TabsTrigger value="bot" className="flex items-center gap-2">
                <Bot className="w-4 h-4" />
                Bots ({botCount})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </motion.div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <VisitorTable visitors={filteredVisitors} isLoading={isLoading} />
        </motion.div>

        {/* Info Note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl"
        >
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Use the time range selector to view up to 90 days of history. Logs auto-refresh every 10 seconds.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
