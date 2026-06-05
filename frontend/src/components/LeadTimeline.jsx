import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
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
  Paperclip,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Download,
  X as XIcon,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

const makeFormatDate = (timeZone) => (iso) => {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timeZone || 'Asia/Kolkata',
  });
};

const EVENT_META = {
  lead_created: { icon: UserPlus, color: 'violet', title: 'Lead created' },
  status_changed: { icon: RefreshCw, color: 'blue', title: 'Status changed' },
  assigned: { icon: UserPlus, color: 'indigo', title: 'Assigned' },
  assigned_changed: { icon: ArrowRightLeft, color: 'indigo', title: 'Assignee changed' },
  transferred: { icon: ArrowRightLeft, color: 'amber', title: 'Transferred' },
  temperature_changed: { icon: CircleDot, color: 'amber', title: 'Temperature changed' },
  followup_added: { icon: Calendar, color: 'sky', title: 'Follow-up scheduled' },
  followup_completed: { icon: CheckCircle2, color: 'emerald', title: 'Follow-up completed' },
  followup_missed: { icon: AlertCircle, color: 'amber', title: 'Follow-up missed' },
  note_added: { icon: StickyNote, color: 'slate', title: 'Comment' },
  lead_attachment: { icon: Paperclip, color: 'indigo', title: 'File attached' },
  demo_scheduled: { icon: Video, color: 'fuchsia', title: 'Demo scheduled' },
  demo_updated: { icon: Video, color: 'amber', title: 'Demo updated' },
  demo_completed: { icon: CheckCircle2, color: 'teal', title: 'Demo completed' },
  task_assigned: { icon: CheckCircle2, color: 'sky', title: 'Task assigned' },
  task_status_changed: { icon: RefreshCw, color: 'blue', title: 'Task status changed' },
  call_logged: { icon: Phone, color: 'teal', title: 'Call logged' },
  admission_recorded: { icon: Trophy, color: 'emerald', title: 'Converted' },
  lead_lost: { icon: XCircle, color: 'red', title: 'Marked as lost' },
};

// Convert snake_case event type to a friendly Title Case label as last-resort fallback.
const humanizeEventType = (t) =>
  (t || 'event').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Render a payload field value in a readable way (no raw JSON for users).
const renderValue = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
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

// Inline button that downloads a timeline attachment WITHOUT navigating away
// from the PWA — fetches the file as a Blob via the backend proxy and triggers
// a download via an in-memory object URL. This keeps iOS PWA users on the
// dashboard (the older `<a href>` approach caused the PWA to navigate to the
// download URL and the user got stuck with no back button on iOS).
const AttachmentDownloadButton = ({ eventId, filename, mime }) => {
  const [busy, setBusy] = useState(false);
  const handleClick = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await axios.get(`${API}/attachments/download/${eventId}`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: mime || res.headers['content-type'] || 'application/octet-stream' });
      const objectUrl = URL.createObjectURL(blob);
      // Try Web Share API first — gives the native iOS "save to Files / share" sheet
      // and stays inside the PWA. Fallback to <a download> click.
      const file = (typeof File !== 'undefined') ? new File([blob], filename || 'attachment', { type: blob.type }) : null;
      let shared = false;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename });
          shared = true;
        } catch (err) { /* user cancelled or unsupported — fall through */ }
      }
      if (!shared) {
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename || 'attachment';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    } catch (err) {
      const msg = err?.response?.status === 403
        ? "You can't download this attachment"
        : (err?.response?.status === 404 ? 'Attachment not found' : 'Download failed');
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 px-2 py-1 rounded hover:bg-indigo-100 transition-colors flex-shrink-0 disabled:opacity-60 disabled:cursor-wait"
      data-testid="timeline-attachment-download"
      aria-label={`Download ${filename || 'attachment'}`}
    >
      <Download className={`w-3.5 h-3.5 ${busy ? 'animate-pulse' : ''}`} />
      {busy ? 'Downloading…' : 'Download'}
    </button>
  );
};

// Tiny inline button shown next to call/followup voice notes & lead attachments
// when the current user is an admin. Calls onDelete(eventId) after a confirm.
const AdminDeleteMediaButton = ({ eventId, label, onDelete }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      if (!window.confirm(`Delete this ${label}? This cannot be undone.`)) return;
      onDelete(eventId);
    }}
    className="ml-1 inline-flex items-center justify-center w-6 h-6 rounded text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors flex-shrink-0"
    title={`Delete ${label}`}
    aria-label={`Delete ${label}`}
    data-testid={`timeline-delete-media-${eventId}`}
  >
    <Trash2 className="w-3.5 h-3.5" />
  </button>
);

const EventBody = ({ event, canDeleteMedia, onDeleteMedia }) => {
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
              {canDeleteMedia && (
                <AdminDeleteMediaButton eventId={event._id} label="voice recording" onDelete={onDeleteMedia} />
              )}
            </div>
          )}
          {p.media_deleted && !p.voice_recording_url && (
            <p className="text-[11px] text-slate-400 italic">Voice recording was deleted by {p.media_deleted_by || 'an admin'}.</p>
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
              {canDeleteMedia && (
                <AdminDeleteMediaButton eventId={event._id} label="voice recording" onDelete={onDeleteMedia} />
              )}
            </div>
          ) : p.media_deleted ? (
            <p className="text-[11px] text-slate-400 italic">Voice recording was deleted by {p.media_deleted_by || 'an admin'}.</p>
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
    case 'demo_updated':
      return (
        <div className="text-sm text-slate-700 space-y-1">
          <p>
            Now with <span className="font-medium text-slate-900">{p.demo_owner_name || '—'}</span>
            {p.scheduled_date && p.scheduled_time && (
              <> · {p.scheduled_date} at {p.scheduled_time}</>
            )}
            {p.demo_mode && (
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{p.demo_mode}</span>
            )}
          </p>
          {p.demo_link && (
            <p className="text-xs">
              <a href={p.demo_link} target="_blank" rel="noopener noreferrer" className="text-violet-700 hover:underline break-all">
                {p.demo_link}
              </a>
            </p>
          )}
          {Array.isArray(p.changed_fields) && p.changed_fields.length > 0 && (
            <p className="text-[11px] text-slate-500">
              Updated: <span className="font-medium text-slate-700">{p.changed_fields.join(', ')}</span>
            </p>
          )}
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
    case 'lead_attachment': {
      const mime = p.mime_type || '';
      const isImg = mime.startsWith('image/');
      const isPdf = mime === 'application/pdf';
      const FIcon = isImg ? ImageIcon : (isPdf ? FileText : FileSpreadsheet);
      const sizeKb = p.size ? (p.size / 1024).toFixed(1) : '';
      return (
        <div className="bg-indigo-50/60 border border-indigo-200 rounded-md p-2.5 space-y-2" data-testid="timeline-attachment">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-md bg-white border border-indigo-200 flex items-center justify-center flex-shrink-0">
              <FIcon className="w-4 h-4 text-indigo-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate" title={p.filename}>{p.filename || 'Attachment'}</p>
              <p className="text-[11px] text-slate-500">{sizeKb && `${sizeKb} KB · `}{(mime.split('/')[1] || 'file').toUpperCase()}</p>
            </div>
            {p.url && (
              <AttachmentDownloadButton
                eventId={event._id}
                filename={p.filename || 'attachment'}
                mime={mime}
              />
            )}
            {canDeleteMedia && p.url && (
              <AdminDeleteMediaButton eventId={event._id} label="attachment" onDelete={onDeleteMedia} />
            )}
          </div>
          {isImg && p.url && (
            <a href={p.url} target="_blank" rel="noopener noreferrer">
              <img src={p.url} alt={p.filename} className="max-h-44 w-auto rounded border border-indigo-200" />
            </a>
          )}
          {p.note && (
            <p className="text-xs text-slate-600 italic">"{p.note}"</p>
          )}
          {p.media_deleted && !p.url && (
            <p className="text-[11px] text-rose-600 italic">File was deleted by {p.media_deleted_by || 'an admin'}.</p>
          )}
        </div>
      );
    }
    case 'temperature_changed': {
      // payload e shape varies — try {from, to} OR {old_temperature, new_temperature}
      const from = p.from || p.old_temperature || p.previous;
      const to = p.to || p.new_temperature || p.value;
      const TEMP_STYLE = {
        hot: 'bg-red-100 text-red-700',
        warm: 'bg-amber-100 text-amber-700',
        cold: 'bg-blue-100 text-blue-700',
      };
      const Pill = ({ v }) => (
        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${TEMP_STYLE[(v || '').toLowerCase()] || 'bg-slate-100 text-slate-700'}`}>
          {(v || '—').toString().replace(/^./, (c) => c.toUpperCase())}
        </span>
      );
      return (
        <p className="text-sm text-slate-700 flex items-center gap-1.5 flex-wrap">
          <Pill v={from} /> <ArrowRightLeft className="w-3 h-3 text-slate-400" /> <Pill v={to} />
        </p>
      );
    }
    default: {
      // Friendly fallback for any event type without a dedicated renderer.
      // Show key:value pairs instead of raw JSON so users don't see internal fields.
      const entries = Object.entries(p || {}).filter(([k, v]) => v !== null && v !== undefined && v !== '');
      if (!entries.length) return null;
      return (
        <div className="text-sm text-slate-700 space-y-0.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-xs text-slate-500 capitalize">{k.replace(/_/g, ' ')}:</span>
              <span className="font-medium text-slate-800">{renderValue(v)}</span>
            </div>
          ))}
        </div>
      );
    }
  }
};

export default function LeadTimeline({ leadId, refreshKey }) {
  const { user } = useAuth();
  const formatDate = makeFormatDate(user?.timezone);
  const canDeleteMedia = ['org_admin', 'super_admin'].includes(user?.role);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [innerRefreshKey, setInnerRefreshKey] = useState(0);
  const [pickedFile, setPickedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef(null);

  const handleDeleteMedia = async (eventId) => {
    try {
      await axios.delete(`${API}/leads/${leadId}/timeline/${eventId}/media`);
      toast.success('Media deleted');
      setInnerRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete');
    }
  };

  const ACCEPT = '.pdf,.xls,.xlsx,.jpg,.jpeg,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg';
  const MAX_BYTES = 400 * 1024;

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    axios
      .get(`${API}/leads/${leadId}/timeline`)
      .then(({ data }) => setEvents(data))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [leadId, refreshKey, innerRefreshKey]);

  const handlePickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/jpg'];
    if (!allowed.includes(f.type)) {
      toast.error('Only PDF, Excel (.xls/.xlsx) or JPG files allowed');
      e.target.value = '';
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error(`File too large (${(f.size / 1024).toFixed(1)} KB). Max 400 KB.`);
      e.target.value = '';
      return;
    }
    setPickedFile(f);
  };

  const clearPicked = () => {
    setPickedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePost = async () => {
    const text = comment.trim();
    if (!text && !pickedFile) return;
    setPosting(true);
    try {
      if (pickedFile) {
        setUploading(true);
        const fd = new FormData();
        fd.append('file', pickedFile);
        if (text) fd.append('note', text);
        await axios.post(`${API}/leads/${leadId}/attachments`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        toast.success('File attached to timeline');
      } else {
        await axios.post(`${API}/leads/${leadId}/comments`, { note: text });
        toast.success('Comment posted');
      }
      setComment('');
      clearPicked();
      setInnerRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to post');
    } finally {
      setPosting(false);
      setUploading(false);
    }
  };

  const Composer = (
    <div className="border border-slate-200 rounded-lg p-3 mb-5 bg-slate-50/40" data-testid="comment-composer">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
        <StickyNote className="w-3 h-3" /> Add comment or file to timeline
      </p>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={pickedFile ? 'Optional note for this file…' : 'Write an instruction or note for the team handling this lead…'}
        className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 min-h-[60px] resize-y"
        rows={2}
        maxLength={2000}
        data-testid="comment-input"
      />
      {pickedFile && (
        <div className="mt-2 flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-md px-2.5 py-1.5" data-testid="picked-file-chip">
          <Paperclip className="w-3.5 h-3.5 text-indigo-700 flex-shrink-0" />
          <p className="text-xs text-slate-700 truncate flex-1">{pickedFile.name}</p>
          <span className="text-[10px] text-slate-500 flex-shrink-0">{(pickedFile.size / 1024).toFixed(1)} KB</span>
          <button
            type="button"
            onClick={clearPicked}
            className="text-slate-400 hover:text-red-600 flex-shrink-0"
            data-testid="clear-picked-file"
            aria-label="Remove file"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="flex items-center justify-between mt-2 gap-2">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            onChange={handlePickFile}
            className="hidden"
            data-testid="timeline-file-input"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={posting}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-violet-700 px-2 py-1.5 rounded-md hover:bg-violet-50 transition-colors disabled:opacity-50"
            data-testid="attach-file-btn"
            title="Attach a file (PDF / Excel / JPG, max 400 KB)"
          >
            <Paperclip className="w-3.5 h-3.5" /> Attach
          </button>
          <span className="text-[10px] text-slate-400 hidden sm:inline">PDF · Excel · JPG · max 400 KB</span>
        </div>
        <button
          onClick={handlePost}
          disabled={posting || (!comment.trim() && !pickedFile)}
          className="inline-flex items-center gap-1.5 bg-violet-700 hover:bg-violet-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
          data-testid="post-comment-btn"
        >
          <Send className="w-3 h-3" /> {uploading ? 'Uploading…' : (posting ? 'Posting…' : (pickedFile ? 'Upload' : 'Post'))}
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
        const meta = EVENT_META[e.event_type] || { icon: CircleDot, color: 'slate', title: humanizeEventType(e.event_type) };
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
              <EventBody event={e} canDeleteMedia={canDeleteMedia} onDeleteMedia={handleDeleteMedia} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
