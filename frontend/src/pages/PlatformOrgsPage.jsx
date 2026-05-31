import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { API } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Plus, Users, UserPlus, Trash2, PauseCircle, PlayCircle,
  IndianRupee, Hourglass, ShoppingCart, Wallet, CalendarPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const planBadge = (plan) => {
  const p = (plan || 'starter').toLowerCase();
  if (p === 'enterprise') return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200';
  if (p === 'growth') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-violet-50 text-violet-700 border-violet-200';
};

const subStatusBadge = (status) => {
  if (status === 'trial') return 'bg-violet-50 text-violet-700 border-violet-200';
  if (status === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'expired') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

export default function PlatformOrgsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('organizations');
  const [orgs, setOrgs] = useState([]);
  const [trialRows, setTrialRows] = useState([]);
  const [abandonedRows, setAbandonedRows] = useState([]);
  const [orderRows, setOrderRows] = useState([]);
  const [plans, setPlans] = useState([]);
  const [stats, setStats] = useState({ total_organizations: 0, active_organizations: 0, total_users: 0, platform_revenue: 0 });
  const [showDialog, setShowDialog] = useState(false);
  const [created, setCreated] = useState(null);
  const [form, setForm] = useState({ organization_name: '', industry: 'education', admin_name: '', admin_email: '', admin_password: '', subscription_plan: 'starter' });
  const [industries, setIndustries] = useState([]);

  // Manual payment dialog state
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    organization_id: '',
    plan_id: '',
    billing_cycle: 'monthly',
    amount: '',
    payment_method: 'cash',
    reference: '',
    notes: '',
  });
  const [lastReceipt, setLastReceipt] = useState(null);

  // Extend trial dialog
  const [trialDialog, setTrialDialog] = useState(null); // { id, name, days }
  const [extendDays, setExtendDays] = useState(7);

  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      navigate('/dashboard');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== 'super_admin') return;
    if (tab === 'trials') loadTrials();
    if (tab === 'abandoned') loadAbandoned();
    if (tab === 'orders') loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const load = async () => {
    try {
      const [o, s, pl, ind] = await Promise.all([
        axios.get(`${API}/platform/organizations`),
        axios.get(`${API}/platform/stats`),
        axios.get(`${API}/subscription-plans`),
        axios.get(`${API}/industries`),
      ]);
      setOrgs(o.data);
      setStats(s.data);
      setPlans(pl.data);
      setIndustries(ind.data || []);
    } catch (e) {
      toast.error('Failed to load platform data');
    }
  };

  const loadTrials = async () => {
    try {
      const { data } = await axios.get(`${API}/platform/trial-report`);
      setTrialRows(data);
    } catch (e) { toast.error('Failed to load trial report'); }
  };

  const loadAbandoned = async () => {
    try {
      const { data } = await axios.get(`${API}/platform/abandoned-carts`);
      setAbandonedRows(data);
    } catch (e) { toast.error('Failed to load abandoned carts'); }
  };

  const loadOrders = async () => {
    try {
      const { data } = await axios.get(`${API}/platform/subscription-orders`);
      setOrderRows(data);
    } catch (e) { toast.error('Failed to load orders'); }
  };

  const handleCreate = async () => {
    try {
      const { data } = await axios.post(`${API}/platform/organizations`, form);
      setCreated(data);
      toast.success('Organization created — 14-day trial activated');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create');
    }
  };

  const toggleStatus = async (id) => {
    try {
      await axios.put(`${API}/platform/organizations/${id}/toggle`);
      toast.success('Status updated');
      load();
    } catch (e) { toast.error('Failed'); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}" and ALL its data? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/platform/organizations/${id}`);
      toast.success('Deleted');
      load();
    } catch (e) { toast.error('Failed'); }
  };

  const closeDialog = () => {
    setShowDialog(false);
    setCreated(null);
    setForm({ organization_name: '', industry: 'education', admin_name: '', admin_email: '', admin_mobile: '', admin_password: '', subscription_plan: 'starter' });
  };

  const openManualPayment = (org) => {
    setPaymentForm({
      organization_id: org.id,
      plan_id: '',
      billing_cycle: 'monthly',
      amount: '',
      payment_method: 'cash',
      reference: '',
      notes: '',
    });
    setLastReceipt(null);
    setPaymentDialog(true);
  };

  const handleManualPayment = async () => {
    if (!paymentForm.organization_id || !paymentForm.plan_id || !paymentForm.amount) {
      toast.error('Please select plan and enter amount');
      return;
    }
    try {
      const { data } = await axios.post(`${API}/platform/manual-payment`, {
        ...paymentForm,
        amount: parseFloat(paymentForm.amount),
      });
      setLastReceipt(data);
      toast.success('Payment recorded');
      load();
      if (tab === 'orders') loadOrders();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    }
  };

  const onSelectPlanForPayment = (planId) => {
    const plan = plans.find((p) => p.id === planId);
    if (plan) {
      const price = paymentForm.billing_cycle === 'annual' ? plan.price_annual : plan.price_monthly;
      setPaymentForm({ ...paymentForm, plan_id: planId, amount: String(price) });
    }
  };

  const onChangeBillingCycle = (cycle) => {
    const plan = plans.find((p) => p.id === paymentForm.plan_id);
    const price = plan ? (cycle === 'annual' ? plan.price_annual : plan.price_monthly) : '';
    setPaymentForm({ ...paymentForm, billing_cycle: cycle, amount: price ? String(price) : paymentForm.amount });
  };

  const handleExtendTrial = async () => {
    if (!trialDialog) return;
    try {
      await axios.post(`${API}/platform/organizations/${trialDialog.id}/extend-trial?days=${extendDays}`);
      toast.success(`Extended by ${extendDays} days`);
      setTrialDialog(null);
      if (tab === 'trials') loadTrials();
      load();
    } catch (e) { toast.error('Failed'); }
  };

  return (
    <div className="space-y-6 max-w-[1440px]" data-testid="platform-orgs-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 mb-1.5">Platform</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>SaaS Control Center</h1>
          <p className="text-sm text-slate-500 mt-1">Organizations · Trials · Billing · Abandoned carts</p>
        </div>
        <Dialog open={showDialog} onOpenChange={(o) => { if (!o) closeDialog(); else setShowDialog(true); }}>
          <DialogTrigger asChild>
            <Button className="bg-violet-700 hover:bg-violet-800 text-white shadow-lg shadow-violet-100" data-testid="create-org-btn">
              <Plus className="w-4 h-4 mr-1.5" />
              New Organization
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New Organization</DialogTitle>
              <DialogDescription>Set up a new tenant workspace. A 14-day trial will start automatically.</DialogDescription>
            </DialogHeader>
            {created ? (
              <div className="space-y-4 py-2">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-emerald-900 mb-2">✅ Organization created with 14-day trial</p>
                  <div className="bg-white rounded-md p-3 font-mono text-xs space-y-1">
                    <p><span className="text-slate-500">Org:</span> {created.name}</p>
                    <p><span className="text-slate-500">Admin Email:</span> {created.admin_email}</p>
                    <p className="text-slate-500 mt-2">Share login URL + the password you set with the admin.</p>
                  </div>
                </div>
                <Button onClick={closeDialog} className="w-full">Done</Button>
              </div>
            ) : (
              <>
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5">
                    <Label>Organization Name *</Label>
                    <Input value={form.organization_name} onChange={(e) => setForm({ ...form, organization_name: e.target.value })} placeholder="Apex Coaching Institute" data-testid="org-name-field" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>What industry are you in? *</Label>
                    <Select value={form.industry} onValueChange={(v) => setForm({ ...form, industry: v })}>
                      <SelectTrigger data-testid="industry-field"><SelectValue placeholder="Select industry" /></SelectTrigger>
                      <SelectContent>
                        {industries.length === 0 ? (
                          <SelectItem value="education">Education</SelectItem>
                        ) : industries.map((i) => (
                          <SelectItem key={i.key} value={i.key}>{i.label || i.name || i.key}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-slate-500">This pre-configures default services, lead statuses, and terminology for the tenant.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Admin Name *</Label>
                      <Input value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} placeholder="Priya Sharma" data-testid="admin-name-field" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Plan</Label>
                      <Select value={form.subscription_plan} onValueChange={(v) => setForm({ ...form, subscription_plan: v })}>
                        <SelectTrigger data-testid="plan-field"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="starter">Starter</SelectItem>
                          <SelectItem value="growth">Growth</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Admin Email *</Label>
                    <Input type="email" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} placeholder="admin@apex.com" data-testid="admin-email-field" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Admin Mobile / Phone</Label>
                    <Input type="tel" value={form.admin_mobile} onChange={(e) => setForm({ ...form, admin_mobile: e.target.value })} placeholder="+91 98765 43210" data-testid="admin-mobile-field" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Admin Password *</Label>
                    <Input type="password" value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} placeholder="Set initial password" data-testid="admin-password-field" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                  <Button onClick={handleCreate} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="submit-create-org-btn">Create Organization</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Platform Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Building2, label: 'Total Orgs', value: stats.total_organizations, color: 'violet' },
          { icon: Users, label: 'Active Orgs', value: stats.active_organizations, color: 'emerald' },
          { icon: UserPlus, label: 'Total Users', value: stats.total_users, color: 'blue' },
          { icon: IndianRupee, label: 'Platform Revenue', value: `₹${(stats.platform_revenue || 0).toLocaleString('en-IN')}`, color: 'fuchsia' },
        ].map((s, i) => {
          const Icon = s.icon;
          const colors = {
            violet: 'bg-violet-50 text-violet-700',
            emerald: 'bg-emerald-50 text-emerald-700',
            blue: 'bg-blue-50 text-blue-700',
            fuchsia: 'bg-fuchsia-50 text-fuchsia-700',
          };
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white border border-slate-200 rounded-xl p-5"
            >
              <div className={`w-10 h-10 rounded-lg ${colors[s.color]} flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1">{s.label}</p>
              <p className="text-2xl font-bold text-slate-900 font-mono tracking-tighter">{s.value}</p>
            </motion.div>
          );
        })}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4 max-w-2xl" data-testid="platform-tabs">
          <TabsTrigger value="organizations" data-testid="tab-organizations">
            <Building2 className="w-3.5 h-3.5 mr-1.5" /> Organizations
          </TabsTrigger>
          <TabsTrigger value="trials" data-testid="tab-trials">
            <Hourglass className="w-3.5 h-3.5 mr-1.5" /> Trials
          </TabsTrigger>
          <TabsTrigger value="abandoned" data-testid="tab-abandoned">
            <ShoppingCart className="w-3.5 h-3.5 mr-1.5" /> Abandoned
          </TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders">
            <Wallet className="w-3.5 h-3.5 mr-1.5" /> Orders
          </TabsTrigger>
        </TabsList>

        {/* ORGANIZATIONS */}
        <TabsContent value="organizations" className="mt-5">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Organization</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Plan</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Subscription</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Days Left</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Users</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Leads</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-slate-500">No organizations yet</TableCell></TableRow>
                ) : orgs.map((o) => (
                  <TableRow key={o.id} data-testid={`org-row-${o.id}`}>
                    <TableCell className="font-medium text-slate-900">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-md bg-gradient-to-br from-violet-100 to-fuchsia-100 flex items-center justify-center text-violet-700 font-bold text-xs">
                          {o.name.slice(0, 2).toUpperCase()}
                        </div>
                        {o.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${planBadge(o.subscription_plan)}`}>{o.subscription_plan}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${subStatusBadge(o.subscription_status)}`} data-testid={`sub-status-${o.id}`}>
                        {o.subscription_status || 'active'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {o.days_remaining !== null && o.days_remaining !== undefined ? (
                        <span className={o.days_remaining <= 7 ? 'text-amber-700 font-semibold' : 'text-slate-700'}>{o.days_remaining}d</span>
                      ) : <span className="text-slate-400">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{o.users_count}</TableCell>
                    <TableCell className="font-mono text-sm">{o.leads_count}</TableCell>
                    <TableCell className="text-xs text-slate-500">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button onClick={() => openManualPayment(o)} className="text-slate-400 hover:text-emerald-700" title="Record Payment" data-testid={`pay-${o.id}`}>
                          <Wallet className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setTrialDialog({ id: o.id, name: o.name }); setExtendDays(7); }} className="text-slate-400 hover:text-violet-700" title="Extend Trial" data-testid={`extend-${o.id}`}>
                          <CalendarPlus className="w-4 h-4" />
                        </button>
                        <button onClick={() => toggleStatus(o.id)} className="text-slate-400 hover:text-violet-700" title={o.status === 'suspended' ? 'Activate' : 'Suspend'} data-testid={`toggle-${o.id}`}>
                          {o.status === 'suspended' ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
                        </button>
                        <button onClick={() => handleDelete(o.id, o.name)} className="text-slate-400 hover:text-red-600" title="Delete" data-testid={`delete-org-${o.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TRIALS */}
        <TabsContent value="trials" className="mt-5">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Organization</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Admin Contact</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Plan</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Trial Start</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Trial End</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Days Left</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trialRows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-slate-500">No trials at the moment</TableCell></TableRow>
                ) : trialRows.map((r) => (
                  <TableRow key={r.id} data-testid={`trial-row-${r.id}`}>
                    <TableCell className="font-medium text-slate-900">{r.name}</TableCell>
                    <TableCell>
                      <div className="text-xs">
                        <p className="text-slate-900">{r.admin_name}</p>
                        <p className="text-slate-500">{r.admin_email}</p>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className={`capitalize ${planBadge(r.subscription_plan)}`}>{r.subscription_plan}</Badge></TableCell>
                    <TableCell className="text-xs text-slate-600">{r.trial_start_date ? new Date(r.trial_start_date).toLocaleDateString() : '—'}</TableCell>
                    <TableCell className="text-xs text-slate-600">{r.trial_end_date ? new Date(r.trial_end_date).toLocaleDateString() : '—'}</TableCell>
                    <TableCell className="font-mono text-sm">
                      <span className={r.days_remaining <= 3 ? 'text-red-700 font-semibold' : r.days_remaining <= 7 ? 'text-amber-700 font-semibold' : 'text-slate-700'}>
                        {r.days_remaining}d
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={subStatusBadge(r.status)}>{r.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button onClick={() => { setTrialDialog({ id: r.id, name: r.name }); setExtendDays(7); }} className="text-slate-400 hover:text-violet-700" title="Extend Trial" data-testid={`trial-extend-${r.id}`}>
                          <CalendarPlus className="w-4 h-4" />
                        </button>
                        <button onClick={() => openManualPayment(r)} className="text-slate-400 hover:text-emerald-700" title="Record Payment" data-testid={`trial-pay-${r.id}`}>
                          <Wallet className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ABANDONED */}
        <TabsContent value="abandoned" className="mt-5">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Organization</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Admin Contact</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Plan</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Amount</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Started</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Age</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {abandonedRows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-slate-500">No abandoned carts 🎉</TableCell></TableRow>
                ) : abandonedRows.map((r) => (
                  <TableRow key={r.id} data-testid={`abandoned-row-${r.id}`}>
                    <TableCell className="font-medium text-slate-900">{r.organization_name}</TableCell>
                    <TableCell>
                      <div className="text-xs">
                        <p className="text-slate-900">{r.admin_name}</p>
                        <p className="text-slate-500">{r.admin_email}</p>
                        {r.admin_mobile && <p className="text-slate-500">{r.admin_mobile}</p>}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className={planBadge(r.plan_name)}>{r.plan_name} · {r.billing_cycle}</Badge></TableCell>
                    <TableCell className="font-mono text-sm">₹{(r.amount || 0).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-xs text-slate-600">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{r.age_hours}h</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={r.status === 'abandoned' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <button onClick={() => openManualPayment({ id: r.organization_id, name: r.organization_name })} className="text-slate-400 hover:text-emerald-700" title="Record Offline Payment" data-testid={`recover-${r.id}`}>
                        <Wallet className="w-4 h-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ORDERS */}
        <TabsContent value="orders" className="mt-5">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Organization</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Plan</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Amount</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Method</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Recorded By</TableHead>
                  <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Paid At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderRows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-12 text-slate-500">No orders yet</TableCell></TableRow>
                ) : orderRows.map((r) => (
                  <TableRow key={r.id} data-testid={`order-row-${r.id}`}>
                    <TableCell className="font-medium text-slate-900">{r.organization_name}</TableCell>
                    <TableCell><Badge variant="outline" className={planBadge(r.plan_name)}>{r.plan_name} · {r.billing_cycle}</Badge></TableCell>
                    <TableCell className="font-mono text-sm">₹{(r.amount || 0).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-xs capitalize">{(r.payment_method || '').replace('_', ' ')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        r.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : r.status === 'abandoned' ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                      }>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{r.recorded_by || '—'}</TableCell>
                    <TableCell className="text-xs text-slate-500">{r.paid_at ? new Date(r.paid_at).toLocaleString() : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Manual Payment Dialog */}
      <Dialog open={paymentDialog} onOpenChange={(o) => { if (!o) { setPaymentDialog(false); setLastReceipt(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Offline Payment</DialogTitle>
            <DialogDescription>Mark a Cash / Cheque / Bank Transfer payment to activate the subscription.</DialogDescription>
          </DialogHeader>
          {lastReceipt ? (
            <div className="space-y-4 py-2">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-emerald-900 mb-2">✅ Payment recorded</p>
                <div className="bg-white rounded-md p-3 font-mono text-xs space-y-1">
                  <p><span className="text-slate-500">Receipt:</span> {lastReceipt.receipt_no}</p>
                  <p><span className="text-slate-500">Subscription Valid Till:</span> {new Date(lastReceipt.subscription_end_date).toLocaleDateString()}</p>
                </div>
                <p className="text-xs text-slate-600 mt-2">{lastReceipt.message}</p>
              </div>
              <Button onClick={() => { setPaymentDialog(false); setLastReceipt(null); }} className="w-full">Done</Button>
            </div>
          ) : (
            <>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Plan *</Label>
                    <Select value={paymentForm.plan_id} onValueChange={onSelectPlanForPayment}>
                      <SelectTrigger data-testid="payment-plan-select"><SelectValue placeholder="Select plan" /></SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Billing Cycle *</Label>
                    <Select value={paymentForm.billing_cycle} onValueChange={onChangeBillingCycle}>
                      <SelectTrigger data-testid="payment-cycle-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly (30 days)</SelectItem>
                        <SelectItem value="annual">Annual (365 days)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Amount Received (₹) *</Label>
                  <Input type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} placeholder="e.g. 2999" data-testid="payment-amount-input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Payment Method *</Label>
                    <Select value={paymentForm.payment_method} onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_method: v })}>
                      <SelectTrigger data-testid="payment-method-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer / NEFT</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="upi">UPI</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reference</Label>
                    <Input value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} placeholder="Cheque/Txn no." />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} placeholder="Any internal notes…" rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPaymentDialog(false)}>Cancel</Button>
                <Button onClick={handleManualPayment} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="submit-manual-payment-btn">Record Payment</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Extend Trial Dialog */}
      <Dialog open={!!trialDialog} onOpenChange={(o) => { if (!o) setTrialDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Extend Trial</DialogTitle>
            <DialogDescription>Grant additional trial days for {trialDialog?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Add Days</Label>
              <Input type="number" min={1} max={365} value={extendDays} onChange={(e) => setExtendDays(parseInt(e.target.value) || 1)} data-testid="extend-days-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrialDialog(null)}>Cancel</Button>
            <Button onClick={handleExtendTrial} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="confirm-extend-btn">Extend by {extendDays} days</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
