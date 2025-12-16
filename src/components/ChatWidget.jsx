import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { MessageSquare, X, Send, Minimize2, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [message, setMessage] = useState('');
  const [hasShownPopup, setHasShownPopup] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  // Get current user
  const { data: currentUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => base44.auth.me(),
  });

  // Fetch messages - Sort by created_at ascending (oldest first)
  const { data: rawMessages = [] } = useQuery({
    queryKey: ['chat-messages'],
    queryFn: async () => {
      const result = await base44.entities.ForumMessage.list('-created_at', 200);
      console.log('[ChatWidget] Fetched messages:', result?.length || 0);
      // Log breakdown by sender_role
      const roleCounts = {};
      result?.forEach(m => {
        const role = m.sender_role || 'undefined';
        roleCounts[role] = (roleCounts[role] || 0) + 1;
      });
      console.log('[ChatWidget] Messages by sender_role:', roleCounts);
      return result;
    },
    refetchInterval: 2000, // Refetch every 2 seconds for faster updates
  });

  // Reverse messages to show oldest first (like a real chat)
  const messages = [...rawMessages].reverse();

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: (messageText) => {
      // Get proper username
      const username = currentUser?.apiUser?.username || 
                      currentUser?.apiUser?.display_name || 
                      currentUser?.full_name || 
                      currentUser?.email?.split('@')[0] || 
                      'User';
      
      return base44.entities.ForumMessage.create({
        message: messageText,
        sender_email: currentUser?.email,
        sender_name: username,
        sender_role: currentUser?.role || 'user',
      });
    },
    onSuccess: () => {
      setMessage('');
      // Invalidate both query keys to ensure both ChatWidget and ForumChat update
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
      queryClient.invalidateQueries({ queryKey: ['forum-messages'] });
      setTimeout(() => scrollToBottom(), 100);
    },
    onError: (error) => {
      toast.error('Failed to send message');
      console.error(error);
    }
  });

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollToBottom();
    }
  }, [messages, isOpen, isMinimized]);

  // Show popup on first load (with delay)
  useEffect(() => {
    const hasSeenPopup = localStorage.getItem('chat_popup_shown');
    if (!hasSeenPopup && !hasShownPopup) {
      const timer = setTimeout(() => {
        setIsOpen(true);
        setHasShownPopup(true);
        localStorage.setItem('chat_popup_shown', 'true');
        toast.info('💬 Welcome to the community!', {
          description: 'Chat with other users and admins'
        });
      }, 3000); // Show after 3 seconds
      return () => clearTimeout(timer);
    }
  }, [hasShownPopup]);

  // Calculate unread messages and show notifications
  useEffect(() => {
    if (!isOpen && messages.length > 0) {
      const lastSeenTime = localStorage.getItem('chat_last_seen');
      const lastMessageCount = parseInt(localStorage.getItem('chat_message_count') || '0');
      
      if (lastSeenTime) {
        const newMessages = messages.filter(m => 
          new Date(m.created_at || m.created_date) > new Date(lastSeenTime) &&
          m.sender_email !== currentUser?.email
        );
        setUnreadCount(newMessages.length);
        
        // Show toast notification for new messages
        if (newMessages.length > 0 && messages.length > lastMessageCount) {
          const latestMessage = newMessages[newMessages.length - 1];
          toast.info(`💬 ${latestMessage.sender_name || 'New message'}`, {
            description: latestMessage.message.substring(0, 50) + (latestMessage.message.length > 50 ? '...' : ''),
            duration: 4000,
          });
        }
      } else {
        // First time, count messages from others only
        const othersMessages = messages.filter(m => m.sender_email !== currentUser?.email);
        setUnreadCount(othersMessages.length);
      }
      
      localStorage.setItem('chat_message_count', messages.length.toString());
    } else if (isOpen) {
      // Mark as read when chat is open
      localStorage.setItem('chat_last_seen', new Date().toISOString());
      localStorage.setItem('chat_message_count', messages.length.toString());
      setUnreadCount(0);
    }
  }, [messages, isOpen, currentUser]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    if (sendMessageMutation.isPending) return; // Prevent double-send
    sendMessageMutation.mutate(message.trim());
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setIsMinimized(false);
    }
  };

  return (
    <>
      {/* Floating Chat Button */}
      <motion.div
        className="fixed bottom-6 right-6 z-50"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        {!isOpen && (
          <Button
            onClick={toggleChat}
            className="h-14 w-14 rounded-full shadow-lg bg-emerald-500 hover:bg-emerald-600 relative"
          >
            <MessageSquare className="w-6 h-6 text-white" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        )}
      </motion.div>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50"
            style={{ width: '380px', maxWidth: 'calc(100vw - 32px)' }}
          >
            <Card className="shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="bg-emerald-500 text-white p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <MessageSquare className="w-5 h-5" />
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-emerald-500" 
                         title="Online"
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold">Community Chat</h3>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      <p className="text-xs text-emerald-100">{messages.length} messages • {unreadCount > 0 ? `${unreadCount} unread` : 'All read'}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsMinimized(!isMinimized)}
                    className="text-white hover:bg-emerald-600 h-8 w-8 p-0"
                  >
                    {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={toggleChat}
                    className="text-white hover:bg-emerald-600 h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Messages Area */}
              {!isMinimized && (
                <>
                  <div className="h-96 overflow-y-auto p-4 bg-slate-50 space-y-3">
                    {messages.length === 0 ? (
                      <div className="text-center text-slate-500 mt-8">
                        <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                        <p className="text-sm">No messages yet</p>
                        <p className="text-xs mt-1">Start a conversation!</p>
                      </div>
                    ) : (
                      <>
                        {messages.map((msg, index) => {
                          const isCurrentUser = msg.sender_email === currentUser?.email;
                          const isAdmin = msg.sender_role === 'admin' || msg.sender_email?.includes('admin');
                          
                          // Get display name
                          let displayName = msg.sender_name || 'User';
                          const showAdminBadge = isAdmin;
                          
                          // Check if we should show the name (first message or different sender from previous)
                          const prevMsg = messages[index - 1];
                          const showName = !prevMsg || prevMsg.sender_email !== msg.sender_email;
                          
                          return (
                            <div
                              key={msg.id}
                              className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} ${index > 0 && !showName ? 'mt-1' : ''}`}
                            >
                              <div className={`max-w-[80%]`}>
                                {/* Show name only if it's a new sender */}
                                {showName && (
                                  <div className={`flex items-center gap-2 mb-1 px-1 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
                                    <span className={`text-xs font-semibold ${
                                      isCurrentUser 
                                        ? 'text-emerald-600' 
                                        : isAdmin 
                                        ? 'text-blue-600' 
                                        : 'text-slate-600'
                                    }`}>
                                      {displayName}
                                    </span>
                                    {showAdminBadge && (
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                                        Admin
                                      </span>
                                    )}
                                  </div>
                                )}
                                
                                {/* Message bubble */}
                                <div
                                  className={`rounded-2xl px-4 py-2 ${
                                    isCurrentUser
                                      ? 'bg-emerald-500 text-white rounded-tr-sm'
                                      : isAdmin
                                      ? 'bg-blue-500 text-white rounded-tl-sm'
                                      : 'bg-white text-slate-900 border border-slate-200 rounded-tl-sm'
                                  }`}
                                >
                                  <p className="text-sm break-words whitespace-pre-wrap">{msg.message}</p>
                                </div>
                                
                                {/* Timestamp (show on last message of group) */}
                                {(!messages[index + 1] || messages[index + 1].sender_email !== msg.sender_email) && (
                                  <div className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} px-1 mt-1`}>
                                    <span className="text-xs text-slate-400">
                                      {new Date(msg.created_at).toLocaleTimeString('en-US', { 
                                        hour: 'numeric', 
                                        minute: '2-digit',
                                        hour12: true 
                                      })}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </>
                    )}
                  </div>

                  {/* Input Area */}
                  <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-200">
                    <div className="flex gap-2 items-end">
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Type your message... (Press Enter to send)"
                        className="flex-1 min-h-[40px] max-h-[120px] px-3 py-2 border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        rows="1"
                        disabled={sendMessageMutation.isPending}
                        style={{ 
                          height: 'auto',
                          overflowY: message.split('\n').length > 3 ? 'scroll' : 'hidden'
                        }}
                        onInput={(e) => {
                          e.target.style.height = 'auto';
                          e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                        }}
                      />
                      <Button
                        type="submit"
                        disabled={!message.trim() || sendMessageMutation.isPending}
                        className="bg-emerald-500 hover:bg-emerald-600 h-10 w-10 p-0 flex-shrink-0"
                      >
                        {sendMessageMutation.isPending ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      Press Enter to send • Shift+Enter for new line
                    </p>
                  </form>
                </>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

