import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import {
  UserPlus,
  ArrowRightLeft,
  Phone,
  RefreshCw,
  Trophy,
  XCircle,
  StickyNote,
  CircleDot,
  Mic,
  Video,
  CheckCircle2,
  Send,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const formatDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const EVENT_META = {
  lead_created: { icon: UserPlus, color: 'violet', title: 'Lead created' },
  status_changed: { icon: RefreshCw, color: 'blue', title: 'Status changed' },
  assigned: { icon: UserPlus, color: 'indigo', title: 'Assigned' },
  transferred: { icon: ArrowRightLeft, color: 'amber', title: 'Transferred' },
  followup_added: { icon: Calendar, color: 'sky', title: 'Follow-up scheduled' },
  followup_completed: { icon: CheckCircle2, color: 'emerald', title: 'Follow-up completed' },
  followup_missed: { icon: AlertCircle, color: 'amber', title: 'Follow-up missed' },
  note_added: { icon: StickyNote, color: 'slate', title: 'Comment' },
  demo_scheduled: { icon: Video, color: 'fuchsia', title: 'Demo scheduled' },
  demo_completed: { icon: CheckCircle2, color: 'teal', title: 'Demo completed' },
  admission_recorded: { icon: Trophy, color: 'emerald', title: 'Converted' },
  lead_lost: { icon: XCircle, color: 'red', title: 'Marked as lost' },
};

const COLOR_CLASS = {
  violet: 'bg-violet-100 text-violet-700 border-violet-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  sky: 'bg-sky-100 text-sky-700 border-sky-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  teal: 'bg-teal-100 text-teal-700 border-teal-200',
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  red: 'bg-red-100 text-red-700 border-red-200',
};

const EventBody = ({ event }) => {
  const p = event.payload || {};
  switch (event.event_type) {
    case 'lead_created':
      return (
        <p className="text-sm text-slate-600">
          Captured from <span className="font-medium text-slate-900">{p.source || 'Unknown'}</span> with status{' '}
          <span className="font-medium text-slate-900">{p.status || 'New'}</span>
        </p>
      );
    case 'status_changed':
      return (
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-900">{p.from || '—'}</span> → <span className="font-medium text-slate-900">{p.to || '—'}</span>
        </p>
      );
    case 'assigned':
      return (
        <p className="text-sm text-slate-600">
          Re-assigned <span className="font-medium text-slate-900">{p.from || 'unassigned'}</span> → <span className="font-medium text-slate-900">{p.to || 'unassigned'}</span>
        </p>
      );
    case 'transferred':
      return (
        <div className="text-sm text-slate-600 space-y-1">
          <p>
            <span className="font-medium text-slate-900">{p.from_user_name || 'Unassigned'}</span>
            {' → '}
            <span className="font-medium text-slate-900">{p.to_user_name || '—'}</span>
          </p>
          {p.reason && <p className="text-xs italic text-slate-500">"{p.reason}"</p>}
        </div>
      );
    case 'followup_added':
      return (
        <div className="space-y-2">
          {p.remarks && (
            <p className="text-sm text-slate-700"><span className="text-[10px] uppercase tracking-wider text-slate-400 mr-1">Plan:</span>{p.remarks}</p>
          )}
          <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            {p.followup_date} {p.followup_time}
            {p.next_followup ? <span className="ml-1">· next on {p.next_followup}</span> : null}
          </p>
          {p.voice_recording_url && (
            <div className="bg-slate-50 border border-slate-200 rounded-md p-2 flex items-center gap-2" data-testid="timeline-voice-player">
              <Mic className="w-3.5 h-3.5 text-violet-600 flex-shrink-0" />
              <audio src={p.voice_recording_url} controls className="flex-1 h-8" />
              {p.voice_recording_duration && (
                <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">
                  {Math.floor(p.voice_recording_duration)}s
                </span>
              )}
            </div>
          )}
          {p.call_disposition && (
            <p className="text-[11px] text-slate-500">
              Disposition: <span className="font-medium text-slate-700">{p.call_disposition}</span>
            </p>
          )}
        </div>
      );
    case 'followup_completed':
      return (
        <div className="space-y-2">
          {p.scheduled_remarks && (
            <p className="text-xs text-slate-500 italic">Originally planned: "{p.scheduled_remarks}"</p>
          )}
          <div className="bg-emerald-50/60 border-l-2 border-emerald-400 px-2.5 py-1.5 rounded">
            <p className="text-[10px] uppercase tracking-wider text-emerald-700 mb-0.5">Outcome</p>
            <p className="text-sm text-slate-800">{p.outcome_summary || '—'}</p>
          </div>
          {p.voice_recording_url ? (
            <div className="bg-slate-50 border border-slate-200 rounded-md p-2 flex items-center gap-2" data-testid="timeline-voice-player">
              <Mic className="w-3.5 h-3.5 text-violet-600 flex-shrink-0" />
              <audio src={p.voice_recording_url} controls className="flex-1 h-8" />
              {p.voice_recording_duration && (
                <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">
                  {Math.floor(p.voice_recording_duration)}s
                </span>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 italic">No voice recording was uploaded for this call.</p>
          )}
          {p.next_action && p.next_action !== 'none' && (
            <p className="text-[11px] text-slate-500">
              Next action: <span className="font-medium text-slate-700">{String(p.next_action).replace('_', ' ')}</span>
            </p>
          )}
        </div>
      );
    case 'demo_scheduled':
      return (
        <div className="text-sm text-slate-700 space-y-1">
          <p>
            With <span className="font-medium text-slate-900">{p.demo_owner_name || '—'}</span>
            {p.scheduled_date && p.scheduled_time && (
              <> · {p.scheduled_date} at {p.scheduled_time}</>
            )}
            {p.demo_mode && (
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">{p.demo_mode}</span>
            )}
          </p>
          {p.demo_link && (
            <p className="text-xs">
              <a href={p.demo_link} target="_blank" rel="noopener noreferrer" className="text-violet-700 hover:underline break-all">
                {p.demo_link}
              </a>
            </p>
          )}
          {p.agenda && <p className="text-xs italic text-slate-500">"{p.agenda}"</p>}
        </div>
      );
    case 'demo_completed':
      return (
        <div className="text-sm text-slate-700 space-y-1">
          <p>
            by <span className="font-medium text-slate-900">{p.demo_owner_name || '—'}</span>
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
              p.outcome === 'interested' ? 'bg-emerald-100 text-emerald-700' :
              p.outcome === 'not_interested' ? 'bg-red-100 text-red-700' :
              p.outcome === 'reschedule' ? 'bg-amber-100 text-amber-700' :
              'bg-slate-100 text-slate-600'
            }`}>
              {(p.outcome || '').replace('_', ' ')}
            </span>
          </p>
          {p.feedback && <p className="text-xs text-slate-600">{p.feedback}</p>}
        </div>
      );
    case 'admission_recorded':
      return (
        <p className="text-sm text-slate-600">
          {p.offering ? <>{p.offering} · </> : null}
          <span className="font-mono text-slate-900">₹{Number(p.amount || 0).toLocaleString('en-IN')}</span>
          {p.date ? <> · {p.date}</> : null}
        </p>
      );
    case 'lead_lost':
      return (
        <p className="text-sm text-slate-600">Lead moved to Lost. Previous status: <span className="font-medium text-slate-900">{p.from}</span></p>
      );
    case 'note_added':
      return (
        <div className="bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5">
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{p.note}</p>
          {p.from_role && (
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">from {p.from_role}</p>
          )}
        </div>
      );
    default:
      return <p className="text-sm text-slate-500">{JSON.stringify(p)}</p>;
  }
};

export default function LeadTimeline({ leadId, refreshKey }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [innerRefreshKey, setInnerRefreshKey] = useState(0);

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    axios
      .get(`${API}/leads/${leadId}/timeline`)
      .then(({ data }) => setEvents(data))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [leadId, refreshKey, innerRefreshKey]);

  const handlePost = async () => {
    const text = comment.trim();
    if (!text) return;
    setPosting(true);
    try {
      await axios.post(`${API}/leads/${leadId}/comments`, { note: text });
      toast.success('Comment posted');
      setComment('');
      setInnerRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to post comment');
    } finally {
      setPosting(false);
    }
  };

  const Composer = (
    <div className="border border-slate-200 rounded-lg p-3 mb-5 bg-slate-50/40" data-testid="comment-composer">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
        <StickyNote className="w-3 h-3" /> Add comment to timeline
      </p>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Write an instruction or note for the team handling this lead…"
        className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 min-h-[60px] resize-y"
        rows={2}
        maxLength={2000}
        data-testid="comment-input"
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-slate-400">{comment.length}/2000 · The assigned counselor gets notified</span>
        <button
          onClick={handlePost}
          disabled={posting || !comment.trim()}
          className="inline-flex items-center gap-1.5 bg-violet-700 hover:bg-violet-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
          data-testid="post-comment-btn"
        >
          <Send className="w-3 h-3" /> {posting ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  );

  if (loading) {
    return <div className="py-8 text-center text-sm text-slate-400" data-testid="timeline-loading">Loading timeline…</div>;
  }

  if (events.length === 0) {
    return (
      <>
        {Composer}
        <div className="py-10 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg" data-testid="timeline-empty">
          <CircleDot className="w-6 h-6 mx-auto mb-2 text-slate-300" />
          No activity yet. Events will appear here as work happens on this lead.
        </div>
      </>
    );
  }

  return (
    <div className="space-y-0" data-testid="lead-timeline">
      {Composer}
      {events.map((e, idx) => {
        const meta = EVENT_META[e.event_type] || { icon: CircleDot, color: 'slate', title: e.event_type };
        const Icon = meta.icon;
        const isLast = idx === events.length - 1;
        return (
          <div key={e._id} className="flex gap-3 pb-5 relative" data-testid={`timeline-event-${e.event_type}`}>
            {/* Connector */}
            {!isLast && (
              <div className="absolute left-[15px] top-8 bottom-0 w-px bg-slate-200" aria-hidden />
            )}
            {/* Icon */}
            <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${COLOR_CLASS[meta.color]}`}>
              <Icon className="w-4 h-4" />
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <p className="text-sm font-semibold text-slate-900">{meta.title}</p>
                <p className="text-[11px] text-slate-400 flex-shrink-0">{formatDate(e.created_at)}</p>
              </div>
              <p className="text-[11px] text-slate-500 mb-1.5">
                by <span className="font-medium text-slate-700">{e.actor_name}</span>
                {e.actor_role && <span className="text-slate-400"> · {e.actor_role.replace('_', ' ')}</span>}
              </p>
              <EventBody event={e} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
