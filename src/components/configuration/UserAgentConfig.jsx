import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Power } from 'lucide-react';
import { toast } from 'sonner';

export default function UserAgentConfig() {
  const [formData, setFormData] = useState({ pattern: '', label: '' });
  const queryClient = useQueryClient();

  const { data: patterns = [] } = useQuery({
    queryKey: ['ua-patterns'],
    queryFn: () => base44.entities.UserAgentPattern.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.UserAgentPattern.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ua-patterns'] });
      setFormData({ pattern: '', label: '' });
      toast.success('Pattern added');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.UserAgentPattern.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ua-patterns'] });
      toast.success('Pattern updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.UserAgentPattern.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ua-patterns'] });
      toast.success('Pattern removed');
    },
  });

  const handleAdd = () => {
    if (!formData.pattern.trim() || !formData.label.trim()) return;
    createMutation.mutate({ ...formData, is_active: true, detection_method: 'user_agent' });
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">User-Agent Patterns</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-6">
        <Input
          value={formData.pattern}
          onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
          placeholder="Pattern (e.g., 'curl', 'bot')"
        />
        <Input
          value={formData.label}
          onChange={(e) => setFormData({ ...formData, label: e.target.value })}
          placeholder="Label (e.g., 'cURL Bot')"
        />
        <Button onClick={handleAdd} disabled={!formData.pattern.trim()}>
          <Plus className="w-4 h-4 mr-2" />
          Add
        </Button>
      </div>

      <div className="space-y-2">
        {patterns.map((pattern) => (
          <div key={pattern.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <code className="text-sm bg-slate-200 px-2 py-1 rounded">{pattern.pattern}</code>
              <span className="text-sm text-slate-600">{pattern.label}</span>
              {!pattern.is_active && <Badge variant="secondary">Inactive</Badge>}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateMutation.mutate({ 
                  id: pattern.id, 
                  data: { is_active: !pattern.is_active } 
                })}
              >
                <Power className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => deleteMutation.mutate(pattern.id)}
                className="text-red-600"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
        {patterns.length === 0 && (
          <p className="text-center py-6 text-slate-400">No patterns configured</p>
        )}
      </div>
    </Card>
  );
}