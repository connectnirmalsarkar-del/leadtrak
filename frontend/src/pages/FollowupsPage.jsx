import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Calendar, Phone, MessageSquare, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const FollowupCard = ({ followup, onComplete, type }) => {
  const formatDateTime = (date, time) => {
    return `${new Date(date).toLocaleDateString()} ${time}`;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-md p-4 hover:border-slate-300 transition-colors" data-testid={`followup-card-${followup._id}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <p className="font-medium text-slate-900">{followup.lead_name || 'Lead'}</p>
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

  return (
    <div className="space-y-6" data-testid="followups-page">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Engagement</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{fontFamily: 'Outfit'}}>Follow-ups</h1>
        <p className="text-sm text-slate-600 mt-1">Stay on top of every prospect interaction.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-100">
          <TabsTrigger value="today" data-testid="tab-today">
            Today ({followups.today.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming" data-testid="tab-upcoming">
            Upcoming ({followups.upcoming.length})
          </TabsTrigger>
          <TabsTrigger value="missed" data-testid="tab-missed">
            Missed ({followups.missed.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-3 mt-4">
          {followups.today.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-md p-12 text-center text-slate-500">
              No follow-ups scheduled for today
            </div>
          ) : (
            followups.today.map((fu) => (
              <FollowupCard key={fu._id} followup={fu} onComplete={handleComplete} type="today" />
            ))
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="space-y-3 mt-4">
          {followups.upcoming.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-md p-12 text-center text-slate-500">
              No upcoming follow-ups
            </div>
          ) : (
            followups.upcoming.map((fu) => (
              <FollowupCard key={fu._id} followup={fu} onComplete={handleComplete} type="upcoming" />
            ))
          )}
        </TabsContent>

        <TabsContent value="missed" className="space-y-3 mt-4">
          {followups.missed.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-md p-12 text-center text-slate-500">
              No missed follow-ups
            </div>
          ) : (
            followups.missed.map((fu) => (
              <FollowupCard key={fu._id} followup={fu} onComplete={handleComplete} type="missed" />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
