import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Users, Bot, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

export default function VisitorTable({ visitors, isLoading }) {
  if (isLoading) {
    return (
      <Card className="p-8 text-center">
        <p className="text-slate-500">Loading visitor logs...</p>
      </Card>
    );
  }

  if (!visitors || visitors.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-slate-500">No visitor logs found</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-slate-200">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="font-semibold text-slate-700">Time</TableHead>
              <TableHead className="font-semibold text-slate-700">Classification</TableHead>
              <TableHead className="font-semibold text-slate-700">Redirect</TableHead>
              <TableHead className="font-semibold text-slate-700">Location</TableHead>
              <TableHead className="font-semibold text-slate-700">ISP</TableHead>
              <TableHead className="font-semibold text-slate-700">Device</TableHead>
              <TableHead className="font-semibold text-slate-700">Browser</TableHead>
              <TableHead className="font-semibold text-slate-700">Destination</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visitors.map((visitor, index) => (
              <TableRow key={visitor.id || index} className="hover:bg-slate-50 transition-colors">
                <TableCell className="text-sm text-slate-600">
                  {visitor.visit_timestamp 
                    ? format(new Date(visitor.visit_timestamp), 'MMM d, HH:mm:ss')
                    : format(new Date(visitor.created_date), 'MMM d, HH:mm:ss')
                  }
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="secondary" 
                    className={`flex items-center gap-1 w-fit ${
                      visitor.classification === 'HUMAN' 
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
                        : 'bg-amber-100 text-amber-700 border-amber-200'
                    }`}
                  >
                    {visitor.classification === 'HUMAN' ? (
                      <Users className="w-3 h-3" />
                    ) : (
                      <Bot className="w-3 h-3" />
                    )}
                    {visitor.classification}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium text-slate-900">
                  {visitor.redirect_name || 'Unknown'}
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  <div>
                    <div className="font-medium">{visitor.country || 'Unknown'}</div>
                    {(visitor.city || visitor.region) && (
                      <div className="text-xs text-slate-400">
                        {[visitor.city, visitor.region].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  {visitor.isp || 'Unknown'}
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  {visitor.device || 'Unknown'}
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  {visitor.browser || 'Unknown'}
                </TableCell>
                <TableCell>
                  {visitor.redirected_to && (
                    <a 
                      href={visitor.redirected_to} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-slate-600 hover:text-slate-900 flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}