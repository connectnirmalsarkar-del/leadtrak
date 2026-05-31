import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import { useTerminology } from '@/lib/terminology';
import { Plus, Pencil, Trash2, Tag, IndianRupee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const emptyForm = { name: '', category: '', base_price: '', min_price: '', description: '', duration: '', active: true };

export default function ServicesPage() {
  const { user } = useAuth();
  const t = useTerminology();
  const [services, setServices] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const canManage = user && ['super_admin', 'org_admin', 'manager'].includes(user.role);

  const fetchServices = async () => {
    try {
      const { data } = await axios.get(`${API}/services`, { params: { include_inactive: true } });
      setServices(data);
    } catch (e) {
      toast.error('Failed to load services');
    }
  };

  useEffect(() => { fetchServices(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setForm({
      name: s.name || '',
      category: s.category || '',
      base_price: String(s.base_price ?? ''),
      min_price: String(s.min_price ?? ''),
      description: s.description || '',
      duration: s.duration || '',
      active: s.active !== false,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      base_price: parseFloat(form.base_price),
      min_price: parseFloat(form.min_price),
      description: form.description,
      duration: form.duration,
      active: form.active,
    };
    if (!payload.name || isNaN(payload.base_price) || isNaN(payload.min_price)) {
      toast.error('Name, base price and min price are required');
      return;
    }
    if (payload.min_price > payload.base_price) {
      toast.error('Min price cannot exceed base price');
      return;
    }
    try {
      if (editing) {
        await axios.put(`${API}/services/${editing._id}`, payload);
        toast.success('Service updated');
      } else {
        await axios.post(`${API}/services`, payload);
        toast.success('Service created');
      }
      setDialogOpen(false);
      fetchServices();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete service "${s.name}"?`)) return;
    try {
      await axios.delete(`${API}/services/${s._id}`);
      toast.success('Service deleted');
      fetchServices();
    } catch (e) {
      toast.error('Delete failed');
    }
  };

  return (
    <div className="space-y-6" data-testid="services-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Catalog</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>
            Services &amp; Pricing
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {services.length} {t.offerings.toLowerCase()} configured. Min price acts as the discount floor at deal close.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="add-service-btn">
            <Plus className="w-4 h-4 mr-2" />
            Add {t.offering}
          </Button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">{t.offering}</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Category</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em] text-right">Base Price</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em] text-right">Min Price</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Status</TableHead>
              {canManage && <TableHead className="font-semibold text-xs uppercase tracking-[0.1em] text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 6 : 5} className="text-center py-12 text-slate-500">
                  No {t.offerings.toLowerCase()} yet. Click "Add {t.offering}" to create one.
                </TableCell>
              </TableRow>
            ) : (
              services.map((s) => (
                <TableRow key={s._id} data-testid={`service-row-${s._id}`}>
                  <TableCell>
                    <div className="font-medium text-slate-900">{s.name}</div>
                    {s.duration && <div className="text-xs text-slate-500">{s.duration}</div>}
                  </TableCell>
                  <TableCell>
                    {s.category && (
                      <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
                        <Tag className="w-3 h-3 mr-1" />
                        {s.category}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-right">₹{Number(s.base_price).toLocaleString('en-IN')}</TableCell>
                  <TableCell className="font-mono text-sm text-right text-amber-700">₹{Number(s.min_price).toLocaleString('en-IN')}</TableCell>
                  <TableCell>
                    {s.active !== false ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">Inactive</Badge>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)} data-testid={`edit-service-${s._id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(s)} className="text-red-600 hover:text-red-700" data-testid={`delete-service-${s._id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} {t.offering}</DialogTitle>
            <DialogDescription>
              Min price acts as the floor at deal close — discounts below this will be blocked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="service-name-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="service-category-input" />
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="e.g. 2 years" data-testid="service-duration-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Base Price (₹) *</Label>
                <div className="relative">
                  <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input type="number" value={form.base_price} onChange={(e) => setForm({ ...form, base_price: e.target.value })} className="pl-7" data-testid="service-base-price-input" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Min Price (₹) *</Label>
                <div className="relative">
                  <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input type="number" value={form.min_price} onChange={(e) => setForm({ ...form, min_price: e.target.value })} className="pl-7" data-testid="service-min-price-input" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} data-testid="service-active-toggle" />
              <Label className="text-sm">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="save-service-btn">
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
