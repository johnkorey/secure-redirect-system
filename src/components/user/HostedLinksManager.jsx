import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Copy, Trash2, Mail, ExternalLink, Edit } from 'lucide-react';
import { toast } from 'sonner';

// Detect backend URL
function getBackendUrl() {
  return '';
}
const BACKEND_URL = getBackendUrl();

// API helper
const apiFetch = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
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

export default function HostedLinksManager({ apiUser }) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(null);
  const [newLink, setNewLink] = useState({ domain_id: '', humanUrl: '', botUrl: '' });
  const [editLink, setEditLink] = useState({ humanUrl: '', botUrl: '' });
  const queryClient = useQueryClient();

  // Fetch active redirect domains
  const { data: redirectDomains = [] } = useQuery({
    queryKey: ['active-redirect-domains'],
    queryFn: () => apiFetch('/api/domains/active/redirect'),
  });

  const { data: redirects = [] } = useQuery({
    queryKey: ['my-redirects'],
    queryFn: () => base44.entities.Redirect.list(),
    enabled: !!apiUser,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Find the selected domain
      const selectedDomain = redirectDomains.find(d => d.id === data.domain_id);
      if (!selectedDomain) {
        throw new Error('Please select a valid domain');
      }

      // Generate redirect ID
      const redirectId = `r-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Construct full URL
      const fullUrl = `https://${selectedDomain.domain_name}/r/${redirectId}`;

      return base44.entities.Redirect.create({
        public_id: redirectId,
        name: `Link ${new Date().toLocaleDateString()}`,
        full_url: fullUrl,
        domain_id: data.domain_id,
        domain_name: selectedDomain.domain_name,
        human_url: data.humanUrl,
        bot_url: data.botUrl,
        is_enabled: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-redirects'] });
      queryClient.invalidateQueries({ queryKey: ['current-user'] }); // Match UserDashboard query key
      setShowCreateDialog(false);
      setNewLink({ domain_id: '', humanUrl: '', botUrl: '' });
      toast.success('Redirect link created!');
    },
    onError: (error) => {
      console.error('Create redirect error:', error);
      toast.error(error.message || 'Failed to create link. You may have reached your daily limit.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Redirect.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-redirects'] });
      toast.success('Link deleted');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Redirect.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-redirects'] });
      setEditDialogOpen(null);
      setEditLink({ humanUrl: '', botUrl: '' });
      toast.success('Redirect URLs updated successfully!');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update redirect');
    }
  });

  const copyLink = (fullUrl) => {
    navigator.clipboard.writeText(fullUrl);
    toast.success('Link copied to clipboard!');
  };

  const handleEditOpen = (redirect) => {
    setEditLink({
      humanUrl: redirect.human_url,
      botUrl: redirect.bot_url
    });
    setEditDialogOpen(redirect.id);
  };

  const handleEditSave = () => {
    if (!editLink.humanUrl || !editLink.botUrl) {
      toast.error('Both URLs are required');
      return;
    }
    updateMutation.mutate({
      id: editDialogOpen,
      data: {
        human_url: editLink.humanUrl,
        bot_url: editLink.botUrl
      }
    });
  };

  const dailyLimit = apiUser?.linkCounter?.dailyLinkLimit || apiUser?.daily_link_limit || 1;
  const linksCreatedToday = apiUser?.linkCounter?.linksCreatedToday || apiUser?.links_created_today || 0;
  const remainingLinks = apiUser?.linkCounter?.remainingLinks ?? (dailyLimit - linksCreatedToday);
  const canCreateMore = apiUser?.linkCounter?.canCreateMore ?? (linksCreatedToday < dailyLimit);

  return (
    <div className="space-y-6">
      {/* Daily Limit Indicator */}
      <Card className={`p-4 ${canCreateMore ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm font-medium ${canCreateMore ? 'text-emerald-800' : 'text-amber-800'}`}>
              Daily Link Limit
            </p>
            <p className={`text-xs ${canCreateMore ? 'text-emerald-600' : 'text-amber-600'}`}>
              {linksCreatedToday} of {dailyLimit} link{dailyLimit > 1 ? 's' : ''} created today
            </p>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            canCreateMore 
              ? 'bg-emerald-100 text-emerald-700' 
              : 'bg-amber-100 text-amber-700'
          }`}>
            {canCreateMore ? `${remainingLinks} remaining` : 'Limit reached'}
          </div>
        </div>
      </Card>

      {/* Hosted Links */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-slate-900">Hosted Links</h3>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button 
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={!canCreateMore}
              >
                <Plus className="w-4 h-4 mr-2" />
                {canCreateMore ? 'Create Link' : 'Limit Reached'}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Redirect Link</DialogTitle>
                <DialogDescription>
                  Select a domain and set destination URLs for humans and bots
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700 border border-blue-200">
                  You have {remainingLinks} link{remainingLinks !== 1 ? 's' : ''} remaining today.
                </div>
                
                <div className="space-y-2">
                  <Label>Select Domain *</Label>
                  <Select value={newLink.domain_id} onValueChange={(v) => setNewLink({ ...newLink, domain_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a domain..." />
                    </SelectTrigger>
                    <SelectContent>
                      {redirectDomains.length === 0 ? (
                        <div className="p-4 text-center text-sm text-slate-500">
                          No active redirect domains available
                        </div>
                      ) : (
                        redirectDomains.map((domain) => (
                          <SelectItem key={domain.id} value={domain.id}>
                            {domain.domain_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    The domain used for your redirect link and email sending
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Human Destination URL *</Label>
                  <Input
                    value={newLink.humanUrl}
                    onChange={(e) => setNewLink({ ...newLink, humanUrl: e.target.value })}
                    placeholder="https://example.com/human"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bot Destination URL *</Label>
                  <Input
                    value={newLink.botUrl}
                    onChange={(e) => setNewLink({ ...newLink, botUrl: e.target.value })}
                    placeholder="https://example.com/bot"
                  />
                </div>
                <Button
                  onClick={() => createMutation.mutate(newLink)}
                  disabled={!newLink.domain_id || !newLink.humanUrl || !newLink.botUrl || createMutation.isPending}
                  className="w-full"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Link'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-3">
          {redirects.map((redirect) => (
            <div key={redirect.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="font-medium text-slate-900">{redirect.name}</p>
                    {redirect.domain_name && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        {redirect.domain_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <code className="bg-white px-2 py-1 rounded border font-mono text-xs">
                      {redirect.full_url || `${window.location.origin}/r/${redirect.public_id}`}
                    </code>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => copyLink(redirect.full_url || `${window.location.origin}/r/${redirect.public_id}`)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2">
                  {/* Edit URLs */}
                  <Dialog 
                    open={editDialogOpen === redirect.id} 
                    onOpenChange={(open) => !open && setEditDialogOpen(null)}
                  >
                    <DialogTrigger asChild>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-amber-600"
                        onClick={() => handleEditOpen(redirect)}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Redirect URLs</DialogTitle>
                        <DialogDescription>
                          Update the destination URLs for human and bot traffic
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Human Destination URL *</Label>
                          <Input
                            value={editLink.humanUrl}
                            onChange={(e) => setEditLink({ ...editLink, humanUrl: e.target.value })}
                            placeholder="https://example.com/human"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Bot Destination URL *</Label>
                          <Input
                            value={editLink.botUrl}
                            onChange={(e) => setEditLink({ ...editLink, botUrl: e.target.value })}
                            placeholder="https://example.com/bot"
                          />
                        </div>
                        <Button 
                          onClick={handleEditSave} 
                          disabled={!editLink.humanUrl || !editLink.botUrl || updateMutation.isPending}
                          className="w-full"
                        >
                          {updateMutation.isPending ? 'Updating...' : 'Update URLs'}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteMutation.mutate(redirect.id)}
                    className="text-red-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 mb-1">Human URL</p>
                  <a href={redirect.human_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline flex items-center gap-1 break-all">
                    {redirect.human_url.length > 40 ? `${redirect.human_url.substring(0, 40)}...` : redirect.human_url}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">Bot URL</p>
                  <a href={redirect.bot_url} target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline flex items-center gap-1 break-all">
                    {redirect.bot_url.length > 40 ? `${redirect.bot_url.substring(0, 40)}...` : redirect.bot_url}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200">
                <p className="text-sm text-slate-600">
                  Clicks: {redirect.total_clicks || 0} 
                  {(redirect.human_clicks || redirect.bot_clicks) && (
                    <span className="text-slate-500">
                      {' '}(Human: {redirect.human_clicks || 0}, Bot: {redirect.bot_clicks || 0})
                    </span>
                  )}
                </p>
              </div>
            </div>
          ))}
          {redirects.length === 0 && (
            <div className="text-center py-12">
              <p className="text-slate-400 mb-2">No redirect links yet</p>
              <p className="text-sm text-slate-500">Create your first link to get started</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
