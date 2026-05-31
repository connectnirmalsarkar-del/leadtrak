import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';
import { Users, UserPlus, Calendar, GraduationCap, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

const StatCard = ({ icon: Icon, label, value, trend, color = 'blue', testId }) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    rose: 'bg-rose-50 text-rose-600',
  };

  return (
    <div className="bg-white border border-slate-200 rounded-md p-6 hover:border-slate-300 transition-colors" data-testid={testId}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-md flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 mb-1">{label}</p>
      <p className="text-3xl font-semibold text-slate-900 font-mono tracking-tight">{value}</p>
    </div>
  );
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    total_leads: 0,
    todays_leads: 0,
    pending_followups: 0,
    admissions_done: 0,
    conversion_rate: 0,
  });
  const [leadSources, setLeadSources] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, sourcesRes, trendRes] = await Promise.all([
        axios.get(`${API}/dashboard/stats`),
        axios.get(`${API}/dashboard/lead-sources`),
        axios.get(`${API}/dashboard/monthly-trend`),
      ]);
      setStats(statsRes.data);
      setLeadSources(sourcesRes.data);
      setMonthlyTrend(trendRes.data);
    } catch (e) {
      console.error('Failed to fetch dashboard data', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Overview</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{fontFamily: 'Outfit'}}>
          Welcome back, {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-sm text-slate-600 mt-1">Here's what's happening with your leads today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Users} label="Total Leads" value={stats.total_leads} color="blue" testId="stat-total-leads" />
        <StatCard icon={UserPlus} label="Today's Leads" value={stats.todays_leads} color="purple" testId="stat-todays-leads" />
        <StatCard icon={Calendar} label="Pending Follow-ups" value={stats.pending_followups} color="amber" testId="stat-pending-followups" />
        <StatCard icon={GraduationCap} label="Admissions" value={stats.admissions_done} color="green" testId="stat-admissions" />
        <StatCard icon={TrendingUp} label="Conversion Rate" value={`${stats.conversion_rate}%`} color="rose" testId="stat-conversion" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Trend */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-md p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 mb-1">Trends</p>
              <h3 className="text-lg font-medium text-slate-900" style={{fontFamily: 'Outfit'}}>Monthly Lead Trend</h3>
            </div>
          </div>
          {monthlyTrend.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">
              No data yet. Start adding leads to see trends.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="month" stroke="#94A3B8" style={{fontSize: '12px'}} />
                <YAxis stroke="#94A3B8" style={{fontSize: '12px'}} />
                <Tooltip contentStyle={{ borderRadius: '6px', border: '1px solid #E2E8F0' }} />
                <Line type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Lead Sources */}
        <div className="bg-white border border-slate-200 rounded-md p-6">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 mb-1">Distribution</p>
            <h3 className="text-lg font-medium text-slate-900" style={{fontFamily: 'Outfit'}}>Lead Sources</h3>
          </div>
          {leadSources.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400 text-center">
              No leads yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={leadSources}
                  dataKey="count"
                  nameKey="source"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(entry) => entry.source}
                >
                  {leadSources.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '6px', border: '1px solid #E2E8F0' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-slate-200 rounded-md p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4" style={{fontFamily: 'Outfit'}}>Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Add Lead', href: '/leads', color: 'bg-blue-600' },
            { label: 'View Follow-ups', href: '/followups', color: 'bg-amber-500' },
            { label: 'Record Admission', href: '/admissions', color: 'bg-emerald-600' },
            { label: 'Generate Report', href: '/reports', color: 'bg-purple-600' },
          ].map((action, i) => (
            <a
              key={i}
              href={action.href}
              className={`${action.color} text-white text-sm font-medium px-4 py-3 rounded-md text-center hover:opacity-90 transition-opacity`}
              data-testid={`quick-action-${i}`}
            >
              {action.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
