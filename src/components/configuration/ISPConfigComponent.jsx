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

export default function ISPConfigComponent() {
  const [formData, setFormData] = useState({ isp_name: '', classification: 'bot' });
  const queryClient = useQueryClient();

  const { data: configs = [] } = useQuery({
    queryKey: ['isp-configs'],
    queryFn: () => base44.entities.ISPConfig.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ISPConfig.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isp-configs'] });
      setFormData({ isp_name: '', classification: 'bot' });
      toast.success('ISP config added');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ISPConfig.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isp-configs'] });
      toast.success('ISP config updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ISPConfig.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isp-configs'] });
      toast.success('ISP config removed');
    },
  });

  const handleAdd = () => {
    if (!formData.isp_name.trim()) return;
    createMutation.mutate({ ...formData, is_active: true });
  };

  const classColors = {
    bot: 'bg-amber-100 text-amber-700',
    human: 'bg-emerald-100 text-emerald-700',
    suspicious: 'bg-orange-100 text-orange-700'
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">ISP Configuration</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-6">
        <Input
          value={formData.isp_name}
          onChange={(e) => setFormData({ ...formData, isp_name: e.target.value })}
          placeholder="ISP name or pattern"
        />
        <Select value={formData.classification} onValueChange={(v) => setFormData({ ...formData, classification: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bot">Bot</SelectItem>
            <SelectItem value="human">Human</SelectItem>
            <SelectItem value="suspicious">Suspicious</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleAdd} disabled={!formData.isp_name.trim()}>
          <Plus className="w-4 h-4 mr-2" />
          Add
        </Button>
      </div>

      <div className="space-y-2">
        {configs.map((config) => (
          <div key={config.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-700">{config.isp_name}</span>
              <Badge className={classColors[config.classification]}>
                {config.classification}
              </Badge>
              {!config.is_active && <Badge variant="secondary">Inactive</Badge>}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateMutation.mutate({ 
                  id: config.id, 
                  data: { is_active: !config.is_active } 
                })}
              >
                <Power className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => deleteMutation.mutate(config.id)}
                className="text-red-600"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
        {configs.length === 0 && (
          <p className="text-center py-6 text-slate-400">No ISP configs set</p>
        )}
      </div>
    </Card>
  );
}