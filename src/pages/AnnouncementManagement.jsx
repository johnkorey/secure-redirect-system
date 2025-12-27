import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function AnnouncementManagement() {
  const [editAnnouncement, setEditAnnouncement] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const queryClient = useQueryClient();

  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => base44.entities.Announcement.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Announcement.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setShowDialog(false);
      setEditAnnouncement(null);
      toast.success('Announcement created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Announcement.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setShowDialog(false);
      setEditAnnouncement(null);
      toast.success('Announcement updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Announcement.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('Announcement deleted');
    },
  });

  const handleSave = (data) => {
    if (editAnnouncement) {
      updateMutation.mutate({ id: editAnnouncement.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const togglePublish = (announcement) => {
    updateMutation.mutate({
      id: announcement.id,
      data: { is_published: !announcement.is_published }
    });
  };

  const typeColors = {
    info: 'bg-blue-100 text-blue-700',
    warning: 'bg-amber-100 text-amber-700',
    success: 'bg-emerald-100 text-emerald-700',
    error: 'bg-red-100 text-red-700'
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Announcements</h1>
          <p className="text-slate-500">Create and manage system announcements</p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditAnnouncement(null)} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              New Announcement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editAnnouncement ? 'Edit Announcement' : 'Create Announcement'}
              </DialogTitle>
            </DialogHeader>
            <AnnouncementForm announcement={editAnnouncement} onSave={handleSave} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {announcements.map((announcement) => (
          <Card key={announcement.id} className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-semibold text-slate-900">{announcement.title}</h3>
                <Badge className={typeColors[announcement.type]}>
                  {announcement.type}
                </Badge>
                <Badge variant={announcement.is_published ? 'default' : 'secondary'}>
                  {announcement.is_published ? 'Published' : 'Draft'}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => togglePublish(announcement)}
                >
                  {announcement.is_published ? (
                    <><EyeOff className="w-3 h-3 mr-1" /> Unpublish</>
                  ) : (
                    <><Eye className="w-3 h-3 mr-1" /> Publish</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditAnnouncement(announcement);
                    setShowDialog(true);
                  }}
                >
                  <Edit className="w-3 h-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => deleteMutation.mutate(announcement.id)}
                  className="text-red-600"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <p className="text-slate-600 whitespace-pre-wrap">{announcement.content}</p>
            <div className="mt-4 text-sm text-slate-400">
              Created {format(new Date(announcement.created_date), 'MMM d, yyyy')}
            </div>
          </Card>
        ))}

        {announcements.length === 0 && (
          <Card className="p-12 text-center">
            <p className="text-slate-400">No announcements yet</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function AnnouncementForm({ announcement, onSave }) {
  const [formData, setFormData] = useState(announcement || {
    title: '',
    content: '',
    type: 'info',
    is_published: false
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-4">
      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Content</Label>
        <Textarea
          value={formData.content}
          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          rows={6}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" className="w-full">
        {announcement ? 'Update' : 'Create'} Announcement
      </Button>
    </form>
  );
}