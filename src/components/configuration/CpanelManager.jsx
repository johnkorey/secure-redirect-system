import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Server, RefreshCw, Check, X, Eye, EyeOff, Trash2, Globe, CloudUpload, Users, Plus } from "lucide-react";

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

export default function CpanelManager() {
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [configForm, setConfigForm] = useState({
    host: '',
    username: '',
    password: ''
  });

  // Fetch ALL cPanel configs
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['cpanel-config'],
    queryFn: () => apiFetch('/api/cpanel/config'),
  });

  const configs = configData?.configs || [];

  // Fetch domains
  const { data: domains = [], isLoading: domainsLoading } = useQuery({
    queryKey: ['cpanel-domains'],
    queryFn: () => apiFetch('/api/cpanel/domains'),
  });

  // Fetch deployments
  const { data: deployments = [], isLoading: deploymentsLoading } = useQuery({
    queryKey: ['cpanel-deployments'],
    queryFn: () => apiFetch('/api/cpanel/deployments'),
  });

  // Save config mutation
  const saveConfigMutation = useMutation({
    mutationFn: (data) => apiFetch('/api/cpanel/config', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cpanel-config'] });
      toast.success('cPanel configuration saved');
      setConfigForm({ host: '', username: '', password: '' });
      setShowAddDialog(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: (configId) => apiFetch(`/api/cpanel/test/${configId}`, { method: 'POST' }),
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Connection successful!');
        queryClient.invalidateQueries({ queryKey: ['cpanel-config'] });
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
    mutationFn: (configId) => apiFetch(`/api/cpanel/fetch-domains/${configId}`, { method: 'POST' }),
    onSuccess: (data) => {
      toast.success(`Fetched ${data.count} domains from cPanel`);
      queryClient.invalidateQueries({ queryKey: ['cpanel-domains'] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Toggle domain enabled mutation
  const toggleDomainMutation = useMutation({
    mutationFn: ({ id, is_enabled }) => apiFetch(`/api/cpanel/domains/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ is_enabled }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cpanel-domains'] });
      toast.success('Domain updated');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Delete config mutation
  const deleteConfigMutation = useMutation({
    mutationFn: (configId) => apiFetch(`/api/cpanel/config/${configId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cpanel-config'] });
      queryClient.invalidateQueries({ queryKey: ['cpanel-domains'] });
      toast.success('cPanel configuration removed');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSaveConfig = (e) => {
    e.preventDefault();
    if (!configForm.host || !configForm.username || !configForm.password) {
      toast.error('All fields are required');
      return;
    }
    saveConfigMutation.mutate(configForm);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          cPanel Integration
        </CardTitle>
        <CardDescription>
          Configure multiple cPanel accounts for direct script deployment to domains
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="config">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="config">cPanels ({configs.length})</TabsTrigger>
            <TabsTrigger value="domains">Domains ({domains.length})</TabsTrigger>
            <TabsTrigger value="deployments">Deployments ({deployments.length})</TabsTrigger>
          </TabsList>

          {/* Configuration Tab - Multiple cPanels */}
          <TabsContent value="config" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">
                Add multiple cPanel accounts to manage domains from different servers
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
                    <DialogTitle>Add cPanel Account</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSaveConfig} className="space-y-4">
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
                    <Button type="submit" disabled={saveConfigMutation.isPending} className="w-full">
                      {saveConfigMutation.isPending ? 'Saving...' : 'Add cPanel'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {configLoading ? (
              <div className="text-center py-8 text-gray-500">Loading configurations...</div>
            ) : configs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Server className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>No cPanel accounts configured</p>
                <p className="text-sm">Click "Add cPanel" to get started</p>
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
                          onClick={() => testConnectionMutation.mutate(config.id)}
                          disabled={testConnectionMutation.isPending}
                        >
                          <RefreshCw className={`h-4 w-4 mr-1 ${testConnectionMutation.isPending ? 'animate-spin' : ''}`} />
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
                              <AlertDialogAction onClick={() => deleteConfigMutation.mutate(config.id)}>
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
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
                      <div>
                        <span className="text-gray-400">Domains:</span>
                        <span className="ml-2">
                          {domains.filter(d => d.cpanel_config_id === config.id).length}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Domains Tab */}
          <TabsContent value="domains" className="space-y-4">
            <p className="text-sm text-gray-500">
              Enable domains to allow users to deploy redirect scripts
            </p>

            {domainsLoading ? (
              <div className="text-center py-8 text-gray-500">Loading domains...</div>
            ) : domains.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No domains found. Add a cPanel and click "Fetch Domains".
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>cPanel</TableHead>
                    <TableHead>Document Root</TableHead>
                    <TableHead className="text-center">Enabled</TableHead>
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
                        {domain.cpanel_username || domain.cpanel_host || 'Unknown'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-gray-500 max-w-[200px] truncate">
                        {domain.document_root}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={domain.is_enabled}
                          onCheckedChange={(checked) =>
                            toggleDomainMutation.mutate({ id: domain.id, is_enabled: checked })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* Deployments Tab */}
          <TabsContent value="deployments" className="space-y-4">
            <p className="text-sm text-gray-500">
              View all user deployments across cPanel domains
            </p>

            {deploymentsLoading ? (
              <div className="text-center py-8 text-gray-500">Loading deployments...</div>
            ) : deployments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CloudUpload className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                No deployments yet
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Human URL</TableHead>
                    <TableHead>Bot URL</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Deployed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deployments.map((dep) => (
                    <TableRow key={dep.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-gray-400" />
                          {dep.username || dep.user_email || 'Unknown'}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{dep.domain}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">
                        {dep.human_redirect_url}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">
                        {dep.bot_redirect_url}
                      </TableCell>
                      <TableCell>
                        <Badge variant={dep.status === 'active' ? 'default' : 'secondary'}>
                          {dep.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {new Date(dep.deployed_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
