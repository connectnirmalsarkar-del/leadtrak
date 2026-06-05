import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import { Calendar, Phone, MessageSquare, CheckCircle2, Clock, AlertCircle, Mic, User, Filter, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import VoiceRecorder from '@/components/VoiceRecorder';
import { toast } from 'sonner';

const FollowupCard = ({ followup, onComplete, type }) => {
  const formatDateTime = (date, time) => {
    return `${new Date(date).toLocaleDateString()} ${time}`;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors" data-testid={`followup-card-${followup._id}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <p className="font-medium text-slate-900">{followup.lead_name || 'Lead'}</p>
            {followup.lead_company && (
              <span className="inline-flex items-center gap-1 text-sm text-slate-600" title={followup.lead_company}>
                <Building2 className="w-3 h-3 text-slate-400" />
                <span className="font-medium">{followup.lead_company}</span>
              </span>
            )}
            {followup.created_by_name && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] rounded-md" data-testid={`followup-creator-${followup._id}`} title="Created by">
                <User className="w-3 h-3" />
                {followup.created_by_name}
              </span>
            )}
            {followup.voice_recording_url && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-50 text-violet-700 text-[11px] rounded-md border border-violet-200" data-testid={`followup-voice-badge-${followup._id}`}>
                <Mic className="w-3 h-3" />
                Voice
              </span>
            )}
            {followup.completed && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[11px] rounded-md border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />
                Done
              </span>
            )}
            {type === 'missed' && !followup.completed && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded-md border border-red-200">
                <AlertCircle className="w-3 h-3" />
                Missed
              </span>
            )}
            {type === 'today' && !followup.completed && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-md border border-amber-200">
                <Clock className="w-3 h-3" />
                Today
              </span>
            )}
          </div>
          {/* Plan / remarks (what counselor said when scheduling) */}
          {followup.remarks && (
            <p className="text-sm text-slate-700 mb-2"><span className="text-[11px] uppercase tracking-wider text-slate-400 mr-1">Plan:</span>{followup.remarks}</p>
          )}
          {/* Outcome summary (after completion) */}
          {followup.completion_summary && (
            <div className="bg-emerald-50/40 border-l-2 border-emerald-300 px-2 py-1 rounded mb-2">
              <p className="text-sm text-slate-700"><span className="text-[11px] uppercase tracking-wider text-emerald-700 mr-1">Outcome:</span>{followup.completion_summary}</p>
            </div>
          )}
          {/* Inline audio player */}
          {followup.voice_recording_url && (
            <div className="flex items-center gap-2 mb-2 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5">
              <Mic className="w-3.5 h-3.5 text-violet-600 flex-shrink-0" />
              <audio src={followup.voice_recording_url} controls className="flex-1 h-8" />
              {followup.voice_recording_duration && (
                <span className="text-[11px] text-slate-500 font-mono">{Math.round(followup.voice_recording_duration)}s</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDateTime(followup.followup_date, followup.followup_time)}
            </span>
            {followup.lead_mobile && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {followup.lead_mobile}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {followup.lead_mobile && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`https://wa.me/${followup.lead_mobile.replace(/\D/g, '')}`, '_blank')}
              data-testid={`followup-wa-${followup._id}`}
              title="WhatsApp the lead"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </Button>
          )}
          {!followup.completed && (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => onComplete(followup)}
              data-testid={`followup-complete-${followup._id}`}
              title="Mark this follow-up complete — capture outcome + voice"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const STATUS_OPTIONS_FALLBACK = ['New', 'Contacted', 'Interested', 'Follow-up', 'Admission Done', 'Not Interested', 'Lost'];

function CompleteFollowupDialog({ followup, open, onOpenChange, onDone }) {
  const { user } = useAuth();
  // Industry-specific status list pulled from /auth/me — same source of truth
  // as LeadsPage so a status set here always appears in the Lead form dropdown.
  const STATUS_OPTIONS = (user && Array.isArray(user.lead_statuses) && user.lead_statuses.length > 0)
    ? user.lead_statuses
    : (user ? STATUS_OPTIONS_FALLBACK : []);
  const [summary, setSummary] = useState('');
  const [voice, setVoice] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [nextAction, setNextAction] = useState('none');
  const [nextDate, setNextDate] = useState('');
  const [nextTime, setNextTime] = useState('10:00');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSummary('');
      setVoice(null);
      setNewStatus('');
      setNextAction('none');
      setNextDate('');
      setNextTime('10:00');
    }
  }, [open, followup?._id]);

  const handleSubmit = async () => {
    const text = summary.trim();
    if (!text) {
      toast.error('Please add a short outcome note before completing');
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        summary: text,
        voice_recording_url: voice?.url || null,
        voice_recording_public_id: voice?.public_id || null,
        voice_recording_duration: voice?.duration || null,
        new_status: newStatus || null,
        next_action: nextAction === 'none' ? null : nextAction,
        next_followup_date: nextAction === 'next_followup' ? nextDate : null,
        next_followup_time: nextAction === 'next_followup' ? nextTime : null,
      };
      await axios.post(`${API}/followups/${followup._id}/complete`, body);
      toast.success('Follow-up completed');
      onOpenChange(false);
      onDone && onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to complete follow-up');
    } finally {
      setSubmitting(false);
    }
  };

  if (!followup) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="complete-followup-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Complete Follow-up</DialogTitle>
          <DialogDescription>
            <strong>{followup.lead_name}</strong> · {followup.followup_date} {followup.followup_time}
            {followup.remarks && (
              <span className="block mt-1 text-xs">Plan: <span className="italic">"{followup.remarks}"</span></span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Outcome / what happened *</Label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder="e.g. Lead is interested but wants EMI option. Will share fee structure tomorrow."
              data-testid="complete-summary-input"
              maxLength={2000}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Voice recording (optional)</Label>
            <VoiceRecorder value={voice} onChange={setVoice} />
            <p className="text-[11px] text-slate-500">Record your call summary in Bengali/English — or upload the WhatsApp audio.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Change lead status (optional)</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger data-testid="complete-status-select"><SelectValue placeholder="Keep current status" /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>What's next?</Label>
            <Select value={nextAction} onValueChange={setNextAction}>
              <SelectTrigger data-testid="complete-next-action-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nothing — done for now</SelectItem>
                <SelectItem value="next_followup">Schedule another follow-up</SelectItem>
                <SelectItem value="book_demo">{`Book ${(user?.features?.demo_label || 'Demo').replace(/s$/,'')} (go to ${user?.features?.demo_label || 'Demos'} page)`}</SelectItem>
                <SelectItem value="convert">Mark lead converted</SelectItem>
                <SelectItem value="lost">Mark lead lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {nextAction === 'next_followup' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-md">
              <div className="space-y-1.5">
                <Label className="text-xs">Next date *</Label>
                <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} data-testid="next-date-input" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Next time</Label>
                <Input type="time" value={nextTime} onChange={(e) => setNextTime(e.target.value)} data-testid="next-time-input" />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !summary.trim() || (nextAction === 'next_followup' && !nextDate)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            data-testid="confirm-complete-btn"
          >
            {submitting ? 'Saving…' : 'Mark Complete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FollowupsPage() {
  const [followups, setFollowups] = useState({ today: [], upcoming: [], missed: [] });
  const [totals, setTotals] = useState({ today: 0, upcoming: 0, missed: 0 });
  const [pages, setPages] = useState({ today: 1, upcoming: 1, missed: 1 });
  const [totalPages, setTotalPages] = useState({ today: 1, upcoming: 1, missed: 1 });
  const PER_PAGE = 25;
  const [activeTab, setActiveTab] = useState('today');
  const [voiceOnly, setVoiceOnly] = useState(false);
  const [completing, setCompleting] = useState(null); // followup obj

  useEffect(() => {
    fetchTab('today', pages.today);
    fetchTab('upcoming', pages.upcoming);
    fetchTab('missed', pages.missed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTab = async (tab, p) => {
    try {
      const { data } = await axios.get(`${API}/followups`, {
        params: { filter_type: tab, page: p, limit: PER_PAGE },
      });
      const items = Array.isArray(data) ? data : (data.items || []);
      const total = Array.isArray(data) ? data.length : (data.total || 0);
      const tp = Array.isArray(data) ? 1 : (data.total_pages || 1);
      setFollowups((prev) => ({ ...prev, [tab]: items }));
      setTotals((prev) => ({ ...prev, [tab]: total }));
      setTotalPages((prev) => ({ ...prev, [tab]: tp }));
    } catch (e) {
      toast.error(`Failed to fetch ${tab} follow-ups`);
    }
  };

  const fetchAll = () => {
    fetchTab('today', pages.today);
    fetchTab('upcoming', pages.upcoming);
    fetchTab('missed', pages.missed);
  };

  const changePage = (tab, newPage) => {
    setPages((prev) => ({ ...prev, [tab]: newPage }));
    fetchTab(tab, newPage);
  };

  const openComplete = (followup) => setCompleting(followup);

  const applyVoiceFilter = (list) => voiceOnly ? list.filter((f) => !!f.voice_recording_url) : list;
  const todayList = applyVoiceFilter(followups.today);
  const upcomingList = applyVoiceFilter(followups.upcoming);
  const missedList = applyVoiceFilter(followups.missed);
  const voiceCount = (followups.today.concat(followups.upcoming, followups.missed)).filter((f) => !!f.voice_recording_url).length;

  const PaginationFooter = ({ tab }) => {
    const total = totals[tab];
    const tp = totalPages[tab];
    const p = pages[tab];
    if (!total || tp <= 1) return null;
    return (
      <div className="flex items-center justify-between gap-3 flex-wrap pt-2" data-testid={`followups-pagination-${tab}`}>
        <p className="text-xs text-slate-600">
          Showing <span className="font-semibold text-slate-900">{(p - 1) * PER_PAGE + 1}</span>
          {' – '}
          <span className="font-semibold text-slate-900">{Math.min(p * PER_PAGE, total)}</span>
          {' of '}
          <span className="font-semibold text-slate-900">{total}</span>
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={p <= 1}
            onClick={() => changePage(tab, Math.max(1, p - 1))}
            data-testid={`followups-prev-${tab}`}
          >
            Prev
          </Button>
          <span className="text-xs text-slate-600 px-2">
            Page <span className="font-semibold text-slate-900">{p}</span> of{' '}
            <span className="font-semibold text-slate-900">{tp}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={p >= tp}
            onClick={() => changePage(tab, Math.min(tp, p + 1))}
            data-testid={`followups-next-${tab}`}
          >
            Next
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6" data-testid="followups-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Engagement</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily: 'Sora'}}>Follow-ups</h1>
          <p className="text-sm text-slate-600 mt-1">Schedule a call · Make the call · Tap ✓ to log outcome + voice.</p>
        </div>
        <button
          onClick={() => setVoiceOnly((v) => !v)}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${voiceOnly ? 'bg-violet-700 text-white border-violet-700' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}
          data-testid="voice-only-toggle"
          title="Show only follow-ups that include a voice note"
        >
          <Filter className="w-3.5 h-3.5" />
          Voice notes ({voiceCount})
        </button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-100 flex flex-wrap h-auto sm:h-10 sm:flex-nowrap gap-1 w-full sm:w-auto">
          <TabsTrigger value="today" data-testid="tab-today">
            Today
            <span
              className={`ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold tabular-nums ${activeTab === 'today' ? 'bg-violet-700 text-white' : 'bg-violet-100 text-violet-700'}`}
              data-testid="tab-today-count"
            >
              {totals.today}
            </span>
          </TabsTrigger>
          <TabsTrigger value="upcoming" data-testid="tab-upcoming">
            Upcoming
            <span
              className={`ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold tabular-nums ${activeTab === 'upcoming' ? 'bg-violet-700 text-white' : 'bg-amber-100 text-amber-700'}`}
              data-testid="tab-upcoming-count"
            >
              {totals.upcoming}
            </span>
          </TabsTrigger>
          <TabsTrigger value="missed" data-testid="tab-missed">
            Missed
            <span
              className={`ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold tabular-nums ${activeTab === 'missed' ? 'bg-violet-700 text-white' : 'bg-red-100 text-red-700'}`}
              data-testid="tab-missed-count"
            >
              {totals.missed}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-3 mt-4">
          {todayList.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-md p-12 text-center text-slate-500">
              {voiceOnly ? 'No follow-ups with voice notes today' : 'No follow-ups scheduled for today'}
            </div>
          ) : (
            todayList.map((fu) => <FollowupCard key={fu._id} followup={fu} onComplete={openComplete} type="today" />)
          )}
          <PaginationFooter tab="today" />
        </TabsContent>

        <TabsContent value="upcoming" className="space-y-3 mt-4">
          {upcomingList.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-md p-12 text-center text-slate-500">
              {voiceOnly ? 'No upcoming follow-ups with voice notes' : 'No upcoming follow-ups'}
            </div>
          ) : (
            upcomingList.map((fu) => <FollowupCard key={fu._id} followup={fu} onComplete={openComplete} type="upcoming" />)
          )}
          <PaginationFooter tab="upcoming" />
        </TabsContent>

        <TabsContent value="missed" className="space-y-3 mt-4">
          {missedList.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-md p-12 text-center text-slate-500">
              {voiceOnly ? 'No missed follow-ups with voice notes' : 'No missed follow-ups'}
            </div>
          ) : (
            missedList.map((fu) => <FollowupCard key={fu._id} followup={fu} onComplete={openComplete} type="missed" />)
          )}
          <PaginationFooter tab="missed" />
        </TabsContent>
      </Tabs>

      <CompleteFollowupDialog
        followup={completing}
        open={!!completing}
        onOpenChange={(o) => { if (!o) setCompleting(null); }}
        onDone={() => { setCompleting(null); fetchAll(); }}
      />
    </div>
  );
}
