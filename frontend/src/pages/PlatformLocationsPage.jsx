import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { MapPin, Plus, Trash2, Pencil, Search, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function PlatformLocationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null); // null or { id, state, city }
  const [form, setForm] = useState({ state: '', city: '' });

  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      navigate('/dashboard');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const load = async () => {
    try {
      const { data } = await axios.get(`${API}/platform/locations`);
      setRows(data);
    } catch (e) { toast.error('Failed to load locations'); }
  };

  const states = useMemo(() => {
    const s = new Set(rows.map((r) => r.state));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stateFilter !== 'all' && r.state !== stateFilter) return false;
      if (!q) return true;
      return r.city.toLowerCase().includes(q) || r.state.toLowerCase().includes(q);
    });
  }, [rows, search, stateFilter]);

  const groupedByState = useMemo(() => {
    const map = {};
    rows.forEach((r) => { map[r.state] = (map[r.state] || 0) + 1; });
    return map;
  }, [rows]);

  const openAdd = () => {
    setEditing(null);
    setForm({ state: '', city: '' });
    setShowDialog(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({ state: row.state, city: row.city });
    setShowDialog(true);
  };

  const submit = async () => {
    const state = form.state.trim();
    const city = form.city.trim();
    if (!state || !city) { toast.error('Both state and city are required'); return; }
    try {
      if (editing) {
        await axios.put(`${API}/platform/locations/cities/${editing.id}`, { state, city });
        toast.success('Updated');
      } else {
        await axios.post(`${API}/platform/locations/cities`, { state, city });
        toast.success('City added');
      }
      setShowDialog(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    }
  };

  const toggleActive = async (row) => {
    try {
      await axios.put(`${API}/platform/locations/cities/${row.id}`, { is_active: !row.is_active });
      load();
    } catch (e) { toast.error('Failed'); }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete ${row.city}, ${row.state}?`)) return;
    try {
      await axios.delete(`${API}/platform/locations/cities/${row.id}`);
      toast.success('Deleted');
      load();
    } catch (e) { toast.error('Failed'); }
  };

  return (
    <div className="space-y-6 max-w-[1440px]" data-testid="platform-locations-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 mb-1.5">Platform</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>Locations</h1>
          <p className="text-sm text-slate-500 mt-1">Manage state-wise cities used in lead capture forms across all tenants.</p>
        </div>
        <Button onClick={openAdd} className="bg-violet-700 hover:bg-violet-800 text-white shadow-lg shadow-violet-100" data-testid="add-city-btn">
          <Plus className="w-4 h-4 mr-1.5" /> Add City
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1">States</p>
          <p className="text-2xl font-bold text-slate-900 font-mono">{Object.keys(groupedByState).length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1">Total Cities</p>
          <p className="text-2xl font-bold text-slate-900 font-mono">{rows.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1">Active</p>
          <p className="text-2xl font-bold text-emerald-700 font-mono">{rows.filter(r => r.is_active).length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1">Custom Added</p>
          <p className="text-2xl font-bold text-fuchsia-700 font-mono">{rows.filter(r => !r.is_default).length}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl">
        <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-slate-100">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search city or state…" className="pl-9" data-testid="locations-search" />
          </div>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-full sm:w-56" data-testid="locations-state-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">State</TableHead>
              <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">City</TableHead>
              <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Type</TableHead>
              <TableHead className="text-xs uppercase tracking-[0.1em] font-semibold">Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-slate-500">No locations match your filters</TableCell></TableRow>
            ) : filtered.slice(0, 500).map((r) => (
              <TableRow key={r.id} data-testid={`location-row-${r.id}`}>
                <TableCell className="font-medium text-slate-900">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-violet-600" />
                    {r.state}
                  </div>
                </TableCell>
                <TableCell className="text-slate-700">{r.city}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={r.is_default ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200'}>
                    {r.is_default ? 'Default' : 'Custom'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={r.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}>
                    {r.is_active ? 'Active' : 'Disabled'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <button onClick={() => toggleActive(r)} className="text-slate-400 hover:text-violet-700" title={r.is_active ? 'Disable' : 'Enable'} data-testid={`toggle-active-${r.id}`}>
                      {r.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button onClick={() => openEdit(r)} className="text-slate-400 hover:text-violet-700" title="Edit" data-testid={`edit-${r.id}`}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(r)} className="text-slate-400 hover:text-red-600" title="Delete" data-testid={`delete-${r.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length > 500 && (
          <div className="p-3 text-center text-xs text-slate-500 border-t border-slate-100">
            Showing first 500 of {filtered.length}. Use search/filter to narrow results.
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={(o) => { if (!o) setShowDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit City' : 'Add New City'}</DialogTitle>
            <DialogDescription>{editing ? 'Update the city name or move it to another state.' : 'New cities become available in lead capture forms instantly.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>State *</Label>
              <Input
                list="states-datalist"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                placeholder="e.g. Maharashtra"
                data-testid="city-form-state"
              />
              <datalist id="states-datalist">
                {states.map((s) => <option key={s} value={s} />)}
              </datalist>
              <p className="text-[11px] text-slate-500">Pick an existing state or type a new one.</p>
            </div>
            <div className="space-y-1.5">
              <Label>City *</Label>
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="e.g. Pune"
                data-testid="city-form-city"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={submit} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="submit-city-btn">
              {editing ? 'Save Changes' : 'Add City'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
