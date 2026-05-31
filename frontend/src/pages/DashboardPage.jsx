import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { API } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';
import { useTerminology } from '@/lib/terminology';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  UserPlus,
  Calendar,
  GraduationCap,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Phone,
  MessageSquare,
  Trophy,
  Activity,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const CHART_COLORS = ['#7C3AED', '#4F46E5', '#D946EF', '#10B981', '#F59E0B', '#06B6D4'];

const AVATARS = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?crop=entropy&cs=srgb&fm=jpg&w=128&q=80',
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?crop=entropy&cs=srgb&fm=jpg&w=128&q=80',
  'https://images.unsplash.com/photo-1652471943570-f3590a4e52ed?crop=entropy&cs=srgb&fm=jpg&w=128&q=80',
  'https://images.unsplash.com/photo-1685760259914-ee8d2c92d2e0?crop=entropy&cs=srgb&fm=jpg&w=128&q=80',
];

const useCountUp = (target, duration = 1200) => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target || isNaN(target)) {
      setVal(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p >= 1) clearInterval(id);
    }, 24);
    return () => clearInterval(id);
  }, [target, duration]);
  return val;
};

const StatCard = ({ icon: Icon, label, value, trend, sparkData, color, testId, suffix = '' }) => {
  const colorMap = {
    violet: { bg: 'bg-violet-50', text: 'text-violet-700', stroke: '#7C3AED' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', stroke: '#3B82F6' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', stroke: '#F59E0B' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', stroke: '#10B981' },
    fuchsia: { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', stroke: '#D946EF' },
  };
  const c = colorMap[color] || colorMap.violet;
  const num = typeof value === 'number' ? value : parseFloat(value) || 0;
  const displayVal = useCountUp(num);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all"
      data-testid={testId}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg ${c.bg} ${c.text} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-0.5 text-xs font-semibold ${trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1">{label}</p>
      <p className="text-3xl font-bold tracking-tighter text-slate-900 font-mono">
        {displayVal}{suffix}
      </p>
      {sparkData && sparkData.length > 0 && (
        <div className="mt-3 h-8 -mx-1" style={{ minWidth: 1, minHeight: 1 }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <AreaChart data={sparkData}>
              <defs>
                <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.stroke} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={c.stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={c.stroke} strokeWidth={1.5} fill={`url(#grad-${color})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
};

const FunnelBar = ({ stages }) => {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  return (
    <div className="space-y-3">
      {stages.map((stage, i) => {
        const width = (stage.count / maxCount) * 100;
        return (
          <div key={stage.stage} className="flex items-center gap-3">
            <div className="w-28 text-xs font-semibold text-slate-600 text-right">{stage.stage}</div>
            <div className="flex-1 bg-slate-100 rounded-md h-9 overflow-hidden relative">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${width}%` }}
                transition={{ duration: 0.8, delay: i * 0.1 }}
                className="h-full rounded-md flex items-center justify-end px-3"
                style={{
                  background: `linear-gradient(90deg, ${CHART_COLORS[i]} 0%, ${CHART_COLORS[i]}CC 100%)`,
                }}
              >
                <span className="text-xs font-bold text-white font-mono">{stage.count}</span>
              </motion.div>
            </div>
            <div className="w-12 text-xs text-slate-500 font-mono">{stage.percentage}%</div>
          </div>
        );
      })}
    </div>
  );
};

const timeAgo = (iso) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const t = useTerminology();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState('30');
  const [stats, setStats] = useState({ total_leads: 0, todays_leads: 0, pending_followups: 0, admissions_done: 0, conversion_rate: 0 });
  const [leadSources, setLeadSources] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [funnel, setFunnel] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [activity, setActivity] = useState([]);
  const [todayFollowups, setTodayFollowups] = useState([]);
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/dashboard/stats`),
      axios.get(`${API}/dashboard/lead-sources`),
      axios.get(`${API}/dashboard/monthly-trend`),
      axios.get(`${API}/dashboard/funnel`),
      axios.get(`${API}/dashboard/leaderboard`),
      axios.get(`${API}/dashboard/activity-feed`),
      axios.get(`${API}/dashboard/today-followups`),
      axios.get(`${API}/subscription/status`).catch(() => ({ data: null })),
    ]).then(([s, src, mt, fn, lb, af, tf, sub]) => {
      setStats(s.data);
      setLeadSources(src.data);
      setMonthlyTrend(mt.data);
      setFunnel(fn.data);
      setLeaderboard(lb.data);
      setActivity(af.data);
      setTodayFollowups(tf.data);
      setSubscription(sub.data);
    }).catch((e) => console.error(e));
  }, []);

  // Build sparkline data from monthly trend (with safe fallback when data is sparse)
  const sparkData = (() => {
    const fallback = [1, 3, 2, 5, 4, 7].map((v) => ({ v }));
    if (!monthlyTrend || monthlyTrend.length < 2) return fallback;
    const points = monthlyTrend.slice(-6).map((m) => ({ v: Number(m.count) || 0 }));
    // If every point is 0 or identical, the area chart looks empty — use fallback shape
    const distinct = new Set(points.map((p) => p.v));
    if (distinct.size <= 1) return fallback;
    return points;
  })();

  return (
    <div className="max-w-[1440px] mx-auto space-y-6" data-testid="dashboard-page">
      {/* Subscription Banner — show only if trial or expiring soon or expired */}
      {subscription && user?.role !== 'super_admin' && (() => {
        const status = subscription.status;
        const days = subscription.days_remaining ?? 0;
        const isTrial = status === 'trial';
        const isExpired = status === 'expired';
        const isWarning = days <= 7 && !isExpired;
        if (!isTrial && !isWarning && !isExpired) return null;
        const bg = isExpired
          ? 'bg-red-50 border-red-200'
          : isWarning
            ? 'bg-amber-50 border-amber-200'
            : 'bg-violet-50 border-violet-200';
        const accent = isExpired ? 'text-red-700' : isWarning ? 'text-amber-700' : 'text-violet-700';
        const headline = isExpired
          ? 'Your subscription has expired'
          : isTrial
            ? `You're on a 14-day trial — ${days} days remaining`
            : `Subscription expires in ${days} day${days === 1 ? '' : 's'}`;
        const sub = isExpired
          ? 'Renew now to regain full access to your leads, follow-ups and reports.'
          : isTrial
            ? `Upgrade to ${subscription.plan === 'starter' ? 'Growth' : 'a paid plan'} to keep your workspace active after the trial.`
            : 'Renew now to avoid any service interruption.';
        return (
          <div className={`border rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${bg}`} data-testid="subscription-banner">
            <div>
              <p className={`text-sm font-bold ${accent}`} data-testid="subscription-banner-headline">{headline}</p>
              <p className="text-xs sm:text-sm text-slate-700 mt-0.5">{sub}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => navigate('/subscription')}
                className={isExpired ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-violet-700 hover:bg-violet-800 text-white'}
                data-testid="subscription-banner-cta"
              >
                {isExpired ? 'Renew Now' : 'Upgrade Plan'}
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 mb-1.5">Overview</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>
            Welcome back, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-36 h-10" data-testid="dashboard-date-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Today</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">This quarter</SelectItem>
              <SelectItem value="365">This year</SelectItem>
            </SelectContent>
          </Select>
          <Button
            className="bg-violet-700 hover:bg-violet-800 text-white shadow-lg shadow-violet-100"
            onClick={() => navigate('/leads')}
            data-testid="dashboard-new-lead-btn"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New {t.lead}
          </Button>
        </div>
      </div>

      {/* Top Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard icon={Users} label={`Total ${t.leads}`} value={stats.total_leads} trend={18} sparkData={sparkData} color="violet" testId="stat-total-leads" />
        <StatCard icon={UserPlus} label={`Today's ${t.leads}`} value={stats.todays_leads} trend={24} sparkData={sparkData} color="blue" testId="stat-todays-leads" />
        <StatCard icon={Calendar} label="Pending Follow-ups" value={stats.pending_followups} trend={-5} sparkData={sparkData} color="amber" testId="stat-pending-followups" />
        <StatCard icon={Trophy} label={t.conversions} value={stats.admissions_done} trend={22} sparkData={sparkData} color="emerald" testId="stat-admissions" />
        <StatCard icon={TrendingUp} label="Conversion" value={stats.conversion_rate} suffix="%" trend={3} sparkData={sparkData} color="fuchsia" testId="stat-conversion" />
      </div>

      {/* Row 1: Funnel + Source */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1">Conversion</p>
              <h3 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Sora' }}>{t.lead} Funnel</h3>
            </div>
            <button className="text-xs text-violet-700 font-semibold flex items-center gap-1 hover:text-violet-800" onClick={() => navigate('/leads')} data-testid="view-all-leads-btn">
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {funnel.length > 0 ? (
            <FunnelBar stages={funnel} />
          ) : (
            <div className="text-center py-8 text-sm text-slate-400">No data yet</div>
          )}
        </div>

        <div className="col-span-12 lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1">Distribution</p>
            <h3 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Sora' }}>{t.lead} Sources</h3>
          </div>
          {leadSources.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-slate-400">No data</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={leadSources} dataKey="count" nameKey="source" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {leadSources.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {leadSources.slice(0, 4).map((s, i) => (
                  <div key={s.source} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}></span>
                      <span className="text-slate-600">{s.source}</span>
                    </div>
                    <span className="font-mono font-semibold text-slate-900">{s.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Row 2: Trends Chart + Leaderboard */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1">Trends</p>
              <h3 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Sora' }}>Monthly Lead Trend</h3>
            </div>
          </div>
          {monthlyTrend.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={monthlyTrend}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="month" stroke="#94A3B8" style={{ fontSize: '11px' }} />
                <YAxis stroke="#94A3B8" style={{ fontSize: '11px' }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }} />
                <Area type="monotone" dataKey="count" stroke="#7C3AED" strokeWidth={2.5} fill="url(#trendGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="col-span-12 lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1">Performance</p>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: 'Sora' }}>
                <Trophy className="w-4 h-4 text-amber-500" />
                Top Counselors
              </h3>
            </div>
          </div>
          {leaderboard.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-slate-400 text-center">
              No team members yet
            </div>
          ) : (
            <div className="space-y-3">
              {leaderboard.map((m, i) => {
                const initials = m.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
                return (
                  <div key={m.user_id} className="flex items-center gap-3" data-testid={`leaderboard-row-${i}`}>
                    <div className="text-sm font-bold text-slate-400 w-4">{i + 1}</div>
                    <Avatar className="w-9 h-9">
                      <AvatarImage src={AVATARS[i % AVATARS.length]} />
                      <AvatarFallback className="bg-violet-100 text-violet-700 text-xs font-semibold">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{m.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-600 rounded-full" style={{ width: `${Math.min(m.conversion_rate, 100)}%` }}></div>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono w-8">{m.conversion_rate}%</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900 font-mono">{m.admissions}</p>
                      <p className="text-[10px] text-slate-400 uppercase">adm</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Today's Follow-ups + Activity Feed */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1">Today</p>
              <h3 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Sora' }}>Follow-ups Scheduled</h3>
            </div>
            <button className="text-xs text-violet-700 font-semibold flex items-center gap-1 hover:text-violet-800" onClick={() => navigate('/followups')} data-testid="view-followups-btn">
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {todayFollowups.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-16 h-16 mx-auto mb-3 bg-violet-50 rounded-full flex items-center justify-center">
                <Calendar className="w-8 h-8 text-violet-300" />
              </div>
              <p className="text-sm text-slate-500">No follow-ups scheduled for today</p>
            </div>
          ) : (
            <div className="space-y-2">
              {todayFollowups.map((fu) => (
                <div key={fu._id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-violet-50 group transition-colors">
                  <div className="w-9 h-9 bg-white rounded-md flex items-center justify-center font-mono text-xs font-semibold text-slate-600 border border-slate-200">
                    {fu.followup_time}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{fu.lead_name || 'Lead'}</p>
                    <p className="text-xs text-slate-500 truncate">{fu.remarks}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {fu.lead_mobile && (
                      <>
                        <button
                          className="w-8 h-8 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-md flex items-center justify-center"
                          onClick={() => window.open(`https://wa.me/${fu.lead_mobile.replace(/\D/g, '')}`, '_blank')}
                          data-testid={`fu-wa-${fu._id}`}
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        <button
                          className="w-8 h-8 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded-md flex items-center justify-center"
                          onClick={() => window.open(`tel:${fu.lead_mobile}`)}
                          data-testid={`fu-call-${fu._id}`}
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="col-span-12 lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1">Activity</p>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: 'Sora' }}>
                <Activity className="w-4 h-4 text-violet-600" />
                Recent Activity
              </h3>
            </div>
          </div>
          {activity.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No activity yet</div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {activity.map((a, i) => (
                <div key={i} className="flex gap-3" data-testid={`activity-${i}`}>
                  <div className="relative">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${a.color === 'emerald' ? 'bg-emerald-500' : 'bg-violet-500'}`}></div>
                    {i < activity.length - 1 && <div className="absolute top-3 left-0.5 w-px h-full bg-slate-200"></div>}
                  </div>
                  <div className="flex-1 pb-3">
                    <p className="text-xs text-slate-700">
                      <span className="font-semibold">{a.actor}</span>{' '}
                      <span className="text-slate-500">{a.text}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(a.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI Insight Banner */}
      <div className="bg-gradient-to-r from-violet-600 via-violet-700 to-indigo-700 rounded-xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-fuchsia-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30"></div>
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200 mb-0.5">AI Insight</p>
              <h3 className="text-lg font-bold" style={{ fontFamily: 'Sora' }}>
                {stats.total_leads > 0
                  ? `${stats.conversion_rate}% conversion this period — focus on Interested leads for max ROI`
                  : 'Add your first leads to unlock AI-powered conversion insights'}
              </h3>
            </div>
          </div>
          <Button className="bg-white text-violet-700 hover:bg-violet-50 hidden sm:flex" onClick={() => navigate('/reports')} data-testid="ai-insight-cta">
            View Report
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
