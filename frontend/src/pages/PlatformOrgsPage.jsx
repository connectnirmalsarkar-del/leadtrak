import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { API } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Users, UserPlus, Trash2, PauseCircle, PlayCircle, Layers, IndianRupee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function PlatformOrgsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState([]);
  const [stats, setStats] = useState({ total_organizations: 0, active_organizations: 0, total_users: 0, platform_revenue: 0 });
  const [showDialog, setShowDialog] = useState(false);
  const [created, setCreated] = useState(null);
  const [form, setForm] = useState({ organization_name: '', admin_name: '', admin_email: '', admin_password: '', subscription_plan: 'starter' });

  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      navigate('/dashboard');
      return;
    }
    load();
  }, [user]);

  const load = async () => {
    try {
      const [o, s] = await Promise.all([
        axios.get(`${API}/platform/organizations`),
        axios.get(`${API}/platform/stats`),
      ]);
      setOrgs(o.data);
      setStats(s.data);
    } catch (e) {
      toast.error('Failed to load platform data');
    }
  };

  const handleCreate = async () => {
    try {
      const { data } = await axios.post(`${API}/platform/organizations`, form);
      setCreated(data);
      toast.success('Organization created');
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
    } catch (e) {
      toast.error('Failed');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}" and ALL its data? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/platform/organizations/${id}`);
      toast.success('Deleted');
      load();
    } catch (e) {
      toast.error('Failed');
    }
  };

  const closeDialog = () => {
    setShowDialog(false);
    setCreated(null);
    setForm({ organization_name: '', admin_name: '', admin_email: '', admin_password: '', subscription_plan: 'starter' });
  };

  return (
    <div className="space-y-6 max-w-[1440px]" data-testid="platform-orgs-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 mb-1.5">Platform</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>Organizations</h1>
          <p className="text-sm text-slate-500 mt-1">Manage all tenants on the platform</p>
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
              <DialogDescription>Set up a new tenant workspace with the first admin user</DialogDescription>
            </DialogHeader>
            {created ? (
              <div className="space-y-4 py-2">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-emerald-900 mb-2">✅ Organization created!</p>
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

      {/* Orgs Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Organization</TableHead>
              <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Plan</TableHead>
              <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Users</TableHead>
              <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Leads</TableHead>
              <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Adm.</TableHead>
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
                  <Badge variant="outline" className="capitalize bg-violet-50 text-violet-700 border-violet-200">{o.subscription_plan}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={o.status === 'suspended' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}>
                    {o.status === 'suspended' ? 'Suspended' : 'Active'}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">{o.users_count}</TableCell>
                <TableCell className="font-mono text-sm">{o.leads_count}</TableCell>
                <TableCell className="font-mono text-sm">{o.admissions_count}</TableCell>
                <TableCell className="text-xs text-slate-500">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
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
    </div>
  );
}
