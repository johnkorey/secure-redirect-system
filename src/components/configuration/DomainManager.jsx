import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Globe, RadioTower, Home, Power } from 'lucide-react';
import { toast } from 'sonner';

// Detect backend URL
function getBackendUrl() {
  return '';
}
const BACKEND_URL = getBackendUrl();

// API helpers
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

  // Handle 204 No Content
  if (response.status === 204) {
    return null;
  }

  return response.json();
};

export default function DomainManager() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteDomain, setDeleteDomain] = useState(null);
  const queryClient = useQueryClient();

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: () => apiFetch('/api/domains'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => apiFetch('/api/domains', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      setShowAddDialog(false);
      toast.success('Domain added successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add domain');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => apiFetch(`/api/domains/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast.success('Domain updated');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update domain');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiFetch(`/api/domains/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      setDeleteDomain(null);
      toast.success('Domain deleted. All redirects using this domain are now disabled.');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete domain');
    },
  });

  const setMainMutation = useMutation({
    mutationFn: (id) => apiFetch(`/api/domains/${id}/set-main`, {
      method: 'PUT',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast.success('Main domain updated');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to set main domain');
    },
  });

  const handleSetMain = (domainId) => {
    setMainMutation.mutate(domainId);
  };

  const handleToggleActive = (domain) => {
    updateMutation.mutate({
      id: domain.id,
      data: { is_active: !domain.is_active }
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Domain Management
              </CardTitle>
              <CardDescription>
                Manage main hosting domain and redirect domains for link generation
              </CardDescription>
            </div>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Domain
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Domain</DialogTitle>
                  <DialogDescription>
                    Add a domain for the system or for redirect link generation
                  </DialogDescription>
                </DialogHeader>
                <AddDomainForm onSubmit={(data) => createMutation.mutate(data)} />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-slate-500">Loading domains...</p>
            </div>
          ) : domains.length === 0 ? (
            <div className="text-center py-8">
              <Globe className="w-12 h-12 mx-auto text-slate-400 mb-4" />
              <p className="text-slate-600 mb-2">No domains configured</p>
              <p className="text-sm text-slate-500">Add your main domain and redirect domains</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-blue-900 mb-1">Domain Types:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li><strong>Main Domain:</strong> Hosts the app and sends system emails (only one)</li>
                  <li><strong>Redirect Domain:</strong> Used for generating redirect links (multiple allowed)</li>
                </ul>
              </div>
              {domains.map((domain) => (
                <DomainCard
                  key={domain.id}
                  domain={domain}
                  isMain={domain.type === 'main'}
                  onSetMain={() => handleSetMain(domain.id)}
                  onToggleActive={() => handleToggleActive(domain)}
                  onDelete={() => setDeleteDomain(domain)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDomain} onOpenChange={(open) => !open && setDeleteDomain(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Domain</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteDomain?.domain_name}</strong>?
              <br /><br />
              {deleteDomain?.type === 'redirect' && (
                <span className="text-red-600 font-medium">
                  ⚠️ All existing redirects using this domain will stop working immediately!
                </span>
              )}
              {deleteDomain?.type === 'main' && (
                <span className="text-red-600 font-medium">
                  ⚠️ This is your main domain. System emails will not work until you set a new main domain!
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteDomain.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Domain
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DomainCard({ domain, isMain, onSetMain, onToggleActive, onDelete }) {
  return (
    <div className="border rounded-lg p-4 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          {/* Radio button for main domain */}
          <div className="pt-1">
            <button
              onClick={onSetMain}
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                isMain
                  ? 'border-emerald-500 bg-emerald-500'
                  : 'border-slate-300 hover:border-emerald-400'
              }`}
              title={isMain ? 'Main Domain' : 'Set as Main Domain'}
            >
              {isMain && <div className="w-2 h-2 bg-white rounded-full" />}
            </button>
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold text-slate-900">{domain.domain_name}</h3>
              {isMain ? (
                <Badge className="bg-emerald-100 text-emerald-700">
                  <Home className="w-3 h-3 mr-1" />
                  Main Domain
                </Badge>
              ) : (
                <Badge variant="outline">
                  <RadioTower className="w-3 h-3 mr-1" />
                  Redirect Domain
                </Badge>
              )}
              {domain.is_active ? (
                <Badge className="bg-blue-100 text-blue-700">Active</Badge>
              ) : (
                <Badge variant="secondary">Inactive</Badge>
              )}
            </div>
            <div className="text-sm text-slate-600 space-y-1">
              <p>Mailgun Domain: {domain.mailgun_domain || 'Not configured'}</p>
              <p>From Email: {domain.from_email || 'Not configured'}</p>
              <p>Created: {new Date(domain.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onToggleActive}
            title={domain.is_active ? 'Deactivate' : 'Activate'}
          >
            <Power className={`w-4 h-4 ${domain.is_active ? 'text-emerald-600' : 'text-slate-400'}`} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 hover:text-red-700"
            onClick={onDelete}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddDomainForm({ onSubmit }) {
  const [formData, setFormData] = useState({
    domain_name: '',
    type: 'redirect',
    mailgun_domain: '',
    from_email: '',
    from_name: 'Secure Redirect',
    is_active: true
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Domain Name *</Label>
        <Input
          placeholder="example.com or r1.example.com"
          value={formData.domain_name}
          onChange={(e) => setFormData({ ...formData, domain_name: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Domain Type *</Label>
        <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="main">Main Domain (Hosting & System Emails)</SelectItem>
            <SelectItem value="redirect">Redirect Domain (For Link Generation)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500">
          {formData.type === 'main'
            ? 'This domain hosts the app and sends system notifications'
            : 'This domain will be used for generating redirect links'}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Mailgun Domain *</Label>
        <Input
          placeholder="mg.yourdomain.com"
          value={formData.mailgun_domain}
          onChange={(e) => setFormData({ ...formData, mailgun_domain: e.target.value })}
          required
        />
        <p className="text-xs text-slate-500">Your verified Mailgun sending domain</p>
      </div>

      <div className="space-y-2">
        <Label>From Email *</Label>
        <Input
          type="email"
          placeholder="noreply@yourdomain.com"
          value={formData.from_email}
          onChange={(e) => setFormData({ ...formData, from_email: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>From Name</Label>
        <Input
          placeholder="Secure Redirect"
          value={formData.from_name}
          onChange={(e) => setFormData({ ...formData, from_name: e.target.value })}
        />
      </div>

      <Button type="submit" className="w-full">
        Add Domain
      </Button>
    </form>
  );
}

