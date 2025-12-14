import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function PaymentManagement() {
  const queryClient = useQueryClient();

  const { data: payments = [] } = useQuery({
    queryKey: ['payments'],
    queryFn: () => base44.entities.Payment.list('-created_date'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Payment.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Payment updated');
    },
  });

  const handleVerify = (payment) => {
    updateMutation.mutate({
      id: payment.id,
      data: {
        status: 'verified',
        verified_date: new Date().toISOString()
      }
    });
  };

  const statusConfig = {
    pending: { icon: Clock, color: 'bg-amber-100 text-amber-700', label: 'Pending' },
    verified: { icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700', label: 'Verified' },
    failed: { icon: XCircle, color: 'bg-red-100 text-red-700', label: 'Failed' }
  };

  const cryptoColors = {
    BTC: 'bg-orange-100 text-orange-700',
    ETH: 'bg-blue-100 text-blue-700',
    TRX: 'bg-red-100 text-red-700',
    USDT: 'bg-green-100 text-green-700'
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Payment Management</h1>
        <p className="text-slate-500">Monitor and verify crypto payments</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-slate-500 mb-1">Total Payments</p>
          <p className="text-3xl font-bold text-slate-900">{payments.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 mb-1">Pending</p>
          <p className="text-3xl font-bold text-amber-600">
            {payments.filter(p => p.status === 'pending').length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 mb-1">Verified</p>
          <p className="text-3xl font-bold text-emerald-600">
            {payments.filter(p => p.status === 'verified').length}
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Date</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Crypto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>TX Hash</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => {
              const statusInfo = statusConfig[payment.status] || statusConfig.pending;
              const StatusIcon = statusInfo.icon;
              
              return (
                <TableRow key={payment.id}>
                  <TableCell className="text-sm">
                    {format(new Date(payment.created_date), 'MMM d, yyyy HH:mm')}
                  </TableCell>
                  <TableCell className="font-medium">{payment.username}</TableCell>
                  <TableCell className="font-semibold">${payment.amount}</TableCell>
                  <TableCell>
                    <Badge className={cryptoColors[payment.crypto_type]}>
                      {payment.crypto_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusInfo.color}>
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {statusInfo.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-slate-100 px-2 py-1 rounded">
                      {payment.tx_hash ? payment.tx_hash.substring(0, 12) + '...' : 'N/A'}
                    </code>
                  </TableCell>
                  <TableCell className="text-sm">
                    {payment.subscription_type || 'N/A'}
                  </TableCell>
                  <TableCell>
                    {payment.status === 'pending' && (
                      <Button
                        size="sm"
                        onClick={() => handleVerify(payment)}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Verify
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}