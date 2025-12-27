import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Database, Trash2, RefreshCw, TrendingUp, Zap } from 'lucide-react';
import { toast } from 'sonner';

// API helper
const apiFetch = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
};

export default function IPCacheManager() {
  const queryClient = useQueryClient();

  // Fetch cache stats
  const { data: stats } = useQuery({
    queryKey: ['ip-cache-stats'],
    queryFn: () => apiFetch('/api/ip-cache/stats'),
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch cached IPs
  const { data: cachedData } = useQuery({
    queryKey: ['ip-cache-list'],
    queryFn: () => apiFetch('/api/ip-cache/list?limit=50'),
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Clear cache mutation
  const clearCacheMutation = useMutation({
    mutationFn: () => apiFetch('/api/ip-cache/clear', { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ip-cache-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ip-cache-list'] });
      toast.success(`Cache cleared! Removed ${data.clearedCount} IPs`);
    },
    onError: (error) => {
      toast.error('Failed to clear cache: ' + error.message);
    }
  });

  // Remove specific IP
  const removeIPMutation = useMutation({
    mutationFn: (ip) => apiFetch(`/api/ip-cache/${ip}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-cache-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ip-cache-list'] });
      toast.success('IP removed from cache');
    },
    onError: (error) => {
      toast.error('Failed to remove IP: ' + error.message);
    }
  });

  const handleClearCache = () => {
    if (confirm('Are you sure you want to clear the entire IP cache? This will increase API usage temporarily.')) {
      clearCacheMutation.mutate();
    }
  };

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <Card className="p-4 bg-emerald-50 border-emerald-200">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-emerald-600 mt-0.5" />
          <div>
            <p className="font-medium text-emerald-900">IP Classification Cache</p>
            <p className="text-sm text-emerald-700 mt-1">
              BOT IPs are cached permanently to reduce external API calls. HUMAN IPs are never cached.
              This significantly reduces IP2Location API usage and speeds up bot detection.
            </p>
          </div>
        </div>
      </Card>

      {/* Cache Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-center gap-3">
            <Database className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-sm text-blue-700 font-medium">Cached IPs</p>
              <p className="text-2xl font-bold text-blue-900">{stats?.totalCachedIPs || 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <div className="flex items-center gap-3">
            <Zap className="w-8 h-8 text-emerald-600" />
            <div>
              <p className="text-sm text-emerald-700 font-medium">API Calls Saved</p>
              <p className="text-2xl font-bold text-emerald-900">{stats?.apiCallsSaved || 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-purple-600" />
            <div>
              <p className="text-sm text-purple-700 font-medium">Cache Hit Rate</p>
              <p className="text-2xl font-bold text-purple-900">{stats?.hitRate || '0%'}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-8 h-8 text-amber-600" />
            <div>
              <p className="text-sm text-amber-700 font-medium">Cache Misses</p>
              <p className="text-2xl font-bold text-amber-900">{stats?.cacheMisses || 0}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Cached Bot IPs</h3>
          <p className="text-sm text-slate-500">
            {cachedData?.total || 0} IPs cached • Showing top 50 by hit count
          </p>
        </div>
        <Button
          onClick={handleClearCache}
          variant="destructive"
          disabled={clearCacheMutation.isPending}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Clear All Cache
        </Button>
      </div>

      {/* Cached IPs Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">IP Address</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Country</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">ISP</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Hit Count</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Cached Since</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {cachedData?.cached && cachedData.cached.length > 0 ? (
                cachedData.cached.map((entry) => (
                  <tr key={entry.ip} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <code className="text-sm font-mono bg-slate-100 px-2 py-1 rounded">
                        {entry.ip}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {entry.clientInfo?.country || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {entry.clientInfo?.isp || 'Unknown'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">
                        {entry.reason}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-emerald-600">
                        {entry.hit_count || 1}x
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(entry.cached_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Remove ${entry.ip} from cache?`)) {
                            removeIPMutation.mutate(entry.ip);
                          }
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                    No cached IPs yet. Bot IPs will be cached automatically on first visit.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Benefits Info */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <h4 className="font-medium text-blue-900 mb-2">💡 How IP Caching Saves API Calls</h4>
        <div className="text-sm text-blue-700 space-y-2">
          <p>
            <strong>✓ BOT IPs are cached permanently:</strong> Once an IP is classified as a bot (datacenter, proxy, VPN), 
            it's cached forever. Future visits from the same IP skip the external API call entirely.
          </p>
          <p>
            <strong>✗ HUMAN IPs are NOT cached:</strong> Human classifications are never cached because residential IPs 
            can change users, move, or have different behaviors over time.
          </p>
          <p>
            <strong>💰 Cost savings:</strong> If a bot visits 100 times, you only pay for 1 API call instead of 100!
          </p>
          <p>
            <strong>⚡ Performance:</strong> Cached lookups are instant (no network delay), making redirects faster.
          </p>
        </div>
      </Card>
    </div>
  );
}

