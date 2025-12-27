import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { ExternalLink, Copy, Edit, Trash2, Power, Users, Bot, MousePointerClick } from 'lucide-react';
import { toast } from "sonner";

export default function RedirectCard({ redirect, onEdit, onDelete, onToggle }) {
  const [copied, setCopied] = useState(false);
  
  const redirectUrl = `${window.location.origin}/r/${redirect.public_id}`;
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(redirectUrl);
    setCopied(true);
    toast.success("Redirect URL copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const humanRate = redirect.total_clicks > 0 
    ? Math.round((redirect.human_clicks / redirect.total_clicks) * 100) 
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={`p-6 border transition-all duration-300 hover:shadow-lg ${
        redirect.is_enabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-75'
      }`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold text-slate-900">{redirect.name}</h3>
              <Badge variant={redirect.is_enabled ? "default" : "secondary"} className={
                redirect.is_enabled 
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200" 
                  : "bg-slate-200 text-slate-600"
              }>
                {redirect.is_enabled ? 'Active' : 'Disabled'}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 px-3 py-2 rounded-lg mb-3 font-mono">
              <span className="truncate">{redirectUrl}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={copyToClipboard}
                className="h-6 w-6 ml-auto flex-shrink-0"
              >
                <Copy className={`w-3 h-3 ${copied ? 'text-emerald-600' : 'text-slate-400'}`} />
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-3">
              <div className="flex items-center gap-2">
                <MousePointerClick className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-500">Total Clicks</p>
                  <p className="text-lg font-semibold text-slate-900">{redirect.total_clicks || 0}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-500" />
                <div>
                  <p className="text-xs text-slate-500">Humans</p>
                  <p className="text-lg font-semibold text-emerald-600">{redirect.human_clicks || 0}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-amber-500" />
                <div>
                  <p className="text-xs text-slate-500">Bots</p>
                  <p className="text-lg font-semibold text-amber-600">{redirect.bot_clicks || 0}</p>
                </div>
              </div>
            </div>

            {redirect.total_clicks > 0 && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Human Rate</span>
                  <span>{humanRate}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${humanRate}%` }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <ExternalLink className="w-3 h-3 text-emerald-500" />
                <span className="text-slate-500">Human:</span>
                <a href={redirect.human_url} target="_blank" rel="noopener noreferrer" 
                   className="text-emerald-600 hover:underline truncate">
                  {redirect.human_url}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <ExternalLink className="w-3 h-3 text-amber-500" />
                <span className="text-slate-500">Bot:</span>
                <a href={redirect.bot_url} target="_blank" rel="noopener noreferrer" 
                   className="text-amber-600 hover:underline truncate">
                  {redirect.bot_url}
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onToggle(redirect)}
            className="flex items-center gap-2"
          >
            <Power className="w-3 h-3" />
            {redirect.is_enabled ? 'Disable' : 'Enable'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(redirect)}
            className="flex items-center gap-2"
          >
            <Edit className="w-3 h-3" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(redirect)}
            className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:border-red-300"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}