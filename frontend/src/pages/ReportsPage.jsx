import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import {
  Download, IndianRupee, Users, TrendingUp, Target, Trophy, Activity, UserCheck,
  ArrowUpRight, ArrowDownRight, Phone, Award, Layers, X, MessageSquare, Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { toast } from 'sonner';

const COLORS = ['#7C3AED', '#2563EB', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#8B5CF6'];

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const StatCard = ({ icon: Icon, label, value, sublabel, color = 'violet' }) => {
  const colors = {
    violet: 'bg-violet-50 text-violet-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    fuchsia: 'bg-fuchsia-50 text-fuchsia-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className={`w-10 h-10 rounded-lg ${colors[color]} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900 font-mono tracking-tighter">{value}</p>
      {sublabel && <p className="text-xs text-slate-500 mt-1">{sublabel}</p>}
    </div>
  );
};

export default function ReportsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Industry-specific column visibility — show Company / Budget where applicable
  const hasCompanyField = (user?.industry === 'it_software');
  const hasBudgetField = ['real_estate', 'travel'].includes(user?.industry);
  const [tab, setTab] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [callerRows, setCallerRows] = useState([]);
  const [managerRows, setManagerRows] = useState([]);
  const [callerSearch, setCallerSearch] = useState('');
  const [callerRoleFilter, setCallerRoleFilter] = useState('all');
  const [callerSort, setCallerSort] = useState('converted');

  // Drill-down: caller leads dialog
  const [drillCaller, setDrillCaller] = useState(null); // { id, name }
  const [drillLeads, setDrillLeads] = useState([]);
  const [drillLoading, setDrillLoading] = useState(false);

  const openCallerDrill = async (userId, name) => {
    setDrillCaller({ id: userId, name });
    setDrillLeads([]);
    setDrillLoading(true);
    try {
      const { data } = await axios.get(`${API}/reports/caller-leads/${userId}`);
      setDrillLeads(data.leads || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not load leads for this caller');
    } finally {
      setDrillLoading(false);
    }
  };

  const load = async () => {
    try {
      const [s, c, m] = await Promise.all([
        axios.get(`${API}/reports/total-summary`),
        axios.get(`${API}/reports/by-caller`),
        axios.get(`${API}/reports/by-manager`),
      ]);
      setSummary(s.data);
      setCallerRows(c.data);
      setManagerRows(m.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load reports');
    }
  };

  useEffect(() => { load(); }, []);

  const exportExcel = async () => {
    try {
      const res = await axios.get(`${API}/reports/export-leads-excel`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `leads_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Excel downloaded');
    } catch (e) { toast.error('Export failed'); }
  };

  const exportCsv = (rows, name, headers) => {
    if (!rows.length) { toast.error('No data to export'); return; }
    const csv = [headers.map(h => h.label).join(',')]
      .concat(rows.map(r => headers.map(h => {
        const v = typeof h.value === 'function' ? h.value(r) : r[h.value];
        return `"${(v ?? '').toString().replace(/"/g, '""')}"`;
      }).join(',')))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${name}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success(`${name} CSV downloaded`);
  };

  // Sort + filter caller rows
  const filteredCallers = useMemo(() => {
    const q = callerSearch.trim().toLowerCase();
    let rows = callerRows.filter((r) => {
      if (callerRoleFilter !== 'all' && r.role !== callerRoleFilter) return false;
      if (q && !r.name?.toLowerCase().includes(q)) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (callerSort === 'name') return (a.name || '').localeCompare(b.name || '');
      return (b[callerSort] || 0) - (a[callerSort] || 0);
    });
    return rows;
  }, [callerRows, callerSearch, callerRoleFilter, callerSort]);

  return (
    <div className="space-y-6 max-w-[1440px]" data-testid="reports-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 mb-1.5">Insights</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>Reports</h1>
          <p className="text-sm text-slate-500 mt-1">Total performance · Caller-wise · Manager-wise breakdowns</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportExcel} variant="outline" data-testid="export-excel-btn">
            <Download className="w-4 h-4 mr-1.5" /> All Leads (Excel)
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-xl text-xs sm:text-sm" data-testid="reports-tabs">
          <TabsTrigger value="overview" data-testid="tab-overview"><TrendingUp className="w-3.5 h-3.5 mr-1 sm:mr-1.5" /> <span className="hidden sm:inline">Overview</span><span className="sm:hidden">Total</span></TabsTrigger>
          <TabsTrigger value="caller" data-testid="tab-caller"><Phone className="w-3.5 h-3.5 mr-1 sm:mr-1.5" /> <span className="hidden sm:inline">By Caller</span><span className="sm:hidden">Caller</span></TabsTrigger>
          <TabsTrigger value="manager" data-testid="tab-manager"><Trophy className="w-3.5 h-3.5 mr-1 sm:mr-1.5" /> <span className="hidden sm:inline">By Manager</span><span className="sm:hidden">Manager</span></TabsTrigger>
        </TabsList>

        {/* ============== OVERVIEW ============== */}
        <TabsContent value="overview" className="mt-5 space-y-5">
          {summary && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={Users} label="Total Leads" value={summary.total_leads} sublabel={`+${summary.week_leads} this week`} color="violet" />
                <StatCard icon={Target} label="Conversion Rate" value={`${summary.conversion_rate}%`} sublabel={`${summary.converted} converted`} color="emerald" />
                <StatCard icon={IndianRupee} label="Revenue" value={inr(summary.revenue)} sublabel={`${summary.admissions_count} deals`} color="fuchsia" />
                <StatCard icon={Award} label="Avg Deal Size" value={inr(summary.avg_ticket_size)} sublabel={`Active leads: ${summary.active}`} color="amber" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={ArrowUpRight} label="Today" value={summary.today_leads} color="blue" />
                <StatCard icon={Activity} label="This Month" value={summary.month_leads} color="violet" />
                <StatCard icon={UserCheck} label="Active Team" value={summary.team_count} sublabel={`${summary.manager_count} managers`} color="emerald" />
                <StatCard icon={ArrowDownRight} label="Lost" value={summary.lost} color="red" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Lead Source breakdown */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-900" style={{ fontFamily: 'Sora' }}>Leads by Source</h3>
                    <Layers className="w-4 h-4 text-slate-400" />
                  </div>
                  {summary.by_source && summary.by_source.length > 0 ? (
                    <div style={{ width: '100%', height: 280, minWidth: 1, minHeight: 1 }}>
                      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                        <PieChart>
                          <Pie data={summary.by_source} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={90} label={(d) => d.source}>
                            {summary.by_source.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 py-12 text-center">No data yet</p>
                  )}
                </div>

                {/* Lead Status breakdown */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-slate-900" style={{ fontFamily: 'Sora' }}>Leads by Status</h3>
                    <Target className="w-4 h-4 text-slate-400" />
                  </div>
                  {summary.by_status && summary.by_status.length > 0 ? (
                    <div style={{ width: '100%', height: 280, minWidth: 1, minHeight: 1 }}>
                      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                        <BarChart data={summary.by_status} layout="vertical" margin={{ left: 50 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="status" tick={{ fontSize: 11 }} width={120} />
                          <Tooltip />
                          <Bar dataKey="count" fill="#7C3AED" radius={[0, 8, 8, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 py-12 text-center">No data yet</p>
                  )}
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* ============== BY CALLER ============== */}
        <TabsContent value="caller" className="mt-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-2 flex-1">
              <Input placeholder="Search caller name…" value={callerSearch} onChange={(e) => setCallerSearch(e.target.value)} className="max-w-xs" data-testid="caller-search" />
              <Select value={callerRoleFilter} onValueChange={setCallerRoleFilter}>
                <SelectTrigger className="w-full sm:w-44" data-testid="caller-role-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="counselor">Counselor</SelectItem>
                  <SelectItem value="telecaller">Telecaller</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
              <Select value={callerSort} onValueChange={setCallerSort}>
                <SelectTrigger className="w-full sm:w-48" data-testid="caller-sort"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="converted">Sort: Conversions ↓</SelectItem>
                  <SelectItem value="revenue">Sort: Revenue ↓</SelectItem>
                  <SelectItem value="total_leads">Sort: Total Leads ↓</SelectItem>
                  <SelectItem value="conversion_rate">Sort: Conv Rate ↓</SelectItem>
                  <SelectItem value="name">Sort: Name A-Z</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={() => exportCsv(filteredCallers, 'caller-report', [
                { label: 'Name', value: 'name' },
                { label: 'Role', value: 'role' },
                { label: 'Total Leads', value: 'total_leads' },
                { label: 'Hot', value: 'hot' },
                { label: 'Warm', value: 'warm' },
                { label: 'Cold', value: 'cold' },
                { label: 'Converted', value: 'converted' },
                { label: 'Lost', value: 'lost' },
                { label: 'Conv Rate %', value: 'conversion_rate' },
                { label: 'Revenue', value: 'revenue' },
                { label: 'Demos Total', value: 'demos_total' },
                { label: 'Demos Done', value: 'demos_done' },
              ])}
              data-testid="caller-export-btn"
            >
              <Download className="w-4 h-4 mr-1.5" /> CSV
            </Button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Caller</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Role</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold text-right">Total</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold text-right">Hot</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold text-right">Warm</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold text-right">Cold</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold text-right">Converted</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold text-right">Conv %</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold text-right">Revenue</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold text-right">Demos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCallers.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-12 text-slate-500">No callers match your filter</TableCell></TableRow>
                ) : filteredCallers.map((r, idx) => (
                  <TableRow key={r.user_id} data-testid={`caller-row-${r.user_id}`}>
                    <TableCell className="font-medium text-slate-900">
                      <div className="flex items-center gap-2.5">
                        {idx < 3 && callerSort === 'converted' && (
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-slate-200 text-slate-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {idx + 1}
                          </span>
                        )}
                        <button
                          onClick={() => openCallerDrill(r.user_id, r.name)}
                          className="text-violet-700 hover:text-violet-900 hover:underline text-left"
                          data-testid={`caller-drill-${r.user_id}`}
                          title="Click to see all leads assigned to this caller"
                        >
                          {r.name}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-xs bg-slate-50 text-slate-700 border-slate-200">{r.role}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{r.total_leads}</TableCell>
                    <TableCell className="text-right font-mono text-red-700">{r.hot}</TableCell>
                    <TableCell className="text-right font-mono text-amber-700">{r.warm}</TableCell>
                    <TableCell className="text-right font-mono text-slate-500">{r.cold}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-700 font-bold">{r.converted}</TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={r.conversion_rate >= 10 ? 'text-emerald-700 font-bold' : 'text-slate-700'}>{r.conversion_rate}%</span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{inr(r.revenue)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-slate-500">{r.demos_done}/{r.demos_total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ============== BY MANAGER ============== */}
        <TabsContent value="manager" className="mt-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            💡 <strong>Tip:</strong> Assign a manager to each counselor/telecaller from the Team Members page (set "Reports To" field). Unassigned members fall under "Unassigned" bucket.
          </div>
          <div className="flex items-center justify-end">
            <Button
              variant="outline"
              onClick={() => exportCsv(managerRows, 'manager-report', [
                { label: 'Manager', value: 'manager_name' },
                { label: 'Role', value: 'role' },
                { label: 'Team Size', value: 'team_size' },
                { label: 'Team Members', value: (r) => r.team_members.map(t => t.name).join('; ') },
                { label: 'Total Leads', value: 'total_leads' },
                { label: 'Hot', value: 'hot' },
                { label: 'Converted', value: 'converted' },
                { label: 'Lost', value: 'lost' },
                { label: 'Conv Rate %', value: 'conversion_rate' },
                { label: 'Revenue', value: 'revenue' },
              ])}
              data-testid="manager-export-btn"
            >
              <Download className="w-4 h-4 mr-1.5" /> CSV
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {managerRows.length === 0 ? (
              <p className="col-span-2 text-center py-12 text-slate-500">No managers yet</p>
            ) : managerRows.map((m, idx) => (
              <div key={m.manager_id || 'unassigned'} className="bg-white border border-slate-200 rounded-xl p-5" data-testid={`manager-card-${m.manager_id || 'unassigned'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {m.manager_id && idx < 3 && (
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-slate-200 text-slate-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        #{idx + 1}
                      </span>
                    )}
                    <div>
                      <p className="font-bold text-slate-900" style={{ fontFamily: 'Sora' }}>{m.manager_name}</p>
                      <p className="text-[11px] text-slate-500 capitalize">{m.role} · {m.team_size} team member{m.team_size !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-mono">
                    {m.conversion_rate}%
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div>
                    <p className="text-[10px] uppercase text-slate-500 font-semibold tracking-wide">Leads</p>
                    <p className="text-xl font-bold font-mono text-slate-900">{m.total_leads}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-emerald-700 font-semibold tracking-wide">Converted</p>
                    <p className="text-xl font-bold font-mono text-emerald-700">{m.converted}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-red-700 font-semibold tracking-wide">Lost</p>
                    <p className="text-xl font-bold font-mono text-red-700">{m.lost}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-fuchsia-700 font-semibold tracking-wide">Revenue</p>
                    <p className="text-xl font-bold font-mono text-fuchsia-700">{inr(m.revenue)}</p>
                  </div>
                </div>
                {m.team_members && m.team_members.length > 0 && (
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-[10px] uppercase text-slate-500 font-semibold tracking-wide mb-2">Team</p>
                    <div className="flex flex-wrap gap-1.5">
                      {m.team_members.map((t) => (
                        <Badge key={t.id} variant="outline" className="text-[10px] bg-slate-50 text-slate-700 border-slate-200">
                          {t.name} · {t.role}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* ============== CALLER LEADS DRILL-DOWN ============== */}
      <Dialog open={!!drillCaller} onOpenChange={(o) => { if (!o) { setDrillCaller(null); setDrillLeads([]); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" data-testid="caller-leads-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-violet-600" />
              Leads assigned to {drillCaller?.name}
            </DialogTitle>
            <DialogDescription>
              Click any lead to open its 360° timeline and add a comment for {drillCaller?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {drillLoading ? (
              <div className="py-12 text-center text-sm text-slate-400">Loading leads…</div>
            ) : drillLeads.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg">
                No leads currently assigned to this user.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Mobile</TableHead>
                    {hasCompanyField && <TableHead>Company</TableHead>}
                    {hasCompanyField && <TableHead>Designation</TableHead>}
                    {hasBudgetField && <TableHead>Budget</TableHead>}
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Temp.</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillLeads.map((l) => (
                    <TableRow key={l._id} data-testid={`drill-lead-${l._id}`}>
                      <TableCell className="font-medium text-slate-900">{l.name}</TableCell>
                      <TableCell className="text-xs text-slate-600 font-mono">{l.mobile}</TableCell>
                      {hasCompanyField && (
                        <TableCell className="text-xs text-slate-700">{l.company_name || '—'}</TableCell>
                      )}
                      {hasCompanyField && (
                        <TableCell className="text-xs text-slate-700">{l.designation || '—'}</TableCell>
                      )}
                      {hasBudgetField && (
                        <TableCell className="text-xs text-slate-700">{l.budget_range || '—'}</TableCell>
                      )}
                      <TableCell className="text-xs text-slate-500">{l.source || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{l.status || 'New'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] capitalize ${
                          l.temperature === 'hot' ? 'bg-red-50 text-red-700 border-red-200' :
                          l.temperature === 'warm' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>{l.temperature || '—'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/leads?leadId=${l._id}&tab=timeline`)}
                          data-testid={`open-comment-${l._id}`}
                        >
                          <MessageSquare className="w-3.5 h-3.5 mr-1" /> Comment
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter className="pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-500 mr-auto">{drillLeads.length} lead{drillLeads.length !== 1 ? 's' : ''}</span>
            <Button variant="ghost" onClick={() => { setDrillCaller(null); setDrillLeads([]); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
