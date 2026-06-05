import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import { Video, Phone, Mail, CheckCircle2, ExternalLink, Calendar, Clock, Pencil, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import BookDemoDialog from '@/components/BookDemoDialog';
import { toast } from 'sonner';

const statusBadge = (s) => {
  const map = {
    Scheduled: 'bg-violet-100 text-violet-700 border-violet-200',
    Completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Rescheduled: 'bg-amber-100 text-amber-700 border-amber-200',
    'No Show': 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return map[s] || 'bg-slate-100 text-slate-600 border-slate-200';
};

export default function DemosPage() {
  const { user } = useAuth();
  const demoLabel = user?.features?.demo_label || 'Demos';
  const demoLabelSingular = demoLabel.endsWith('s') ? demoLabel.slice(0, -1) : demoLabel;
  // Industry-aware lead status list (single source of truth)
  const LEAD_STATUS_OPTIONS = (user && Array.isArray(user.lead_statuses) && user.lead_statuses.length > 0)
    ? user.lead_statuses
    : [];
  const [demos, setDemos] = useState([]);
  const [counts, setCounts] = useState({ mine: 0, upcoming: 0, completed: 0, all: 0 });
  const [scope, setScope] = useState('mine');
  const [activeDemo, setActiveDemo] = useState(null);
  const [completeForm, setCompleteForm] = useState({ outcome: 'interested', feedback: '', recording_url: '', lead_status: '' });
  const [editingDemo, setEditingDemo] = useState(null);
  const [users, setUsers] = useState([]);

  const fetchDemos = async () => {
    try {
      const { data } = await axios.get(`${API}/demos`, { params: { scope } });
      setDemos(data);
    } catch (e) {
      toast.error('Failed to load demos');
    }
  };

  // Compute counts for every tab in a single request — only relies on the "all" scope.
  // Cheaper than firing 4 requests and gives accurate at-a-glance numbers in the tab labels.
  const fetchCounts = async () => {
    try {
      const { data } = await axios.get(`${API}/demos`, { params: { scope: 'all' } });
      const list = Array.isArray(data) ? data : [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isUpcoming = (d) => {
        if (d.status !== 'Scheduled' || !d.scheduled_date) return false;
        const dt = new Date(d.scheduled_date);
        if (isNaN(dt.getTime())) return true; // be permissive
        return dt >= today;
      };
      const mineId = user?.id;
      setCounts({
        mine: list.filter((d) => d.demo_owner_id === mineId || d.scheduled_by_id === mineId).length,
        upcoming: list.filter(isUpcoming).length,
        completed: list.filter((d) => d.status === 'Completed').length,
        all: list.length,
      });
    } catch (e) {
      // non-blocking — keep zeros
    }
  };

  const fetchUsers = async () => {
    try {
      const { data } = await axios.get(`${API}/users`);
      // BookDemoDialog wants the manager/counselor/telecaller pool
      const pool = (Array.isArray(data) ? data : []).filter((u) =>
        ['manager', 'counselor', 'telecaller', 'org_admin'].includes(u.role)
      );
      setUsers(pool);
    } catch (e) {
      // Non-blocking — edit dialog will just show empty owner list
    }
  };

  useEffect(() => { fetchDemos(); fetchCounts(); }, [scope]);
  useEffect(() => { fetchUsers(); }, []);

  const canEdit = (d) => {
    if (d.status !== 'Scheduled') return false;
    return (
      d.demo_owner_id === user?.id ||
      d.scheduled_by_id === user?.id ||
      ['super_admin', 'org_admin', 'manager'].includes(user?.role)
    );
  };

  const openComplete = (demo) => {
    setActiveDemo(demo);
    setCompleteForm({ outcome: 'interested', feedback: '', recording_url: '', lead_status: '' });
  };

  const submitComplete = async () => {
    if (!activeDemo) return;
    try {
      await axios.post(`${API}/demos/${activeDemo._id}/complete`, completeForm);
      toast.success('Demo marked complete');
      setActiveDemo(null);
      fetchDemos();
      fetchCounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to complete demo');
    }
  };

  return (
    <div className="space-y-6" data-testid="demos-page">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Pre-sales</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }} data-testid="demos-heading">{demoLabel}</h1>
        <p className="text-sm text-slate-600 mt-1">Track {demoLabel.toLowerCase()} before deal close.</p>
      </div>

      <Tabs value={scope} onValueChange={setScope}>
        <TabsList data-testid="demos-tabs" className="flex flex-wrap h-auto sm:h-10 sm:flex-nowrap gap-1 w-full sm:w-auto">
          <TabsTrigger value="mine" data-testid="demos-tab-mine">
            My {demoLabel}
            <span
              className={`ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold tabular-nums ${scope === 'mine' ? 'bg-violet-700 text-white' : 'bg-slate-200 text-slate-700'}`}
              data-testid="demos-tab-mine-count"
            >
              {counts.mine}
            </span>
          </TabsTrigger>
          <TabsTrigger value="upcoming" data-testid="demos-tab-upcoming">
            Upcoming
            <span
              className={`ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold tabular-nums ${scope === 'upcoming' ? 'bg-violet-700 text-white' : 'bg-amber-100 text-amber-700'}`}
              data-testid="demos-tab-upcoming-count"
            >
              {counts.upcoming}
            </span>
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="demos-tab-completed">
            Completed
            <span
              className={`ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold tabular-nums ${scope === 'completed' ? 'bg-violet-700 text-white' : 'bg-emerald-100 text-emerald-700'}`}
              data-testid="demos-tab-completed-count"
            >
              {counts.completed}
            </span>
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="demos-tab-all">
            All
            <span
              className={`ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold tabular-nums ${scope === 'all' ? 'bg-violet-700 text-white' : 'bg-slate-200 text-slate-700'}`}
              data-testid="demos-tab-all-count"
            >
              {counts.all}
            </span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value={scope} className="mt-4">
          <div className="grid gap-3">
            {demos.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-500">
                <Video className="w-8 h-8 mx-auto mb-3 text-slate-300" />
                No {demoLabel.toLowerCase()} in this view yet.
              </div>
            ) : demos.map((d) => (
              <div key={d._id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4" data-testid={`demo-row-${d._id}`}>
                <div className="w-10 h-10 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center flex-shrink-0">
                  <Video className="w-5 h-5 text-violet-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2 mb-1">
                    <h3 className="font-semibold text-slate-900">{d.lead_name}</h3>
                    {d.lead_company && (
                      <span className="text-sm text-slate-700 inline-flex items-center gap-1" title={d.lead_company}>
                        <span className="text-slate-400">·</span>
                        <Building2 className="w-3 h-3 text-slate-400" />
                        <span className="font-medium">{d.lead_company}</span>
                      </span>
                    )}
                    <span className="text-xs text-slate-400 font-mono">{d.lead_mobile}</span>
                    <Badge variant="outline" className={statusBadge(d.status)}>{d.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span><Calendar className="w-3 h-3 inline mr-1" />{d.scheduled_date}</span>
                    <span><Clock className="w-3 h-3 inline mr-1" />{d.scheduled_time}</span>
                    <span>· {d.demo_mode}</span>
                    <span>· Demo by <strong>{d.demo_owner_name}</strong></span>
                    {d.scheduled_by_name && d.scheduled_by_name !== d.demo_owner_name && (
                      <span>· Booked by {d.scheduled_by_name}</span>
                    )}
                  </p>
                  {d.agenda && <p className="text-xs text-slate-500 mt-1 italic">"{d.agenda}"</p>}
                  {d.outcome && (
                    <p className="text-xs text-slate-700 mt-1">
                      Outcome: <strong>{d.outcome.replace('_', ' ')}</strong>
                      {d.feedback && <span className="text-slate-500"> — {d.feedback}</span>}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                  {d.demo_link && (
                    <a href={d.demo_link} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" data-testid={`demo-open-link-${d._id}`}>
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        Open
                      </Button>
                    </a>
                  )}
                  {canEdit(d) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingDemo(d)}
                      data-testid={`demo-edit-btn-${d._id}`}
                      title="Edit demo (link, schedule, presenter) and re-share via WhatsApp"
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1.5" />
                      Edit
                    </Button>
                  )}
                  {d.status === 'Scheduled' && (d.demo_owner_id === user?.id || ['super_admin', 'org_admin', 'manager'].includes(user?.role)) && (
                    <Button size="sm" onClick={() => openComplete(d)} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid={`demo-complete-btn-${d._id}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      Mark Done
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Complete demo dialog */}
      <Dialog open={!!activeDemo} onOpenChange={(o) => !o && setActiveDemo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Demo Complete</DialogTitle>
            <DialogDescription>Capture how the demo went so the timeline and reports stay accurate.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Outcome *</Label>
              <Select value={completeForm.outcome} onValueChange={(v) => setCompleteForm({ ...completeForm, outcome: v })}>
                <SelectTrigger data-testid="demo-outcome-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="not_interested">Not interested</SelectItem>
                  <SelectItem value="reschedule">Reschedule</SelectItem>
                  <SelectItem value="no_show">No show</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">
                The lead status will auto-update based on outcome (industry-specific). Override below if needed.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Set lead status to (optional)</Label>
              <Select
                value={completeForm.lead_status || '__auto__'}
                onValueChange={(v) => setCompleteForm({ ...completeForm, lead_status: v === '__auto__' ? '' : v })}
              >
                <SelectTrigger data-testid="demo-lead-status-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto (based on outcome)</SelectItem>
                  {LEAD_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s} data-testid={`demo-lead-status-option-${s}`}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">
                Pick any status from your industry's pipeline. Leave on "Auto" to use the default mapping.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Feedback / notes</Label>
              <Textarea value={completeForm.feedback} onChange={(e) => setCompleteForm({ ...completeForm, feedback: e.target.value })} rows={3} placeholder="What did the client say? What's the next step?" data-testid="demo-feedback-input" />
            </div>
            <div className="space-y-2">
              <Label>Recording link (optional)</Label>
              <Input value={completeForm.recording_url} onChange={(e) => setCompleteForm({ ...completeForm, recording_url: e.target.value })} placeholder="https://drive.google.com/..." data-testid="demo-recording-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDemo(null)}>Cancel</Button>
            <Button onClick={submitComplete} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="demo-complete-submit-btn">Complete demo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Edit demo dialog (reuses BookDemoDialog in edit mode + re-share screen) */}
      <BookDemoDialog
        open={!!editingDemo}
        onOpenChange={(o) => !o && setEditingDemo(null)}
        demo={editingDemo}
        users={users}
        onBooked={() => { fetchDemos(); fetchCounts(); }}
      />
    </div>
  );
}
