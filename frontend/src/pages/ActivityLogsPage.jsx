import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Activity, UserPlus, GraduationCap, FileText } from 'lucide-react';
import { toast } from 'sonner';

const timeAgo = (iso) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const iconFor = (target) => {
  if (target === 'leads') return UserPlus;
  if (target === 'admissions') return GraduationCap;
  return FileText;
};

export default function ActivityLogsPage() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    axios.get(`${API}/activity-logs`)
      .then(({ data }) => setLogs(data))
      .catch(() => toast.error('Failed to load activity logs'));
  }, []);

  return (
    <div className="space-y-6 max-w-4xl" data-testid="activity-logs-page">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 mb-1.5">Audit</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>Activity Logs</h1>
        <p className="text-sm text-slate-500 mt-1">Track every action across your team</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        {logs.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            <Activity className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            No activity logs yet
          </div>
        ) : (
          <div className="space-y-4">
            {logs.map((log, i) => {
              const Icon = iconFor(log.target_type);
              return (
                <div key={log._id} className="flex gap-4" data-testid={`log-${i}`}>
                  <div className="w-10 h-10 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-violet-700" />
                  </div>
                  <div className="flex-1 min-w-0 pb-4 border-b border-slate-100">
                    <p className="text-sm text-slate-900">
                      <span className="font-semibold">{log.user_name}</span>{' '}
                      <span className="text-slate-600">{log.action.replace(/_/g, ' ')}</span>
                      {log.target_type && <span className="text-slate-500"> {log.target_type}</span>}
                    </p>
                    {log.details && <p className="text-xs text-slate-500 mt-1">{log.details}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">{timeAgo(log.timestamp)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
