import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertCircle, Activity, Database, Mail, MessageCircle, Bitcoin } from 'lucide-react';

export default function APIStatus() {
  // Mock status data - in production this would come from actual health checks
  const systems = [
    { name: 'API Server', status: 'operational', icon: Activity, uptime: '99.9%' },
    { name: 'Database', status: 'operational', icon: Database, uptime: '99.95%' },
    { name: 'IP Intelligence', status: 'operational', icon: Activity, uptime: '99.7%' },
    { name: 'Email Service', status: 'operational', icon: Mail, uptime: '99.8%' },
    { name: 'Telegram Bot', status: 'degraded', icon: MessageCircle, uptime: '98.5%' },
    { name: 'Crypto Verification', status: 'operational', icon: Bitcoin, uptime: '99.6%' }
  ];

  const statusConfig = {
    operational: { 
      icon: CheckCircle, 
      color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      label: 'Operational' 
    },
    degraded: { 
      icon: AlertCircle, 
      color: 'bg-amber-100 text-amber-700 border-amber-200',
      label: 'Degraded' 
    },
    down: { 
      icon: XCircle, 
      color: 'bg-red-100 text-red-700 border-red-200',
      label: 'Down' 
    }
  };

  const overallStatus = systems.every(s => s.status === 'operational') 
    ? 'operational' 
    : systems.some(s => s.status === 'down') 
    ? 'down' 
    : 'degraded';

  const overallConfig = statusConfig[overallStatus];
  const OverallIcon = overallConfig.icon;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">API Status</h1>
        <p className="text-slate-500">Monitor system health and uptime</p>
      </div>

      {/* Overall Status */}
      <Card className={`p-8 border-2 ${overallConfig.color}`}>
        <div className="flex items-center gap-4">
          <OverallIcon className="w-12 h-12" />
          <div>
            <h2 className="text-2xl font-bold mb-1">
              All Systems {overallConfig.label}
            </h2>
            <p className="text-sm opacity-80">
              Last updated: {new Date().toLocaleTimeString()}
            </p>
          </div>
        </div>
      </Card>

      {/* System Components */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {systems.map((system) => {
          const config = statusConfig[system.status];
          const StatusIcon = config.icon;
          const SystemIcon = system.icon;

          return (
            <Card key={system.name} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <SystemIcon className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{system.name}</h3>
                    <p className="text-xs text-slate-500">Uptime: {system.uptime}</p>
                  </div>
                </div>
                <Badge className={config.color}>
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {config.label}
                </Badge>
              </div>

              <div className="h-16 flex items-end gap-1">
                {/* Mock uptime chart */}
                {Array.from({ length: 24 }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${
                      system.status === 'operational' 
                        ? 'bg-emerald-500' 
                        : system.status === 'degraded'
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ height: `${Math.random() * 60 + 40}%` }}
                  />
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Recent Incidents */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Recent Incidents</h3>
        <div className="space-y-3">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900">Telegram Bot Intermittent Issues</p>
                <p className="text-sm text-amber-700 mt-1">
                  Some users experiencing delays in Telegram notifications. Investigating...
                </p>
                <p className="text-xs text-amber-600 mt-2">2 hours ago</p>
              </div>
            </div>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5" />
              <div>
                <p className="font-medium text-slate-900">Database Maintenance Completed</p>
                <p className="text-sm text-slate-600 mt-1">
                  Scheduled maintenance completed successfully. All systems operational.
                </p>
                <p className="text-xs text-slate-500 mt-2">Yesterday at 3:00 AM</p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}