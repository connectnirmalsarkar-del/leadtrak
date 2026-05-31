import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import { LifeBuoy, Plus, Send, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';

const STATUS_COLORS = {
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-slate-50 text-slate-700 border-slate-200',
};

const PRIORITY_COLORS = {
  Low: 'bg-slate-50 text-slate-700 border-slate-200',
  Medium: 'bg-blue-50 text-blue-700 border-blue-200',
  High: 'bg-amber-50 text-amber-700 border-amber-200',
  Urgent: 'bg-red-50 text-red-700 border-red-200',
};

const CATEGORIES = ['Bug', 'Feature Request', 'Billing', 'Integration', 'General', 'Account'];

const timeAgo = (iso) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
};

export default function SupportTicketsPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ subject: '', category: 'General', priority: 'Medium', message: '' });
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState('');

  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const { data } = await axios.get(`${API}/support-tickets`);
      setTickets(data);
    } catch (e) { toast.error('Failed to load tickets'); }
  };

  const handleCreate = async () => {
    try {
      await axios.post(`${API}/support-tickets`, form);
      toast.success('Ticket created');
      setShowNew(false);
      setForm({ subject: '', category: 'General', priority: 'Medium', message: '' });
      load();
    } catch (e) { toast.error('Failed to create ticket'); }
  };

  const openTicket = async (id) => {
    try {
      const { data } = await axios.get(`${API}/support-tickets/${id}`);
      setSelected(data);
    } catch (e) { toast.error('Failed to load ticket'); }
  };

  const handleReply = async () => {
    if (!reply.trim()) return;
    try {
      await axios.post(`${API}/support-tickets/${selected._id}/reply`, { message: reply });
      setReply('');
      openTicket(selected._id);
      load();
    } catch (e) { toast.error('Failed to reply'); }
  };

  const updateStatus = async (status) => {
    try {
      await axios.put(`${API}/support-tickets/${selected._id}/status`, { status });
      toast.success('Status updated');
      openTicket(selected._id);
      load();
    } catch (e) { toast.error('Failed to update status'); }
  };

  return (
    <div className="space-y-6 max-w-[1440px]" data-testid="support-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 mb-1.5">{isSuperAdmin ? 'Platform Support' : 'Support'}</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>Support Tickets</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isSuperAdmin ? 'View and respond to tickets across all organizations' : 'Raise a ticket — our team will respond within 24 hours'}
          </p>
        </div>
        {!isSuperAdmin && (
          <Dialog open={showNew} onOpenChange={setShowNew}>
            <DialogTrigger asChild>
              <Button className="bg-violet-700 hover:bg-violet-800 text-white shadow-lg shadow-violet-100" data-testid="new-ticket-btn">
                <Plus className="w-4 h-4 mr-1.5" />
                New Ticket
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Raise a Support Ticket</DialogTitle>
                <DialogDescription>Tell us what's wrong or what you need help with</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label>Subject *</Label>
                  <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Briefly describe your issue" data-testid="ticket-subject-input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger data-testid="ticket-category-select"><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Priority</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                      <SelectTrigger data-testid="ticket-priority-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Describe in detail *</Label>
                  <Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={5} placeholder="Steps to reproduce, expected behaviour, screenshots URLs..." data-testid="ticket-message-input" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
                <Button onClick={handleCreate} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="submit-ticket-btn">Submit Ticket</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {tickets.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <div className="w-16 h-16 mx-auto bg-violet-50 rounded-full flex items-center justify-center mb-4">
            <LifeBuoy className="w-8 h-8 text-violet-400" />
          </div>
          <p className="text-slate-600 font-medium">No tickets yet</p>
          <p className="text-xs text-slate-400 mt-1">{isSuperAdmin ? 'Tenants haven\'t raised any tickets' : 'Raise your first ticket above'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <div
              key={t._id}
              onClick={() => openTicket(t._id)}
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-violet-300 hover:shadow-md cursor-pointer transition-all"
              data-testid={`ticket-card-${t._id}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-mono text-slate-500">{t.ticket_no}</span>
                    <Badge variant="outline" className={STATUS_COLORS[t.status] || STATUS_COLORS.open}>{t.status?.replace('_', ' ')}</Badge>
                    <Badge variant="outline" className={PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.Medium}>{t.priority}</Badge>
                    <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">{t.category}</Badge>
                  </div>
                  <h3 className="font-semibold text-slate-900 truncate" style={{ fontFamily: 'Sora' }}>{t.subject}</h3>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                    <span>{t.creator_name}</span>
                    {isSuperAdmin && t.organization_name && (
                      <>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{t.organization_name}</span>
                      </>
                    )}
                    <span className="text-slate-300">•</span>
                    <span>{timeAgo(t.updated_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ticket Detail Drawer */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto flex flex-col">
          {selected && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-slate-500">{selected.ticket_no}</span>
                  <Badge variant="outline" className={STATUS_COLORS[selected.status]}>{selected.status?.replace('_', ' ')}</Badge>
                  <Badge variant="outline" className={PRIORITY_COLORS[selected.priority]}>{selected.priority}</Badge>
                </div>
                <SheetTitle className="text-xl" style={{ fontFamily: 'Sora' }}>{selected.subject}</SheetTitle>
                <SheetDescription>
                  {selected.category} · raised by {selected.creator_name}
                  {isSuperAdmin && selected.organization_name && ` · ${selected.organization_name}`}
                </SheetDescription>
              </SheetHeader>

              {(isSuperAdmin || user?.role === 'org_admin') && (
                <div className="flex gap-2 mt-4">
                  {['open', 'in_progress', 'resolved', 'closed'].map((st) => (
                    <button
                      key={st}
                      onClick={() => updateStatus(st)}
                      className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${selected.status === st ? STATUS_COLORS[st] : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      data-testid={`set-status-${st}`}
                    >
                      {st.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1 overflow-y-auto mt-6 space-y-4">
                {(selected.messages || []).map((m, i) => {
                  const initials = m.sender_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
                  const isStaff = m.sender_role === 'super_admin' || m.sender_role === 'org_admin';
                  return (
                    <div key={i} className={`flex gap-3 ${isStaff ? 'flex-row-reverse' : ''}`} data-testid={`msg-${i}`}>
                      <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarFallback className={isStaff ? 'bg-violet-600 text-white text-xs' : 'bg-slate-200 text-slate-700 text-xs'}>{initials}</AvatarFallback>
                      </Avatar>
                      <div className={`max-w-[80%] rounded-lg p-3 ${isStaff ? 'bg-violet-50 border border-violet-200' : 'bg-slate-50 border border-slate-200'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-slate-900">{m.sender_name}</span>
                          <span className="text-[10px] text-slate-500 capitalize">{m.sender_role.replace('_', ' ')}</span>
                        </div>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{m.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1.5">{timeAgo(m.timestamp)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-200 pt-4 mt-4 flex gap-2">
                <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type your reply..." rows={2} className="flex-1" data-testid="reply-input" />
                <Button onClick={handleReply} className="bg-violet-700 hover:bg-violet-800 text-white self-end" data-testid="send-reply-btn">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
