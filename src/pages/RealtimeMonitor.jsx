import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Users, Bot, Globe, Clock, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function RealtimeMonitor() {
  const [filter, setFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: events = [], refetch } = useQuery({
    queryKey: ['realtime-events'],
    queryFn: () => base44.entities.RealtimeEvent.list('-created_date', 50),
    refetchInterval: autoRefresh ? 3000 : false,
  });

  const filteredEvents = filter === 'all' 
    ? events 
    : events.filter(e => e.visitor_type === filter.toUpperCase());

  const humanCount = events.filter(e => e.visitor_type === 'HUMAN').length;
  const botCount = events.filter(e => e.visitor_type === 'BOT').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Realtime Monitor</h1>
          <p className="text-slate-500">Live stream of incoming visitor classifications</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="flex items-center gap-2"
          >
            <Activity className={`w-4 h-4 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'Auto Refresh ON' : 'Auto Refresh OFF'}
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-center gap-3">
            <Globe className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-sm text-blue-700 font-medium">Total Events</p>
              <p className="text-2xl font-bold text-blue-900">{events.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-emerald-600" />
            <div>
              <p className="text-sm text-emerald-700 font-medium">Human Visitors</p>
              <p className="text-2xl font-bold text-emerald-900">{humanCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <div className="flex items-center gap-3">
            <Bot className="w-8 h-8 text-amber-600" />
            <div>
              <p className="text-sm text-amber-700 font-medium">Detected Bots</p>
              <p className="text-2xl font-bold text-amber-900">{botCount}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">All Events</TabsTrigger>
          <TabsTrigger value="human">Humans Only</TabsTrigger>
          <TabsTrigger value="bot">Bots Only</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Event Stream */}
      <Card className="p-6">
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {filteredEvents.map((event, index) => (
              <motion.div
                key={event.id || index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className="p-4 bg-white border border-slate-200 rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      event.visitor_type === 'HUMAN' 
                        ? 'bg-emerald-100 text-emerald-600' 
                        : 'bg-amber-100 text-amber-600'
                    }`}>
                      {event.visitor_type === 'HUMAN' ? (
                        <Users className="w-4 h-4" />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900">{event.ip_address}</span>
                        <Badge variant={event.visitor_type === 'HUMAN' ? 'success' : 'warning'}>
                          {event.visitor_type}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500">
                        {event.city}, {event.country} • {event.isp}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
                      <Clock className="w-3 h-3" />
                      {new Date(event.created_date).toLocaleTimeString()}
                    </div>
                    {event.response_time_ms && (
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Zap className="w-3 h-3" />
                        {event.response_time_ms}ms
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500 mb-1">Usage Type</p>
                    <Badge variant="outline" className="text-xs">
                      {event.usage_type || 'Unknown'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1">Detection Method</p>
                    <Badge variant="outline" className="text-xs">
                      {event.detection_method || 'N/A'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1">Origin</p>
                    <span className="text-slate-700 text-xs truncate block">
                      {event.origin_host || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1">Referrer</p>
                    <span className="text-slate-700 text-xs truncate block">
                      {event.referrer || 'Direct'}
                    </span>
                  </div>
                </div>

                {event.request_url && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-xs text-slate-500 mb-1">Request URL</p>
                    <code className="text-xs bg-slate-50 px-2 py-1 rounded text-slate-700 block truncate">
                      {event.request_url}
                    </code>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredEvents.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No events to display</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}