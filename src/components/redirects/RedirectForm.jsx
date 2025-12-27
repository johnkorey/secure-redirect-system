import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Save } from 'lucide-react';

export default function RedirectForm({ redirect, onSave, onCancel }) {
  const [formData, setFormData] = useState(redirect || {
    name: '',
    human_url: '',
    bot_url: '',
    is_enabled: true
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Card className="border-slate-200 shadow-lg">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="text-xl font-semibold text-slate-900">
          {redirect ? 'Edit Redirect' : 'Create New Redirect'}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium text-slate-700">
              Redirect Name
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Campaign 2024 Q1"
              required
              className="border-slate-200 focus:border-slate-400"
            />
            <p className="text-xs text-slate-500">A friendly name to identify this redirect</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="human_url" className="text-sm font-medium text-slate-700">
              Human Destination URL
            </Label>
            <Input
              id="human_url"
              type="url"
              value={formData.human_url}
              onChange={(e) => setFormData({ ...formData, human_url: e.target.value })}
              placeholder="https://example.com/landing-page"
              required
              className="border-slate-200 focus:border-emerald-400"
            />
            <p className="text-xs text-slate-500">Where human visitors will be redirected</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bot_url" className="text-sm font-medium text-slate-700">
              Bot Destination URL
            </Label>
            <Input
              id="bot_url"
              type="url"
              value={formData.bot_url}
              onChange={(e) => setFormData({ ...formData, bot_url: e.target.value })}
              placeholder="https://example.com/bot-page"
              required
              className="border-slate-200 focus:border-amber-400"
            />
            <p className="text-xs text-slate-500">Where detected bots will be redirected</p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              className="bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {redirect ? 'Update Redirect' : 'Create Redirect'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}