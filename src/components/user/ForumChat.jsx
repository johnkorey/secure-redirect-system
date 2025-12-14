import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Send, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function ForumChat({ apiUser }) {
  const [message, setMessage] = useState('');
  const queryClient = useQueryClient();

  const { data: messages = [] } = useQuery({
    queryKey: ['forum-messages'],
    queryFn: () => base44.entities.ForumMessage.list('-created_date', 50),
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  const sendMessageMutation = useMutation({
    mutationFn: (data) => base44.entities.ForumMessage.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forum-messages'] });
      setMessage('');
      toast.success('Message sent!');
    },
  });

  const handleSend = () => {
    if (!message.trim()) return;
    if (!apiUser?.display_name) {
      toast.error('Please set a display name in your profile first');
      return;
    }

    sendMessageMutation.mutate({
      user_id: apiUser.id,
      display_name: apiUser.display_name,
      message: message.trim(),
      is_support: false,
      is_moderated: false
    });
  };

  // Filter out moderated messages
  const visibleMessages = messages.filter(m => !m.is_moderated);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <MessageSquare className="w-6 h-6 text-emerald-600" />
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Community Forum</h3>
            <p className="text-sm text-slate-500">Chat with other users and support team</p>
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-4 mb-6 max-h-[500px] overflow-y-auto">
          {visibleMessages.map((msg) => (
            <div
              key={msg.id}
              className={`p-4 rounded-lg ${
                msg.is_support
                  ? 'bg-emerald-50 border border-emerald-200'
                  : 'bg-slate-50'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold ${
                    msg.is_support ? 'bg-emerald-600' : 'bg-blue-600'
                  }`}>
                    {msg.display_name ? msg.display_name[0].toUpperCase() : 'U'}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{msg.display_name || 'Anonymous'}</p>
                    {msg.is_support && (
                      <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                        <Shield className="w-3 h-3 mr-1" />
                        Support
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  {format(new Date(msg.created_date), 'MMM d, HH:mm')}
                </p>
              </div>
              <p className="text-slate-700 ml-10">{msg.message}</p>
            </div>
          ))}

          {visibleMessages.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No messages yet. Start the conversation!</p>
            </div>
          )}
        </div>

        {/* Message Input */}
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder={
              apiUser?.display_name
                ? 'Type your message...'
                : 'Set a display name in profile to chat'
            }
            disabled={!apiUser?.display_name}
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || !apiUser?.display_name}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      <Card className="p-4 bg-blue-50 border-blue-200">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Messages are monitored by moderators. Be respectful and follow community guidelines.
        </p>
      </Card>
    </div>
  );
}