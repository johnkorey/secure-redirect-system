import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Power } from 'lucide-react';
import { toast } from 'sonner';

export default function IPRangesConfig() {
  const [formData, setFormData] = useState({ cidr: '', label: '', action: 'block' });
  const queryClient = useQueryClient();

  const { data: ranges = [] } = useQuery({
    queryKey: ['ip-ranges'],
    queryFn: () => base44.entities.IPRange.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.IPRange.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-ranges'] });
      setFormData({ cidr: '', label: '', action: 'block' });
      toast.success('IP range added');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.IPRange.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-ranges'] });
      toast.success('IP range updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.IPRange.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-ranges'] });
      toast.success('IP range removed');
    },
  });

  const handleAdd = () => {
    if (!formData.cidr.trim() || !formData.label.trim()) return;
    createMutation.mutate({ ...formData, is_active: true });
  };

  const actionColors = {
    block: 'bg-red-100 text-red-700',
    allow: 'bg-emerald-100 text-emerald-700',
    flag: 'bg-amber-100 text-amber-700'
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">IP Ranges (CIDR)</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-6">
        <Input
          value={formData.cidr}
          onChange={(e) => setFormData({ ...formData, cidr: e.target.value })}
          placeholder="192.168.1.0/24"
        />
        <Input
          value={formData.label}
          onChange={(e) => setFormData({ ...formData, label: e.target.value })}
          placeholder="Label"
        />
        <Select value={formData.action} onValueChange={(v) => setFormData({ ...formData, action: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="block">Block</SelectItem>
            <SelectItem value="allow">Allow</SelectItem>
            <SelectItem value="flag">Flag</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleAdd} disabled={!formData.cidr.trim()}>
          <Plus className="w-4 h-4 mr-2" />
          Add
        </Button>
      </div>

      <div className="space-y-2">
        {ranges.map((range) => (
          <div key={range.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-slate-700">{range.cidr}</span>
              <span className="text-sm text-slate-600">{range.label}</span>
              <Badge className={actionColors[range.action]}>
                {range.action}
              </Badge>
              {!range.is_active && <Badge variant="secondary">Inactive</Badge>}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateMutation.mutate({ 
                  id: range.id, 
                  data: { is_active: !range.is_active } 
                })}
              >
                <Power className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => deleteMutation.mutate(range.id)}
                className="text-red-600"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
        {ranges.length === 0 && (
          <p className="text-center py-6 text-slate-400">No IP ranges configured</p>
        )}
      </div>
    </Card>
  );
}