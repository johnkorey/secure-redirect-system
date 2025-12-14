import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus, Link2, ExternalLink, Copy, Check } from 'lucide-react';
import RedirectForm from '../components/redirects/RedirectForm';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

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

export default function Redirects() {
  const [showForm, setShowForm] = useState(false);
  const [editingRedirect, setEditingRedirect] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const queryClient = useQueryClient();

  const { data: redirects = [], isLoading, error } = useQuery({
    queryKey: ['redirects'],
    queryFn: () => base44.entities.Redirect.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return base44.entities.Redirect.create({
        ...data,
        is_enabled: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redirects'] });
      setShowForm(false);
      toast.success('Redirect created successfully!');
    },
    onError: (err) => {
      toast.error(`Failed to create redirect: ${err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Redirect.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redirects'] });
      setShowForm(false);
      setEditingRedirect(null);
      toast.success('Redirect updated successfully!');
    },
    onError: (err) => {
      toast.error(`Failed to update redirect: ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Redirect.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redirects'] });
      toast.success('Redirect deleted successfully!');
    },
    onError: (err) => {
      toast.error(`Failed to delete redirect: ${err.message}`);
    },
  });

  const handleSave = (data) => {
    if (editingRedirect) {
      updateMutation.mutate({ id: editingRedirect.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (redirect) => {
    setEditingRedirect(redirect);
    setShowForm(true);
  };

  const handleDelete = (redirect) => {
    if (confirm(`Are you sure you want to delete "${redirect.name}"?`)) {
      deleteMutation.mutate(redirect.id);
    }
  };

  const handleToggle = (redirect) => {
    updateMutation.mutate({
      id: redirect.id,
      data: { is_enabled: !redirect.is_enabled }
    });
  };

  const copyRedirectUrl = (publicId) => {
    const url = `${BACKEND_URL}/r/${publicId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(publicId);
    toast.success('Redirect URL copied!');
    setTimeout(() => setCopiedId(null), 2000);
  };

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
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">Redirects</h1>
              <p className="text-lg text-slate-500">Manage your smart redirect links</p>
            </div>
            {!showForm && (
              <Button
                onClick={() => {
                  setEditingRedirect(null);
                  setShowForm(true);
                }}
                className="bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Redirect
              </Button>
            )}
          </div>
        </motion.div>

        {/* Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8"
            >
              <RedirectForm
                redirect={editingRedirect}
                onSave={handleSave}
                onCancel={() => {
                  setShowForm(false);
                  setEditingRedirect(null);
                }}
                isLoading={createMutation.isPending || updateMutation.isPending}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Redirects List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full mx-auto mb-4"></div>
            <p className="text-slate-500">Loading redirects...</p>
          </div>
        ) : redirects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 bg-white border border-slate-200 rounded-2xl"
          >
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Link2 className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No redirects yet</h3>
              <p className="text-slate-500 mb-6">Create your first redirect to get started</p>
              <Button
                onClick={() => setShowForm(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Redirect
              </Button>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {redirects.map((redirect, index) => (
              <motion.div
                key={redirect.id || redirect.public_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold text-slate-900">{redirect.name}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          redirect.is_enabled 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {redirect.is_enabled ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      
                      {/* Redirect URL */}
                      <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg">
                        <Link2 className="w-4 h-4 text-slate-400" />
                        <code className="text-sm text-slate-700 flex-1 truncate">
                          {BACKEND_URL}/r/{redirect.public_id}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyRedirectUrl(redirect.public_id)}
                          className="h-8 w-8 p-0"
                        >
                          {copiedId === redirect.public_id ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                        <a
                          href={`${BACKEND_URL}/r/${redirect.public_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-500 hover:text-slate-700"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>

                      {/* URLs */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-slate-500">Human URL:</span>
                          <p className="text-slate-700 truncate">{redirect.human_url}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Bot URL:</span>
                          <p className="text-slate-700 truncate">{redirect.bot_url}</p>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-6 mt-4 pt-4 border-t border-slate-100">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-slate-900">{redirect.total_clicks || 0}</p>
                          <p className="text-xs text-slate-500">Total Clicks</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-emerald-600">{redirect.human_clicks || 0}</p>
                          <p className="text-xs text-slate-500">Humans</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-amber-600">{redirect.bot_clicks || 0}</p>
                          <p className="text-xs text-slate-500">Bots</p>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggle(redirect)}
                      >
                        {redirect.is_enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(redirect)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(redirect)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
