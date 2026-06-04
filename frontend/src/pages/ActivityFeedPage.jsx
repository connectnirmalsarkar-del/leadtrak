import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API, useAuth } from '@/context/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Activity,
  ArrowRight,
  Search,
  RefreshCw,
  MessageSquare,
  Paperclip,
  Video,
  CalendarClock,
  CheckCircle2,
  XCircle,
  Flame,
  Snowflake,
  Sun,
  FileText,
  Pencil,
  UserPlus2,
  ShuffleIcon,
} from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Event → display config
// ---------------------------------------------------------------------------
const EVENT_META = {
  status_changed:      { label: 'Status changed',      icon: ArrowRight,    tone: 'bg-violet-50 text-violet-700 border-violet-200' },
  lead_lost:           { label: 'Lead lost',           icon: XCircle,       tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  admission_recorded:  { label: 'Conversion recorded', icon: CheckCircle2,  tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  lead_created:        { label: 'Lead created',        icon: UserPlus2,     tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  assigned:            { label: 'Reassigned',          icon: ShuffleIcon,   tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  note_added:          { label: 'Note added',          icon: MessageSquare, tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  lead_attachment:     { label: 'File uploaded',       icon: Paperclip,     tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  demo_scheduled:      { label: 'Demo scheduled',      icon: Video,         tone: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
  demo_updated:        { label: 'Demo updated',        icon: Pencil,        tone: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
  demo_completed:      { label: 'Demo completed',      icon: CheckCircle2,  tone: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
  followup_added:      { label: 'Followup scheduled',  icon: CalendarClock, tone: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  followup_completed:  { label: 'Followup done',       icon: CheckCircle2,  tone: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  temperature_changed: { label: 'Temperature changed', icon: Flame,         tone: 'bg-orange-50 text-orange-700 border-orange-200' },
};

const TEMP_ICON = { hot: Flame, warm: Sun, cold: Snowflake };

const FILTER_OPTIONS = [
  { value: 'all',                 label: 'All activity' },
  { value: 'status_changed',      label: 'Status changes' },
  { value: 'note_added',          label: 'Notes' },
  { value: 'lead_attachment',     label: 'File uploads' },
  { value: 'demo_scheduled',      label: 'Demos scheduled' },
  { value: 'demo_completed',      label: 'Demos completed' },
  { value: 'followup_added',      label: 'Followups added' },
  { value: 'followup_completed',  label: 'Followups completed' },
  { value: 'lead_created',        label: 'New leads' },
  { value: 'assigned',            label: 'Reassignments' },
];

const RANGE_OPTIONS = [
  { value: 1,  label: 'Today' },
  { value: 7,  label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatTime(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) {
    return '';
  }
}

function summarizeEvent(item) {
  const { event_type: t, payload = {}, actor_name: actor, lead_name } = item;
  const who = actor || 'Someone';
  const lead = lead_name ? `'${lead_name}'` : 'a lead';
  switch (t) {
    case 'status_changed':
      return `${who} moved ${lead} from ${payload.from || '—'} → ${payload.to || '—'}${payload.reason ? ` (${payload.reason})` : ''}`;
    case 'lead_lost':
      return `${who} marked ${lead} as Lost`;
    case 'admission_recorded':
      return `${who} converted ${lead} → ${payload.to || 'Admission Done'}`;
    case 'lead_created':
      return `${who} added ${lead} via ${payload.source || 'Manual Add'}`;
    case 'assigned':
      return `${who} reassigned ${lead}`;
    case 'note_added':
      return `${who} commented on ${lead}: ${payload.note || ''}`;
    case 'lead_attachment':
      return `${who} attached ${payload.filename || 'a file'} to ${lead}${payload.note ? ` — ${payload.note}` : ''}`;
    case 'demo_scheduled':
      return `${who} booked a demo for ${lead} on ${payload.scheduled_date} at ${payload.scheduled_time}`;
    case 'demo_updated':
      return `${who} updated the demo for ${lead}${(payload.changed_fields || []).length ? ` — ${(payload.changed_fields || []).join(', ')}` : ''}`;
    case 'demo_completed':
      return `${who} marked demo for ${lead} as ${payload.outcome || payload.status}${payload.feedback ? ` — ${payload.feedback}` : ''}`;
    case 'followup_added':
      return `${who} scheduled a followup for ${lead} on ${payload.followup_date}${payload.followup_time ? ` at ${payload.followup_time}` : ''}${payload.remarks ? ` — ${payload.remarks}` : ''}`;
    case 'followup_completed':
      return `${who} completed a followup on ${lead}${payload.outcome_summary ? `: ${payload.outcome_summary}` : ''}`;
    case 'temperature_changed':
      return `${who} changed temperature of ${lead} from ${payload.from || 'warm'} → ${payload.to || 'warm'}`;
    default:
      return `${who} performed ${t} on ${lead}`;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ActivityFeedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [range, setRange] = useState(7);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [actorFilter, setActorFilter] = useState('all');

  const isCaller = ['counselor', 'telecaller'].includes(user?.role);

  const fetchData = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const params = { limit: 150, days: range };
      if (filter !== 'all') params.event_type = filter;
      if (actorFilter !== 'all') params.actor_id = actorFilter;
      const { data } = await axios.get(`${API}/activity`, { params });
      setItems(data.items || []);
    } catch (e) {
      toast.error('Failed to load activity');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, range, actorFilter]);

  useEffect(() => {
    // Load org users (only for managers/admins — they need actor filter)
    if (!isCaller) {
      axios.get(`${API}/users`).then(({ data }) => setUsers(data || [])).catch(() => {});
    }
  }, [isCaller]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((it) =>
      (it.lead_name || '').toLowerCase().includes(q)
      || (it.actor_name || '').toLowerCase().includes(q)
      || (it.lead_ref || '').toLowerCase().includes(q)
      || JSON.stringify(it.payload || {}).toLowerCase().includes(q)
    );
  }, [items, search]);

  // Group by date heading (Today / Yesterday / specific date)
  const grouped = useMemo(() => {
    const groups = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    filtered.forEach((it) => {
      const d = new Date(it.created_at);
      const ds = new Date(d);
      ds.setHours(0, 0, 0, 0);
      let label;
      if (ds.getTime() === today.getTime()) label = 'Today';
      else if (ds.getTime() === yesterday.getTime()) label = 'Yesterday';
      else label = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
      if (!groups[label]) groups[label] = [];
      groups[label].push(it);
    });
    return groups;
  }, [filtered]);

  const handleOpenLead = (leadId) => {
    if (!leadId) return;
    navigate(`/leads?openLead=${leadId}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="activity-feed-page">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wider mb-1">
              <Activity className="w-3.5 h-3.5" />
              <span>Live</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight" style={{ fontFamily: 'Sora' }}>
              Activity feed
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {isCaller
                ? 'Recent events on the leads assigned to you.'
                : 'Everything your team did across leads — status changes, notes, files, demos, followups.'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData({ silent: true })}
            disabled={refreshing}
            className="h-9 self-start sm:self-auto"
            data-testid="activity-refresh-btn"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by lead name, ID, actor or content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
              data-testid="activity-search-input"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full sm:w-48 h-9" data-testid="activity-type-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(range)} onValueChange={(v) => setRange(Number(v))}>
            <SelectTrigger className="w-full sm:w-36 h-9" data-testid="activity-range-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {!isCaller && users.length > 0 && (
            <Select value={actorFilter} onValueChange={setActorFilter}>
              <SelectTrigger className="w-full sm:w-44 h-9" data-testid="activity-actor-filter">
                <SelectValue placeholder="Any teammate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any teammate</SelectItem>
                {users.map((u) => <SelectItem key={u._id} value={u._id}>{u.name} <span className="text-slate-400">· {u.role}</span></SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Feed */}
        {loading ? (
          <div className="space-y-3" data-testid="activity-loading">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse">
                <div className="h-3 bg-slate-100 rounded w-1/3 mb-2" />
                <div className="h-4 bg-slate-100 rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center" data-testid="activity-empty">
            <Activity className="w-10 h-10 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-700 font-medium">No activity yet</p>
            <p className="text-sm text-slate-500 mt-1">
              When you or your team work on leads, you'll see it streaming here.
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([label, group]) => (
            <div key={label} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{label}</h2>
                <div className="h-px bg-slate-200 flex-1" />
                <span className="text-xs text-slate-400">{group.length}</span>
              </div>
              <ul className="space-y-2">
                {group.map((it) => {
                  const meta = EVENT_META[it.event_type] || { label: it.event_type, icon: FileText, tone: 'bg-slate-50 text-slate-700 border-slate-200' };
                  const Icon = meta.icon;
                  const TempIcon = it.event_type === 'temperature_changed' ? (TEMP_ICON[(it.payload || {}).to] || Sun) : null;
                  return (
                    <li
                      key={it.id}
                      onClick={() => handleOpenLead(it.lead_id)}
                      className="bg-white border border-slate-200 rounded-xl p-4 hover:border-violet-300 hover:shadow-sm transition-all cursor-pointer group"
                      data-testid={`activity-item-${it.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex-shrink-0 w-9 h-9 rounded-lg border ${meta.tone} flex items-center justify-center`}>
                          {TempIcon ? <TempIcon className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Badge variant="outline" className={`${meta.tone} text-[10px] px-2 py-0 h-5 font-medium`}>
                              {meta.label}
                            </Badge>
                            {it.lead_ref && (
                              <span className="text-[10px] font-mono text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">
                                {it.lead_ref}
                              </span>
                            )}
                            {it.lead_status && (
                              <span className="text-[10px] text-slate-500">
                                Currently: <span className="font-medium text-slate-700">{it.lead_status}</span>
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400 ml-auto">{formatTime(it.created_at)}</span>
                          </div>
                          <p className="text-sm text-slate-700 leading-snug break-words">
                            {summarizeEvent(it)}
                          </p>
                          {it.event_type === 'lead_attachment' && it.payload?.url && (
                            <a
                              href={it.payload.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 mt-1.5 text-xs text-violet-600 hover:underline"
                            >
                              <Paperclip className="w-3 h-3" />
                              View file
                            </a>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span>Click to open lead</span>
                            <ArrowRight className="w-3 h-3" />
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </DashboardLayout>
  );
}
