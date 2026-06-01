import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Calendar, Phone, MessageSquare, CheckCircle2, Clock, AlertCircle, Mic, User, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
            {type === 'missed' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded-md border border-red-200">
                <AlertCircle className="w-3 h-3" />
                Missed
              </span>
            )}
            {type === 'today' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-md border border-amber-200">
                <Clock className="w-3 h-3" />
                Today
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 mb-2">{followup.remarks}</p>
          {followup.voice_recording_url && (
            <div className="bg-violet-50 border border-violet-200 rounded-md p-2 flex items-center gap-2 mb-2" data-testid={`followup-voice-${followup._id}`}>
              <Mic className="w-3.5 h-3.5 text-violet-600 flex-shrink-0" />
              <audio src={followup.voice_recording_url} controls className="flex-1 h-8" />
              {followup.voice_recording_duration && (
                <span className="text-[10px] font-mono text-slate-500">
                  {Math.floor(followup.voice_recording_duration)}s
                </span>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
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
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </Button>
          )}
          {!followup.completed && (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => onComplete(followup._id)}
              data-testid={`followup-complete-${followup._id}`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default function FollowupsPage() {
  const [followups, setFollowups] = useState({ today: [], upcoming: [], missed: [] });
  const [activeTab, setActiveTab] = useState('today');
  const [voiceOnly, setVoiceOnly] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [todayRes, upcomingRes, missedRes] = await Promise.all([
        axios.get(`${API}/followups`, { params: { filter_type: 'today' } }),
        axios.get(`${API}/followups`, { params: { filter_type: 'upcoming' } }),
        axios.get(`${API}/followups`, { params: { filter_type: 'missed' } }),
      ]);
      setFollowups({
        today: todayRes.data,
        upcoming: upcomingRes.data,
        missed: missedRes.data,
      });
    } catch (e) {
      toast.error('Failed to fetch follow-ups');
    }
  };

  const handleComplete = async (id) => {
    try {
      await axios.put(`${API}/followups/${id}/complete`);
      toast.success('Follow-up completed');
      fetchAll();
    } catch (e) {
      toast.error('Failed to complete follow-up');
    }
  };

  const applyVoiceFilter = (list) => voiceOnly ? list.filter((f) => !!f.voice_recording_url) : list;
  const todayList = applyVoiceFilter(followups.today);
  const upcomingList = applyVoiceFilter(followups.upcoming);
  const missedList = applyVoiceFilter(followups.missed);
  const voiceCount = (followups.today.concat(followups.upcoming, followups.missed)).filter((f) => !!f.voice_recording_url).length;

  return (
    <div className="space-y-6" data-testid="followups-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Engagement</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily: 'Sora'}}>Follow-ups</h1>
          <p className="text-sm text-slate-600 mt-1">Stay on top of every prospect interaction.</p>
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
        <TabsList className="bg-slate-100">
          <TabsTrigger value="today" data-testid="tab-today">
            Today ({todayList.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming" data-testid="tab-upcoming">
            Upcoming ({upcomingList.length})
          </TabsTrigger>
          <TabsTrigger value="missed" data-testid="tab-missed">
            Missed ({missedList.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-3 mt-4">
          {todayList.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-md p-12 text-center text-slate-500">
              {voiceOnly ? 'No follow-ups with voice notes today' : 'No follow-ups scheduled for today'}
            </div>
          ) : (
            todayList.map((fu) => (
              <FollowupCard key={fu._id} followup={fu} onComplete={handleComplete} type="today" />
            ))
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="space-y-3 mt-4">
          {upcomingList.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-md p-12 text-center text-slate-500">
              {voiceOnly ? 'No upcoming follow-ups with voice notes' : 'No upcoming follow-ups'}
            </div>
          ) : (
            upcomingList.map((fu) => (
              <FollowupCard key={fu._id} followup={fu} onComplete={handleComplete} type="upcoming" />
            ))
          )}
        </TabsContent>

        <TabsContent value="missed" className="space-y-3 mt-4">
          {missedList.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-md p-12 text-center text-slate-500">
              {voiceOnly ? 'No missed follow-ups with voice notes' : 'No missed follow-ups'}
            </div>
          ) : (
            missedList.map((fu) => (
              <FollowupCard key={fu._id} followup={fu} onComplete={handleComplete} type="missed" />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
