import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Shield, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function ForumManagement() {
  const queryClient = useQueryClient();

  const { data: messages = [] } = useQuery({
    queryKey: ['forum-messages'],
    queryFn: () => base44.entities.ForumMessage.list('-created_date', 100),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ForumMessage.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forum-messages'] });
      toast.success('Message updated');
    },
  });

  const handleModerate = (message) => {
    updateMutation.mutate({
      id: message.id,
      data: { is_moderated: !message.is_moderated }
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Forum Management</h1>
        <p className="text-slate-500">Monitor and moderate community messages</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-sm text-slate-500">Total Messages</p>
              <p className="text-2xl font-bold text-slate-900">{messages.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-emerald-600" />
            <div>
              <p className="text-sm text-slate-500">Support Messages</p>
              <p className="text-2xl font-bold text-emerald-900">
                {messages.filter(m => m.is_support).length}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <EyeOff className="w-8 h-8 text-amber-600" />
            <div>
              <p className="text-sm text-slate-500">Moderated</p>
              <p className="text-2xl font-bold text-amber-900">
                {messages.filter(m => m.is_moderated).length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`p-4 rounded-lg border transition-all ${
                message.is_moderated 
                  ? 'bg-slate-100 border-slate-300 opacity-60' 
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${
                    message.is_support ? 'bg-emerald-600' : 'bg-blue-600'
                  }`}>
                    {message.display_name ? message.display_name[0].toUpperCase() : 'U'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {message.display_name || 'Anonymous'}
                      </span>
                      {message.is_support && (
                        <Badge className="bg-emerald-100 text-emerald-700">
                          <Shield className="w-3 h-3 mr-1" />
                          Support
                        </Badge>
                      )}
                      {message.is_moderated && (
                        <Badge variant="secondary">Moderated</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {format(new Date(message.created_date), 'MMM d, yyyy HH:mm')}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleModerate(message)}
                  className={message.is_moderated ? 'text-emerald-600' : 'text-amber-600'}
                >
                  {message.is_moderated ? (
                    <>
                      <Eye className="w-3 h-3 mr-1" />
                      Show
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3 h-3 mr-1" />
                      Hide
                    </>
                  )}
                </Button>
              </div>
              <p className="text-slate-700">{message.message}</p>
            </div>
          ))}

          {messages.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No messages yet</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}