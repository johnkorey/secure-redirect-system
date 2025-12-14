import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, UserPlus, Copy, Eye, EyeOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function UserManagement() {
  const [editUser, setEditUser] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [deleteUser, setDeleteUser] = useState(null);
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery({
    queryKey: ['api-users'],
    queryFn: () => base44.entities.APIUser.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.APIUser.create({
      ...data,
      api_key: `ak_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      current_usage: 0,
      credits: 0,
      status: data.status || 'active'
    }),
    onSuccess: (newUser) => {
      queryClient.invalidateQueries({ queryKey: ['api-users'] });
      setShowDialog(false);
      setEditUser(null);
      toast.success(`User created! API Key: ${newUser.api_key}`, { duration: 10000 });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.APIUser.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-users'] });
      setShowDialog(false);
      setEditUser(null);
      toast.success('User updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.APIUser.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-users'] });
      setDeleteUser(null);
      toast.success('User deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete user');
      console.error('Delete error:', error);
    }
  });

  const handleSave = (data) => {
    if (editUser) {
      updateMutation.mutate({ id: editUser.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = () => {
    if (deleteUser) {
      deleteMutation.mutate(deleteUser.id);
    }
  };

  const statusColors = {
    active: 'bg-emerald-100 text-emerald-700',
    paused: 'bg-amber-100 text-amber-700',
    expired: 'bg-red-100 text-red-700'
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">User Management</h1>
          <p className="text-slate-500">Manage API users and subscriptions</p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditUser(null)} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              New User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editUser ? 'Edit User' : 'Create User'}</DialogTitle>
            </DialogHeader>
            <UserForm user={editUser} onSave={handleSave} />
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Username</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>API Key</TableHead>
              <TableHead>Access Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Daily Limit</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.username}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-slate-100 px-2 py-1 rounded">
                      {user.api_key}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(user.api_key);
                        toast.success('API Key copied!');
                      }}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{user.access_type}</Badge>
                </TableCell>
                <TableCell>
                  <Badge className={statusColors[user.status]}>{user.status}</Badge>
                </TableCell>
                <TableCell>{user.daily_limit?.toLocaleString()}</TableCell>
                <TableCell>{user.current_usage || 0}</TableCell>
                <TableCell className="text-sm">
                  {user.subscription_expiry 
                    ? format(new Date(user.subscription_expiry), 'MMM d, yyyy')
                    : 'N/A'
                  }
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditUser(user);
                        setShowDialog(true);
                      }}
                    >
                      <Edit className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteUser(user)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteUser?.username}</strong> ({deleteUser?.email})?
              <br /><br />
              This action cannot be undone. All redirect links and visitor logs associated with this user will remain in the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UserForm({ user, onSave }) {
  const [formData, setFormData] = useState(user || {
    username: '',
    email: '',
    access_type: 'free',
    status: 'active',
    daily_limit: 1000,
    subscription_start: '',
    subscription_expiry: '',
    display_name: '',
    telegram_chat_id: '',
    referral_code: ''
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Username</Label>
          <Input
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Access Type</Label>
          <Select value={formData.access_type} onValueChange={(v) => setFormData({ ...formData, access_type: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="unlimited">Unlimited</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Daily Limit</Label>
          <Input
            type="number"
            value={formData.daily_limit}
            onChange={(e) => setFormData({ ...formData, daily_limit: parseInt(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label>Display Name</Label>
          <Input
            value={formData.display_name || ''}
            onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Subscription Start</Label>
          <Input
            type="date"
            value={formData.subscription_start || ''}
            onChange={(e) => setFormData({ ...formData, subscription_start: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Subscription Expiry</Label>
          <Input
            type="date"
            value={formData.subscription_expiry || ''}
            onChange={(e) => setFormData({ ...formData, subscription_expiry: e.target.value })}
          />
        </div>
      </div>

      <Button type="submit" className="w-full">
        {user ? 'Update User' : 'Create User'}
      </Button>
    </form>
  );
}