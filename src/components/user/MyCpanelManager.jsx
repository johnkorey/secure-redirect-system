import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Server, RefreshCw, Eye, EyeOff, Trash2, Globe, Plus, Check, X } from "lucide-react";

const API_BASE = '';

async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  return response.json();
}

export default function MyCpanelManager() {
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [configForm, setConfigForm] = useState({
    host: '',
    username: '',
    password: ''
  });

  // Fetch user's cPanel configs
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['my-cpanels'],
    queryFn: () => apiFetch('/api/cpanel/my-cpanels'),
  });

  const configs = configData?.configs || [];

  // Fetch user's cPanel domains
  const { data: domains = [], isLoading: domainsLoading } = useQuery({
    queryKey: ['my-cpanel-domains'],
    queryFn: () => apiFetch('/api/cpanel/my-cpanel-domains'),
  });

  // Add cPanel mutation
  const addMutation = useMutation({
    mutationFn: (data) => apiFetch('/api/cpanel/my-cpanels', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-cpanels'] });
      toast.success('cPanel added successfully');
      setConfigForm({ host: '', username: '', password: '' });
      setShowAddDialog(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Test connection mutation
  const testMutation = useMutation({
    mutationFn: (configId) => apiFetch(`/api/cpanel/my-cpanels/${configId}/test`, { method: 'POST' }),
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Connection successful!');
        queryClient.invalidateQueries({ queryKey: ['my-cpanels'] });
      } else {
        toast.error(data.message || 'Connection failed');
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Fetch domains mutation
  const fetchDomainsMutation = useMutation({
    mutationFn: (configId) => apiFetch(`/api/cpanel/my-cpanels/${configId}/fetch-domains`, { method: 'POST' }),
    onSuccess: (data) => {
      toast.success(`Fetched ${data.count} domains`);
      queryClient.invalidateQueries({ queryKey: ['my-cpanel-domains'] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Delete cPanel mutation
  const deleteMutation = useMutation({
    mutationFn: (configId) => apiFetch(`/api/cpanel/my-cpanels/${configId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-cpanels'] });
      queryClient.invalidateQueries({ queryKey: ['my-cpanel-domains'] });
      toast.success('cPanel removed');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleAddCpanel = (e) => {
    e.preventDefault();
    if (!configForm.host || !configForm.username || !configForm.password) {
      toast.error('All fields are required');
      return;
    }
    addMutation.mutate(configForm);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          My cPanel Accounts
        </CardTitle>
        <CardDescription>
          Add your own cPanel accounts for unlimited deployments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add cPanel Button */}
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-500">
            Deploy unlimited redirects to your own cPanels - no daily limits!
          </p>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add cPanel
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Your cPanel</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddCpanel} className="space-y-4">
                <div>
                  <Label htmlFor="host">cPanel Host</Label>
                  <Input
                    id="host"
                    placeholder="server.example.com:2083"
                    value={configForm.host}
                    onChange={(e) => setConfigForm({ ...configForm, host: e.target.value })}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Include port 2083 for cPanel or 2087 for WHM
                  </p>
                </div>
                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    placeholder="cpanel_username"
                    value={configForm.username}
                    onChange={(e) => setConfigForm({ ...configForm, username: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter cPanel password"
                      value={configForm.password}
                      onChange={(e) => setConfigForm({ ...configForm, password: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <Button type="submit" disabled={addMutation.isPending} className="w-full">
                  {addMutation.isPending ? 'Adding...' : 'Add cPanel'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* cPanel List */}
        {configLoading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : configs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Server className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No cPanels added yet</p>
            <p className="text-sm">Add your own cPanel for unlimited deployments</p>
          </div>
        ) : (
          <div className="space-y-4">
            {configs.map((config) => (
              <div key={config.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-blue-500" />
                    <span className="font-mono font-medium">{config.host}</span>
                    <Badge variant={config.is_active ? 'default' : 'secondary'}>
                      {config.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testMutation.mutate(config.id)}
                      disabled={testMutation.isPending}
                    >
                      <RefreshCw className={`h-4 w-4 mr-1 ${testMutation.isPending ? 'animate-spin' : ''}`} />
                      Test
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fetchDomainsMutation.mutate(config.id)}
                      disabled={fetchDomainsMutation.isPending}
                    >
                      <Globe className={`h-4 w-4 mr-1 ${fetchDomainsMutation.isPending ? 'animate-spin' : ''}`} />
                      Fetch Domains
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove cPanel?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove the cPanel configuration for {config.host} and all its domains.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(config.id)}>
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                  <div>
                    <span className="text-gray-400">Username:</span>
                    <span className="ml-2 font-mono">{config.username}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Last Verified:</span>
                    <span className="ml-2">
                      {config.last_verified_at
                        ? new Date(config.last_verified_at).toLocaleString()
                        : 'Never'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Domains from user's cPanels */}
        {domains.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-medium mb-3">My Domains ({domains.length})</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>cPanel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map((domain) => (
                  <TableRow key={domain.id}>
                    <TableCell className="font-mono">{domain.domain}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{domain.domain_type || 'unknown'}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-gray-500">
                      {domain.cpanel_host}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
