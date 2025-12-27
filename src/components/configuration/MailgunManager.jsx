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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Trash2, CheckCircle, XCircle, RefreshCw, Copy, Globe, Shield, Eye, Settings } from 'lucide-react';
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

  return response.json();
};

export default function MailgunManager() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [deleteDomain, setDeleteDomain] = useState(null);
  const queryClient = useQueryClient();

  const { data: domainsData, isLoading, isError } = useQuery({
    queryKey: ['mailgun-domains'],
    queryFn: () => apiFetch('/api/mailgun/domains'),
    retry: 1,
  });

  const addDomainMutation = useMutation({
    mutationFn: (data) => apiFetch('/api/mailgun/domains', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailgun-domains'] });
      setShowAddDialog(false);
      toast.success('Domain added successfully! Check DNS records below.');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add domain');
    },
  });

  const deleteDomainMutation = useMutation({
    mutationFn: (domain) => apiFetch(`/api/mailgun/domains/${domain}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailgun-domains'] });
      setDeleteDomain(null);
      toast.success('Domain deleted');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete domain');
    },
  });

  const verifyDomainMutation = useMutation({
    mutationFn: (domain) => apiFetch(`/api/mailgun/domains/${domain}/verify`, {
      method: 'PUT',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailgun-domains'] });
      toast.success('Verification check triggered');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to verify domain');
    },
  });

  const domains = domainsData?.items || [];

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mailgun Domain Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <XCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
            <p className="text-slate-600 mb-4">Failed to connect to Mailgun API</p>
            <p className="text-sm text-slate-500">Make sure your Mailgun API key is configured in System Settings</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Mailgun Domain Management
              </CardTitle>
              <CardDescription>
                Add and manage sending domains directly from your app
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
                    Add a new sending domain to your Mailgun account
                  </DialogDescription>
                </DialogHeader>
                <AddDomainForm onSubmit={(data) => addDomainMutation.mutate(data)} />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin text-slate-400 mb-2" />
              <p className="text-slate-500">Loading domains...</p>
            </div>
          ) : domains.length === 0 ? (
            <div className="text-center py-8">
              <Globe className="w-12 h-12 mx-auto text-slate-400 mb-4" />
              <p className="text-slate-600 mb-2">No domains configured</p>
              <p className="text-sm text-slate-500">Add your first domain to start sending emails</p>
            </div>
          ) : (
            <div className="space-y-4">
              {domains.map((domain) => (
                <DomainCard
                  key={domain.name}
                  domain={domain}
                  onDelete={() => setDeleteDomain(domain.name)}
                  onVerify={() => verifyDomainMutation.mutate(domain.name)}
                  onView={() => setSelectedDomain(domain.name)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Domain Details Dialog */}
      {selectedDomain && (
        <Dialog open={!!selectedDomain} onOpenChange={(open) => !open && setSelectedDomain(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedDomain}</DialogTitle>
              <DialogDescription>Domain configuration and DNS records</DialogDescription>
            </DialogHeader>
            <DomainDetails domain={selectedDomain} />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDomain} onOpenChange={(open) => !open && setDeleteDomain(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Domain</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteDomain}</strong>?
              <br /><br />
              This will permanently remove the domain from Mailgun. You will not be able to send emails from this domain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDomainMutation.mutate(deleteDomain)}
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

function DomainCard({ domain, onDelete, onVerify, onView }) {
  const isVerified = domain.state === 'active';
  const isPending = domain.state === 'unverified';

  return (
    <div className="border rounded-lg p-4 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-slate-900">{domain.name}</h3>
            {isVerified ? (
              <Badge className="bg-emerald-100 text-emerald-700">
                <CheckCircle className="w-3 h-3 mr-1" />
                Verified
              </Badge>
            ) : (
              <Badge variant="secondary">
                <XCircle className="w-3 h-3 mr-1" />
                Pending Verification
              </Badge>
            )}
          </div>
          <div className="text-sm text-slate-600 space-y-1">
            <p>State: {domain.state}</p>
            <p>Created: {new Date(domain.created_at).toLocaleDateString()}</p>
            {domain.spam_action && <p>Spam Action: {domain.spam_action}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onView}>
            <Eye className="w-4 h-4 mr-1" />
            View DNS
          </Button>
          {isPending && (
            <Button size="sm" variant="outline" onClick={onVerify}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Verify
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddDomainForm({ onSubmit }) {
  const [formData, setFormData] = useState({
    domain: '',
    spam_action: 'disabled',
    wildcard: false,
    dkim_key_size: 1024,
    web_scheme: 'https'
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
          placeholder="mg.yourdomain.com"
          value={formData.domain}
          onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
          required
        />
        <p className="text-xs text-slate-500">Use a subdomain like mg.yourdomain.com</p>
      </div>

      <div className="space-y-2">
        <Label>Spam Action</Label>
        <Select value={formData.spam_action} onValueChange={(v) => setFormData({ ...formData, spam_action: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="disabled">Disabled</SelectItem>
            <SelectItem value="block">Block</SelectItem>
            <SelectItem value="tag">Tag</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>DKIM Key Size</Label>
        <Select value={formData.dkim_key_size.toString()} onValueChange={(v) => setFormData({ ...formData, dkim_key_size: parseInt(v) })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1024">1024 bits</SelectItem>
            <SelectItem value="2048">2048 bits (More secure)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" className="w-full">
        Add Domain
      </Button>
    </form>
  );
}

function DomainDetails({ domain }) {
  const { data, isLoading } = useQuery({
    queryKey: ['mailgun-domain-details', domain],
    queryFn: () => apiFetch(`/api/mailgun/domains/${domain}`),
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  const domainData = data?.domain || data;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="dns">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="dns">DNS Records</TabsTrigger>
          <TabsTrigger value="sending">Sending</TabsTrigger>
          <TabsTrigger value="receiving">Receiving</TabsTrigger>
        </TabsList>

        <TabsContent value="dns" className="space-y-4">
          <DNSRecords records={domainData?.sending_dns_records || domainData?.dns_records || []} />
        </TabsContent>

        <TabsContent value="sending" className="space-y-4">
          <SendingRecords records={domainData?.sending_dns_records || []} />
        </TabsContent>

        <TabsContent value="receiving" className="space-y-4">
          <ReceivingRecords records={domainData?.receiving_dns_records || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DNSRecords({ records }) {
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm text-amber-800">
          Add these DNS records to your domain to verify ownership and enable sending
        </p>
      </div>
      {records.map((record, idx) => (
        <Card key={idx} className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{record.record_type}</Badge>
              <span className="text-sm font-medium text-slate-700">{record.name}</span>
              {record.valid === 'valid' && (
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copyToClipboard(record.value)}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <div className="bg-slate-50 rounded p-2 font-mono text-xs break-all">
            {record.value}
          </div>
          {record.priority && (
            <p className="text-xs text-slate-500 mt-1">Priority: {record.priority}</p>
          )}
        </Card>
      ))}
    </div>
  );
}

function SendingRecords({ records }) {
  return <DNSRecords records={records} />;
}

function ReceivingRecords({ records }) {
  if (!records || records.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>No receiving records configured</p>
      </div>
    );
  }
  return <DNSRecords records={records} />;
}

