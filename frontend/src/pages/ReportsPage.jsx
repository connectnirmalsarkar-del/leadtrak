import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Download, IndianRupee, Users, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { toast } from 'sonner';

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

export default function ReportsPage() {
  const [summary, setSummary] = useState({ total: 0, by_status: [], by_source: [] });
  const [revenue, setRevenue] = useState(0);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const [summaryRes, revenueRes] = await Promise.all([
        axios.get(`${API}/reports/lead-summary`),
        axios.get(`${API}/reports/revenue`),
      ]);
      setSummary(summaryRes.data);
      setRevenue(revenueRes.data.total_revenue);
    } catch (e) {
      toast.error('Failed to load reports');
    }
  };

  const handleExport = (format) => {
    toast.success(`${format} export will be available in next release`);
  };

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Analytics</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{fontFamily: 'Outfit'}}>Reports</h1>
          <p className="text-sm text-slate-600 mt-1">Performance insights across your pipeline</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleExport('Excel')} data-testid="export-excel-btn">
            <Download className="w-4 h-4 mr-2" />
            Excel
          </Button>
          <Button variant="outline" onClick={() => handleExport('PDF')} data-testid="export-pdf-btn">
            <Download className="w-4 h-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-md p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-50 rounded-md flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Total Leads</p>
          </div>
          <p className="text-3xl font-semibold text-slate-900 font-mono">{summary.total}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-emerald-50 rounded-md flex items-center justify-center">
              <IndianRupee className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Total Revenue</p>
          </div>
          <p className="text-3xl font-semibold text-slate-900 font-mono">₹{revenue.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber-50 rounded-md flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Active Sources</p>
          </div>
          <p className="text-3xl font-semibold text-slate-900 font-mono">{summary.by_source.length}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-md p-6">
          <h3 className="text-lg font-medium text-slate-900 mb-4" style={{fontFamily: 'Outfit'}}>Leads by Status</h3>
          {summary.by_status.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={summary.by_status}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="status" stroke="#94A3B8" style={{fontSize: '12px'}} />
                <YAxis stroke="#94A3B8" style={{fontSize: '12px'}} />
                <Tooltip contentStyle={{ borderRadius: '6px', border: '1px solid #E2E8F0' }} />
                <Bar dataKey="count" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-6">
          <h3 className="text-lg font-medium text-slate-900 mb-4" style={{fontFamily: 'Outfit'}}>Leads by Source</h3>
          {summary.by_source.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={summary.by_source} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={90} label={(e) => e.source}>
                  {summary.by_source.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '6px', border: '1px solid #E2E8F0' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
