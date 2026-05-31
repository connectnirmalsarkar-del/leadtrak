import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Activity, CheckCircle2, XCircle, RefreshCw, Eye, Copy, AlertTriangle,
  TrendingUp, Webhook, Facebook, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const SOURCES = [
  { id: 'all', label: 'All Sources' },
  { id: 'facebook', label: 'Facebook Lead Ads' },
  { id: 'google_ads', label: 'Google Ads' },
];

const STATUSES = [
  { id: 'all', label: 'All Statuses' },
  { id: 'success', label: 'Success' },
  { id: 'failed', label: 'Failed' },
  { id: 'duplicate', label: 'Duplicate' },
];

const sourceLabel = (s) => {
  if (s === 'facebook') return 'Facebook';
  if (s === 'google_ads') return 'Google Ads';
  return s || '—';
};

const SourceIcon = ({ source, className }) => {
  if (source === 'facebook') return <Facebook className={className} />;
  if (source === 'google_ads') return <Webhook className={className} />;
  return <Activity className={className} />;
};

const statusBadge = (status) => {
  if (status === 'success') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'failed') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'duplicate') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const fmtRelative = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
};

export default function WebhookHealthPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(null); // full log doc
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (user && !['org_admin', 'super_admin'].includes(user.role)) {
      toast.error('Only Org Admins can view Webhook Health');
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const loadAll = async () => {
    try {
      const params = {};
      if (sourceFilter !== 'all') params.source = sourceFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      const [s, r] = await Promise.all([
        axios.get(`${API}/webhook-logs/stats`),
        axios.get(`${API}/webhook-logs`, { params }),
      ]);
      setStats(s.data);
      setRows(r.data);
    } catch (e) {
      toast.error('Failed to load webhook logs');
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFilter, statusFilter]);

  const openDetails = async (id) => {
    try {
      const { data } = await axios.get(`${API}/webhook-logs/${id}`);
      setSelected(data);
    } catch (e) { toast.error('Failed to open details'); }
  };

  const handleRetry = async () => {
    if (!selected) return;
    setRetrying(true);
    try {
      const { data } = await axios.post(`${API}/webhook-logs/${selected.id}/retry`);
      if (data.status === 'success') {
        toast.success(`Lead ${data.lead_id} created from retry`);
      } else if (data.status === 'duplicate') {
        toast.message('Lead already exists — counted as duplicate');
      } else {
        toast.message(data.reason || 'No-op');
      }
      setSelected(null);
      loadAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Retry failed');
    } finally { setRetrying(false); }
  };

  const copyPayload = () => {
    if (!selected) return;
    navigator.clipboard.writeText(JSON.stringify(selected.payload || {}, null, 2));
    toast.success('Payload copied');
  };

  const headlineCards = useMemo(() => ([
    { label: 'Total Events', value: stats?.total ?? '—', icon: Activity, color: 'violet' },
    { label: 'Success Rate', value: stats ? `${stats.success_rate}%` : '—', icon: TrendingUp, color: 'emerald' },
    { label: 'Failed', value: stats?.failed ?? '—', icon: XCircle, color: 'red' },
    { label: 'Last 24h', value: stats?.last_24h ?? '—', icon: RefreshCw, color: 'blue' },
  ]), [stats]);

  return (
    <div className="space-y-6 max-w-[1440px]" data-testid="webhook-health-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 mb-1.5">Integrations</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>Webhook Health</h1>
          <p className="text-sm text-slate-500 mt-1">Inbound deliveries from Facebook Lead Ads and Google Ads — debug missed leads and retry failed payloads.</p>
        </div>
        <Button onClick={loadAll} variant="outline" data-testid="refresh-logs-btn">
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Headline cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {headlineCards.map((c) => {
          const colors = {
            violet: 'bg-violet-50 text-violet-700',
            emerald: 'bg-emerald-50 text-emerald-700',
            red: 'bg-red-50 text-red-700',
            blue: 'bg-blue-50 text-blue-700',
          };
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className={`w-10 h-10 rounded-lg ${colors[c.color]} flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1">{c.label}</p>
              <p className="text-2xl font-bold text-slate-900 font-mono tracking-tighter" data-testid={`stat-${c.label.toLowerCase().replace(/\s+/g, '-')}`}>{c.value}</p>
            </div>
          );
        })}
      </div>

      {/* Per-source breakdown */}
      {stats && stats.by_source && stats.by_source.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.by_source.map((s) => (
            <div key={s.source} className="bg-white border border-slate-200 rounded-xl p-5" data-testid={`source-card-${s.source}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <SourceIcon source={s.source} className="w-5 h-5 text-slate-700" />
                  <h3 className="font-bold text-slate-900" style={{ fontFamily: 'Sora' }}>{sourceLabel(s.source)}</h3>
                </div>
                <span className="text-[11px] text-slate-500">
                  Last event {fmtRelative(s.last_event_at)}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <p className="text-[10px] uppercase text-slate-500 font-semibold">Total</p>
                  <p className="text-lg font-bold font-mono text-slate-900">{s.total}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-emerald-700 font-semibold">Success</p>
                  <p className="text-lg font-bold font-mono text-emerald-700">{s.success}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-red-700 font-semibold">Failed</p>
                  <p className="text-lg font-bold font-mono text-red-700">{s.failed}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-violet-700 font-semibold">Leads</p>
                  <p className="text-lg font-bold font-mono text-violet-700">{s.leads_imported}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters + Table */}
      <div className="bg-white border border-slate-200 rounded-xl">
        <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-slate-100">
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-full sm:w-56" data-testid="source-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOURCES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44" data-testid="status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">When</TableHead>
              <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Source</TableHead>
              <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Event</TableHead>
              <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Leads</TableHead>
              <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Notes</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-slate-500">No webhook events {sourceFilter !== 'all' || statusFilter !== 'all' ? 'match your filters' : 'yet'}.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id} data-testid={`log-row-${r.id}`}>
                <TableCell className="text-xs text-slate-600 whitespace-nowrap" title={r.created_at}>
                  {fmtRelative(r.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <SourceIcon source={r.source} className="w-3.5 h-3.5 text-slate-600" />
                    <span className="text-xs font-medium">{sourceLabel(r.source)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-slate-700">{r.event}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`capitalize ${statusBadge(r.status)}`}>
                    {r.status === 'success' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                    {r.status === 'failed' && <XCircle className="w-3 h-3 mr-1" />}
                    {r.status === 'duplicate' && <AlertTriangle className="w-3 h-3 mr-1" />}
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">{r.leads_imported || (r.duplicates ? `· ${r.duplicates} dup` : '0')}</TableCell>
                <TableCell className="text-xs text-slate-500 max-w-[260px] truncate">{r.error || '—'}</TableCell>
                <TableCell>
                  <button onClick={() => openDetails(r.id)} className="text-slate-400 hover:text-violet-700" title="View payload" data-testid={`view-log-${r.id}`}>
                    <Eye className="w-4 h-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected && <SourceIcon source={selected.source} className="w-4 h-4" />}
              Webhook Event
              {selected && (
                <Badge variant="outline" className={`ml-2 capitalize ${statusBadge(selected.status)}`}>
                  {selected.status}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {selected && (
                <span className="font-mono text-[11px] text-slate-500">
                  {selected.source} · {selected.event} · {selected.created_at ? new Date(selected.created_at).toLocaleString() : ''}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              {selected.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                  <p className="font-semibold mb-0.5">Error</p>
                  <p className="text-xs">{selected.error}</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-50 rounded-md p-3">
                  <p className="uppercase text-slate-500 font-semibold tracking-wide mb-0.5">Leads</p>
                  <p className="font-mono text-slate-900 text-base">{selected.leads_imported || 0}</p>
                </div>
                <div className="bg-slate-50 rounded-md p-3">
                  <p className="uppercase text-slate-500 font-semibold tracking-wide mb-0.5">Duplicates</p>
                  <p className="font-mono text-slate-900 text-base">{selected.duplicates || 0}</p>
                </div>
                <div className="bg-slate-50 rounded-md p-3">
                  <p className="uppercase text-slate-500 font-semibold tracking-wide mb-0.5">IP</p>
                  <p className="font-mono text-slate-700 text-xs">{selected.ip || '—'}</p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Payload</p>
                  <button onClick={copyPayload} className="text-slate-400 hover:text-violet-700" title="Copy">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <pre className="bg-slate-900 text-slate-200 text-[10px] p-3 rounded-lg overflow-x-auto max-h-[280px] font-mono leading-relaxed">
                  {JSON.stringify(selected.payload || {}, null, 2)}
                </pre>
              </div>
              {selected.response && (
                <div>
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Response</p>
                  <pre className="bg-slate-100 text-slate-700 text-[10px] p-3 rounded-lg overflow-x-auto max-h-[160px] font-mono">
                    {JSON.stringify(selected.response, null, 2)}
                  </pre>
                </div>
              )}
              {selected.status !== 'success' && (selected.source === 'facebook' || selected.source === 'google_ads') && (
                <div className="flex items-center justify-end pt-2 border-t border-slate-100">
                  <Button onClick={handleRetry} disabled={retrying} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="retry-webhook-btn">
                    <RotateCcw className={`w-4 h-4 mr-1.5 ${retrying ? 'animate-spin' : ''}`} />
                    {retrying ? 'Retrying…' : 'Retry Ingestion'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
