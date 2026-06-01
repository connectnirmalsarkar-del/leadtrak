import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import { useTerminology } from '@/lib/terminology';
import { Plus, Search, Filter, MoreHorizontal, Phone, Mail, MapPin, MessageSquare, Upload, Download, ArrowRightLeft, AlertCircle, Clock, Activity, Video, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import VoiceRecorder from '@/components/VoiceRecorder';
import LeadTimeline from '@/components/LeadTimeline';
import BookDemoDialog from '@/components/BookDemoDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const STATUS_OPTIONS_FALLBACK = ['New', 'Contacted', 'Interested', 'Follow-up', 'Admission Done', 'Not Interested', 'Lost'];
const SOURCES = ['Facebook Ads', 'Website', 'Google Ads', 'Referral', 'Walk-in', 'Telecalling'];

const TEMP_OPTIONS = ['hot', 'warm', 'cold'];
const tempBadgeClass = (t) => {
  const k = (t || 'warm').toLowerCase();
  const base = 'whitespace-nowrap';
  if (k === 'hot') return `${base} bg-red-100 text-red-700 border-red-200`;
  if (k === 'cold') return `${base} bg-sky-100 text-sky-700 border-sky-200`;
  return `${base} bg-amber-100 text-amber-700 border-amber-200`;
};
const tempEmoji = { hot: '🔥', warm: '☀️', cold: '❄️' };

const statusBadgeClass = (status) => {
  const map = {
    'New': 'status-new',
    'Contacted': 'status-contacted',
    'Phone Not Received': 'status-followup',
    'Not Reachable': 'status-notinterested',
    'Wrong Number': 'status-lost',
    'Interested': 'status-interested',
    'Follow-up': 'status-followup',
    'Counseling Scheduled': 'status-followup',
    'Counseling Done': 'status-interested',
    'Application Sent': 'status-interested',
    'Documents Pending': 'status-followup',
    'Fee Discussion': 'status-interested',
    'Demo Scheduled': 'status-followup',
    'Demo Done': 'status-interested',
    'Proposal Sent': 'status-interested',
    'Negotiation': 'status-followup',
    'Contract Sent': 'status-interested',
    'Quote Sent': 'status-interested',
    'Site Visit Scheduled': 'status-followup',
    'Site Visited': 'status-interested',
    'Token Paid': 'status-admission',
    'Booked': 'status-admission',
    'Won': 'status-admission',
    'Admitted': 'status-admission',
    'Issued': 'status-admission',
    'Confirmed': 'status-admission',
    'Travelled': 'status-admission',
    'Ordered': 'status-admission',
    'Delivered': 'status-admission',
    'Member': 'status-admission',
    'Renewed': 'status-admission',
    'Completed': 'status-admission',
    'Admission Done': 'status-admission',
    'On Hold': 'status-followup',
    'Not Interested': 'status-notinterested',
    'Dropped': 'status-lost',
    'Cancelled': 'status-lost',
    'Returned': 'status-lost',
    'Churned': 'status-lost',
    'Rejected': 'status-lost',
    'Lost': 'status-lost',
  };
  return map[status] || 'status-new';
};

export default function LeadsPage() {
  const t = useTerminology();
  const { user } = useAuth();
  // Use industry-specific statuses from /auth/me. While user is still
  // loading (null), keep this empty so we don't briefly flash a generic
  // fallback list that's different from the real one.
  const STATUS_OPTIONS = (user && Array.isArray(user.lead_statuses) && user.lead_statuses.length > 0)
    ? user.lead_statuses
    : (user ? STATUS_OPTIONS_FALLBACK : []);
  // Show industry-specific columns on the leads table (Company shown only
  // for IT Software industry to keep the table compact for everyone else).
  const showCompanyCol = (user?.industry === 'it_software');
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [services, setServices] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const LEADS_PER_PAGE = 50;
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showFollowupDialog, setShowFollowupDialog] = useState(false);
  const [showLogCallDialog, setShowLogCallDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editLead, setEditLead] = useState(null);  // copy of selectedLead being edited
  const [logCall, setLogCall] = useState({ summary: '', voice: null, new_status: '', schedule_next: false, next_date: '', next_time: '10:00', next_remarks: '' });
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showDemoDialog, setShowDemoDialog] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [duplicate, setDuplicate] = useState(null);
  const [timelineRefresh, setTimelineRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState('details');

  const canTransfer = user && ['super_admin', 'org_admin', 'manager'].includes(user.role);
  const canRecordVoice = user && ['super_admin', 'org_admin', 'manager', 'counselor', 'telecaller'].includes(user.role);

  const [newLead, setNewLead] = useState({
    name: '', mobile: '', whatsapp_number: '', wa_different: false, email: '', course_interested: '', state: '', city: '',
    lead_source: 'Website', assigned_to: '', status: 'New', temperature: 'warm',
    company_name: '', designation: '', budget_range: '', preferred_date: '', travellers: '',
  });
  const [formConfig, setFormConfig] = useState({ fields: [], services: [] });

  useEffect(() => {
    axios.get(`${API}/leads/form-config`)
      .then(({ data }) => setFormConfig(data))
      .catch((e) => console.warn('Could not load lead form config:', e?.response?.status));
  }, []);

  const [followup, setFollowup] = useState({
    followup_date: '', followup_time: '', remarks: '', next_followup: '',
    voice: null,
  });

  useEffect(() => {
    fetchLeads();
    fetchUsers();
    fetchServices();
    fetchStates();
  }, [filterStatus, search, page]);

  // Reset to page 1 whenever the filters/search change
  useEffect(() => {
    setPage(1);
  }, [filterStatus, search]);

  // Deep-link: open a specific lead from notification or report drill-down
  useEffect(() => {
    if (leads.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const wantId = params.get('leadId');
    const wantTab = params.get('tab');
    if (!wantId) return;
    const lead = leads.find((l) => l._id === wantId);
    if (lead) {
      setSelectedLead(lead);
      if (wantTab) setActiveTab(wantTab);
      // Clean the URL so a refresh doesn't keep re-opening
      window.history.replaceState({}, '', '/leads');
    }
  }, [leads]);

  const [states, setStates] = useState([]);
  const [citiesForState, setCitiesForState] = useState([]);

  const fetchStates = async () => {
    try {
      const { data } = await axios.get(`${API}/locations/states`);
      setStates(data);
    } catch (e) { /* silent */ }
  };

  const fetchCitiesForState = async (state) => {
    if (!state) { setCitiesForState([]); return; }
    try {
      const { data } = await axios.get(`${API}/locations/cities`, { params: { state } });
      setCitiesForState(data.map((c) => c.city));
    } catch (e) { setCitiesForState([]); }
  };

  const onStateChange = (state) => {
    setNewLead({ ...newLead, state, city: '' });
    fetchCitiesForState(state);
  };

  const fetchLeads = async () => {
    try {
      const params = { page, limit: LEADS_PER_PAGE };
      if (filterStatus !== 'all') params.status = filterStatus;
      if (search) params.search = search;
      const { data } = await axios.get(`${API}/leads`, { params });
      // Backend now always returns paginated shape {items, total, page, limit, total_pages}
      // Defensive fallback for the (legacy) array shape just in case
      if (Array.isArray(data)) {
        setLeads(data);
        setTotalLeads(data.length);
        setTotalPages(1);
      } else {
        setLeads(data.items || []);
        setTotalLeads(data.total || 0);
        setTotalPages(data.total_pages || 1);
      }
    } catch (e) {
      toast.error('Failed to fetch leads');
    }
  };

  const fetchUsers = async () => {
    try {
      const { data } = await axios.get(`${API}/users`);
      setUsers(data);
    } catch (e) {
      // ignore if user doesn't have permission
    }
  };

  const fetchServices = async () => {
    try {
      const { data } = await axios.get(`${API}/services`);
      setServices(data);
    } catch (e) {
      // services optional — silent
    }
  };

  const handleAddLead = async () => {
    // Client-side validation — fail fast with clear error before hitting the API
    const trimmedName = (newLead.name || '').trim();
    const trimmedMobile = (newLead.mobile || '').trim();
    if (!trimmedName) {
      toast.error('Full Name is required');
      return;
    }
    if (!trimmedMobile) {
      toast.error('Mobile number is required');
      return;
    }
    if (!newLead.course_interested) {
      toast.error('Please select a Course / Service');
      return;
    }
    try {
      // Strip the UI-only `wa_different` flag; send whatsapp_number only when toggled
      const payload = { ...newLead, name: trimmedName, mobile: trimmedMobile };
      const waDifferent = !!payload.wa_different;
      delete payload.wa_different;
      if (!waDifferent) {
        payload.whatsapp_number = null;
      }
      await axios.post(`${API}/leads`, payload);
      toast.success('Lead added successfully');
      setShowAddDialog(false);
      setDuplicate(null);
      setNewLead({
        name: '', mobile: '', whatsapp_number: '', wa_different: false, email: '', course_interested: '', state: '', city: '',
        lead_source: 'Website', assigned_to: '', status: 'New', temperature: 'warm',
        company_name: '', designation: '', budget_range: '', preferred_date: '', travellers: '',
      });
      setCitiesForState([]);
      fetchLeads();
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 409 && detail && typeof detail === 'object') {
        // Duplicate — show inline
        setDuplicate(detail);
        toast.error(detail.message || 'Duplicate lead');
      } else if (Array.isArray(detail)) {
        // Pydantic 422 — pluck the first field error and humanize it
        const first = detail[0];
        const field = (first?.loc || []).filter((p) => p !== 'body').join('.');
        toast.error(`${field || 'Field'}: ${first?.msg || 'invalid'}`);
      } else {
        toast.error(typeof detail === 'string' ? detail : (detail?.message || 'Failed to add lead'));
      }
    }
  };

  const checkForDuplicate = async () => {
    const mobile = (newLead.mobile || '').trim();
    const email = (newLead.email || '').trim();
    if (!mobile && !email) {
      setDuplicate(null);
      return;
    }
    try {
      const params = {};
      if (mobile) params.mobile = mobile;
      if (email) params.email = email;
      const { data } = await axios.get(`${API}/leads/check-duplicate`, { params });
      if (data.duplicate) {
        setDuplicate({
          message: `Lead with this ${data.matched_on} already exists`,
          existing_lead: data.existing_lead,
        });
      } else {
        setDuplicate(null);
      }
    } catch (e) {
      // silent
    }
  };

  const handleTransfer = async () => {
    if (!selectedLead || !transferTo) {
      toast.error('Please select a team member');
      return;
    }
    try {
      await axios.post(`${API}/leads/${selectedLead._id}/transfer`, {
        new_assignee_id: transferTo,
        reason: transferReason,
      });
      toast.success('Lead transferred');
      setShowTransferDialog(false);
      setTransferTo('');
      setTransferReason('');
      const newAssignee = users.find((u) => u._id === transferTo);
      setSelectedLead({ ...selectedLead, assigned_to: transferTo, assigned_to_name: newAssignee?.name });
      setTimelineRefresh((r) => r + 1);
      fetchLeads();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to transfer lead');
    }
  };

  const handleStatusChange = async (leadId, status) => {
    try {
      await axios.put(`${API}/leads/${leadId}`, { status });
      toast.success('Status updated');
      fetchLeads();
      if (selectedLead) setSelectedLead({ ...selectedLead, status });
      setTimelineRefresh((r) => r + 1);
    } catch (e) {
      toast.error('Failed to update status');
    }
  };

  const handleAddFollowup = async () => {
    if (!selectedLead) return;
    try {
      const payload = {
        lead_id: selectedLead._id,
        followup_date: followup.followup_date,
        followup_time: followup.followup_time,
        remarks: followup.remarks,
        next_followup: followup.next_followup,
      };
      if (followup.voice) {
        payload.voice_recording_url = followup.voice.url;
        payload.voice_recording_public_id = followup.voice.public_id;
        payload.voice_recording_duration = followup.voice.duration;
      }
      await axios.post(`${API}/followups`, payload);
      toast.success('Follow-up added');
      setShowFollowupDialog(false);
      setFollowup({ followup_date: '', followup_time: '', remarks: '', next_followup: '', voice: null });
      setTimelineRefresh((r) => r + 1);
      setActiveTab('timeline');
    } catch (e) {
      toast.error('Failed to add follow-up');
    }
  };


  const handleSaveEdit = async () => {
    if (!editLead) return;
    try {
      const payload = {
        name: editLead.name,
        mobile: editLead.mobile,
        whatsapp_number: editLead.wa_different ? (editLead.whatsapp_number || null) : null,
        email: editLead.email || null,
        course_interested: editLead.course_interested,
        state: editLead.state || null,
        city: editLead.city || null,
        lead_source: editLead.lead_source,
        status: editLead.status,
        temperature: editLead.temperature,
        remarks: editLead.remarks || '',
      };
      // Industry-specific extras — only send if the industry exposes them
      if (showCompanyCol) {
        payload.company_name = editLead.company_name || null;
        payload.designation = editLead.designation || null;
      }
      if (user?.industry === 'admission_consultancy') {
        payload.target_college = editLead.target_college || null;
        payload.course_fee = editLead.course_fee != null && editLead.course_fee !== ''
          ? Number(editLead.course_fee) : null;
      }
      if (['real_estate', 'travel'].includes(user?.industry)) {
        payload.budget_range = editLead.budget_range || null;
      }
      const { data } = await axios.put(`${API}/leads/${editLead._id}`, payload);
      toast.success('Lead updated');
      setShowEditDialog(false);
      setEditLead(null);
      setSelectedLead((cur) => (cur ? { ...cur, ...payload } : cur));
      fetchLeads();
      setTimelineRefresh((r) => r + 1);
      return data;
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update lead');
    }
  };

  const handleLogCall = async () => {
    if (!selectedLead) return;
    const summary = (logCall.summary || '').trim();
    if (!summary) {
      toast.error('Please add outcome / remarks of the call');
      return;
    }
    if (logCall.schedule_next && !logCall.next_date) {
      toast.error('Please pick a date for the next follow-up');
      return;
    }
    try {
      const payload = {
        summary,
        new_status: logCall.new_status || null,
        voice_recording_url: logCall.voice?.url || null,
        voice_recording_public_id: logCall.voice?.public_id || null,
        voice_recording_duration: logCall.voice?.duration || null,
      };
      if (logCall.schedule_next && logCall.next_date) {
        payload.next_followup_date = logCall.next_date;
        payload.next_followup_time = logCall.next_time || '10:00';
        payload.next_followup_remarks = logCall.next_remarks;
      }
      await axios.post(`${API}/leads/${selectedLead._id}/log-call`, payload);
      toast.success('Call logged');
      setShowLogCallDialog(false);
      setLogCall({ summary: '', voice: null, new_status: '', schedule_next: false, next_date: '', next_time: '10:00', next_remarks: '' });
      setTimelineRefresh((r) => r + 1);
      setActiveTab('timeline');
      // Refresh lead in-place so status badge updates
      fetchLeads();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to log call');
    }
  };

  const handleDelete = async (leadId) => {
    if (!window.confirm('Are you sure you want to delete this lead?')) return;
    try {
      await axios.delete(`${API}/leads/${leadId}`);
      toast.success('Lead deleted');
      setSelectedLead(null);
      fetchLeads();
    } catch (e) {
      toast.error('Failed to delete lead');
    }
  };

  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await axios.post(`${API}/leads/import-csv`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const skipped = data.skipped_duplicates || 0;
      const errCount = data.total_errors || 0;
      const distCount = Object.keys(data.distribution || {}).length;
      toast.success(
        `Imported ${data.imported} ${t.leads.toLowerCase()}` +
        (skipped ? ` · ${skipped} duplicates skipped` : '') +
        (distCount ? ` · distributed to ${distCount} callers` : '') +
        (errCount ? ` · ${errCount} errors` : '')
      );
      fetchLeads();
    } catch (err) {
      toast.error('Import failed');
    }
    e.target.value = '';
  };

  const handleDownloadSample = async () => {
    try {
      const res = await axios.get(`${API}/leads/csv-sample`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'leadtrak_sample_leads.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Sample CSV downloaded');
    } catch (err) {
      toast.error('Failed to download sample');
    }
  };

  const handleExcelExport = async () => {
    try {
      const res = await axios.get(`${API}/reports/export-leads-excel`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `leads_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Excel downloaded');
    } catch (err) {
      toast.error('Export failed');
    }
  };

  return (
    <div className="space-y-6" data-testid="leads-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Pipeline</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily: 'Sora'}}>{t.leads}</h1>
          <p className="text-sm text-slate-600 mt-1">{totalLeads} {totalLeads === 1 ? t.lead.toLowerCase() : t.leads.toLowerCase()} total</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={handleDownloadSample} data-testid="download-csv-sample-btn">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            <span className="hidden sm:inline">Sample CSV</span><span className="sm:hidden">Sample</span>
          </Button>
          <label htmlFor="csv-upload" className="cursor-pointer">
            <div className="inline-flex items-center gap-1.5 h-9 sm:h-10 px-3 border border-slate-300 hover:bg-slate-50 rounded-md text-sm font-medium text-slate-700">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import CSV</span><span className="sm:hidden">Import</span>
            </div>
            <input id="csv-upload" type="file" accept=".csv" onChange={handleCSVImport} className="hidden" data-testid="csv-import-input" />
          </label>
          <Button variant="outline" size="sm" onClick={handleExcelExport} data-testid="export-excel-leads-btn">
            <Download className="w-4 h-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Excel</span>
          </Button>

          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-violet-700 hover:bg-violet-800 text-white ml-auto sm:ml-0" data-testid="add-lead-btn">
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Add {t.lead}</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[88vh] p-0 overflow-hidden flex flex-col gap-0">
              <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-100 flex-shrink-0">
              <DialogTitle>Add New {t.lead}</DialogTitle>
              <DialogDescription>Capture a new prospect into your pipeline</DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto flex-1 px-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input
                  value={newLead.name}
                  onChange={(e) => setNewLead({...newLead, name: e.target.value})}
                  required
                  placeholder="e.g. Rahul Sharma"
                  data-testid="lead-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Mobile (Call) *</Label>
                <Input
                  value={newLead.mobile}
                  onChange={(e) => setNewLead({...newLead, mobile: e.target.value})}
                  onBlur={checkForDuplicate}
                  placeholder="+91 9830XXXXXX"
                  required
                  data-testid="lead-mobile-input"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={!!newLead.wa_different}
                    onChange={(e) => setNewLead({ ...newLead, wa_different: e.target.checked, whatsapp_number: e.target.checked ? '' : '' })}
                    data-testid="lead-wa-different-toggle"
                  />
                  <span>WhatsApp number is different from calling number</span>
                </label>
                {newLead.wa_different && (
                  <Input
                    value={newLead.whatsapp_number || ''}
                    onChange={(e) => setNewLead({...newLead, whatsapp_number: e.target.value})}
                    placeholder="+91 9830XXXXXX"
                    className="mt-1"
                    data-testid="lead-whatsapp-input"
                  />
                )}
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newLead.email}
                  onChange={(e) => setNewLead({...newLead, email: e.target.value})}
                  onBlur={checkForDuplicate}
                  data-testid="lead-email-input"
                />
              </div>
              {duplicate && (
                <div className="col-span-2 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2" data-testid="duplicate-warning">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-semibold text-red-800">{duplicate.message}</p>
                    {duplicate.existing_lead && (
                      <p className="text-xs text-red-700 mt-0.5">
                        Existing: <span className="font-mono">{duplicate.existing_lead.lead_id}</span> · {duplicate.existing_lead.name} ({duplicate.existing_lead.mobile})
                      </p>
                    )}
                    <p className="text-xs text-red-600 mt-1">Duplicate leads are blocked. Please use the existing record.</p>
                  </div>
                </div>
              )}
              <div className="space-y-2 col-span-2">
                <Label>{t.offering} Interested In *</Label>
                <Select
                  value={newLead.course_interested}
                  onValueChange={(v) => setNewLead({...newLead, course_interested: v})}
                >
                  <SelectTrigger data-testid="lead-course-select">
                    <SelectValue placeholder={`Select ${t.offering.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s._id} value={s.name} data-testid={`lead-course-option-${s._id}`}>
                        {s.name} {s.category && <span className="text-slate-400">· {s.category}</span>}
                      </SelectItem>
                    ))}
                    {services.length === 0 && (
                      <SelectItem value="General" disabled>
                        No {t.offerings.toLowerCase()} configured — ask admin to add under Services & Pricing
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {showCompanyCol && (
                <>
                  <div className="space-y-2">
                    <Label>Company Name</Label>
                    <Input
                      value={newLead.company_name}
                      onChange={(e) => setNewLead({ ...newLead, company_name: e.target.value })}
                      placeholder="e.g. Acme Tech Pvt Ltd"
                      data-testid="lead-company-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Designation</Label>
                    <Input
                      value={newLead.designation}
                      onChange={(e) => setNewLead({ ...newLead, designation: e.target.value })}
                      placeholder="e.g. CEO, CTO, VP Sales"
                      data-testid="lead-designation-input"
                    />
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label>State</Label>
                <Select value={newLead.state || ''} onValueChange={onStateChange}>
                  <SelectTrigger data-testid="lead-state-select"><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Select value={newLead.city || ''} onValueChange={(v) => setNewLead({ ...newLead, city: v })} disabled={!newLead.state}>
                  <SelectTrigger data-testid="lead-city-select"><SelectValue placeholder={newLead.state ? 'Select city' : 'Select state first'} /></SelectTrigger>
                  <SelectContent>
                    {citiesForState.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t.lead} Source</Label>
                <Select value={newLead.lead_source} onValueChange={(v) => setNewLead({...newLead, lead_source: v})}>
                  <SelectTrigger data-testid="lead-source-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assigned To</Label>
                <Select value={newLead.assigned_to} onValueChange={(v) => setNewLead({...newLead, assigned_to: v})}>
                  <SelectTrigger data-testid="lead-assigned-select"><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => <SelectItem key={u._id} value={u._id}>{u.name} ({u.role})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Temperature</Label>
                <Select value={newLead.temperature} onValueChange={(v) => setNewLead({...newLead, temperature: v})}>
                  <SelectTrigger data-testid="lead-temp-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMP_OPTIONS.map(opt => (
                      <SelectItem key={opt} value={opt}>
                        {tempEmoji[opt]} {opt.charAt(0).toUpperCase() + opt.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Industry-specific extras — same fields as Lead Capture Widget */}
              {(formConfig.fields || []).filter((f) => f.name !== 'course_interested').map((f) => (
                <div key={f.name} className="space-y-2">
                  <Label>{f.label}</Label>
                  {f.type === 'select' ? (
                    <Select value={newLead[f.name] || ''} onValueChange={(v) => setNewLead({ ...newLead, [f.name]: v })}>
                      <SelectTrigger data-testid={`lead-${f.name}-select`}><SelectValue placeholder={f.placeholder || 'Select…'} /></SelectTrigger>
                      <SelectContent>
                        {(f.options || []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={f.type === 'date' ? 'date' : 'text'}
                      value={newLead[f.name] || ''}
                      onChange={(e) => setNewLead({ ...newLead, [f.name]: e.target.value })}
                      placeholder={f.placeholder || ''}
                      data-testid={`lead-${f.name}-input`}
                    />
                  )}
                </div>
              ))}
            </div>
            </div>
            <DialogFooter className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
              <Button variant="outline" onClick={() => { setShowAddDialog(false); setDuplicate(null); }} data-testid="cancel-add-lead-btn">Cancel</Button>
              <Button
                onClick={handleAddLead}
                disabled={!!duplicate || !(newLead.name || '').trim() || !(newLead.mobile || '').trim() || !newLead.course_interested}
                className="bg-violet-700 hover:bg-violet-800 disabled:bg-slate-300 text-white"
                data-testid="submit-add-lead-btn"
              >
                Create {t.lead}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by name, mobile, WhatsApp, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="leads-search-input"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-48" data-testid="leads-status-filter">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Leads Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">{t.lead} ID</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Name</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">{t.offering}</TableHead>
              {showCompanyCol && (
                <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Company</TableHead>
              )}
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Source</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Temp</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Status</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showCompanyCol ? 8 : 7} className="text-center py-12 text-slate-500">
                  No {t.leads.toLowerCase()} found. Click "Add {t.lead}" to get started.
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow
                  key={lead._id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setSelectedLead(lead)}
                  data-testid={`lead-row-${lead.lead_id}`}
                >
                  <TableCell className="font-mono text-xs">{lead.lead_id}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-900">{lead.name}</p>
                      <p className="text-xs text-slate-500">{lead.mobile}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">{lead.course_interested}</TableCell>
                  {showCompanyCol && (
                    <TableCell className="text-sm text-slate-700" data-testid={`lead-company-${lead._id}`}>
                      {lead.company_name || '—'}
                    </TableCell>
                  )}
                  <TableCell className="text-sm text-slate-600 whitespace-nowrap">{lead.lead_source}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant="outline" className={tempBadgeClass(lead.temperature)} data-testid={`temp-badge-${lead._id}`}>
                      {tempEmoji[(lead.temperature || 'warm').toLowerCase()]} {(lead.temperature || 'warm')}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant="outline" className={`${statusBadgeClass(lead.status)} whitespace-nowrap inline-flex`}>
                      <span className="whitespace-nowrap">{lead.status}</span>
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </div>

      {/* Pagination Footer */}
      {totalLeads > 0 && (
        <div
          className="flex items-center justify-between gap-3 flex-wrap pt-1"
          data-testid="leads-pagination"
        >
          <p className="text-xs text-slate-600">
            Showing <span className="font-semibold text-slate-900">{(page - 1) * LEADS_PER_PAGE + 1}</span>
            {' – '}
            <span className="font-semibold text-slate-900">
              {Math.min(page * LEADS_PER_PAGE, totalLeads)}
            </span>
            {' of '}
            <span className="font-semibold text-slate-900">{totalLeads}</span> {t.leads.toLowerCase()}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              data-testid="leads-prev-page"
            >
              Prev
            </Button>
            <span className="text-xs text-slate-600 px-2">
              Page <span className="font-semibold text-slate-900">{page}</span> of{' '}
              <span className="font-semibold text-slate-900">{totalPages}</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              data-testid="leads-next-page"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Lead Detail Drawer */}
      <Sheet open={!!selectedLead} onOpenChange={(o) => { if (!o) { setSelectedLead(null); setActiveTab('details'); } }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto" data-testid="lead-detail-drawer">
          {selectedLead && (
            <>
              <SheetHeader className="pr-10">
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <span className="text-xs font-mono text-slate-500">{selectedLead.lead_id}</span>
                  <div className="flex items-center gap-2">
                    {['super_admin', 'org_admin', 'manager'].includes(user?.role) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => { setEditLead({ ...selectedLead, wa_different: !!(selectedLead.whatsapp_number && selectedLead.whatsapp_number !== selectedLead.mobile) }); setShowEditDialog(true); }}
                        data-testid="edit-lead-btn"
                        title="Edit lead details"
                      >
                        <Pencil className="w-3 h-3 mr-1" /> Edit
                      </Button>
                    )}
                    <Badge variant="outline" className={`${statusBadgeClass(selectedLead.status)} flex-shrink-0`}>{selectedLead.status}</Badge>
                  </div>
                </div>
                <SheetTitle className="text-xl sm:text-2xl pr-2" style={{fontFamily: 'Sora'}}>{selectedLead.name}</SheetTitle>
                <SheetDescription>{selectedLead.course_interested}</SheetDescription>
              </SheetHeader>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
                <TabsList className="w-full grid grid-cols-2" data-testid="lead-detail-tabs">
                  <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
                  <TabsTrigger value="timeline" data-testid="tab-timeline">
                    <Activity className="w-3.5 h-3.5 mr-1.5" />
                    Timeline
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-6 mt-5">
                  {/* Contact Info */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Contact</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 text-sm">
                        <Phone className="w-4 h-4 text-slate-400" />
                        <a href={`tel:${selectedLead.mobile}`} className="text-slate-900 hover:underline">{selectedLead.mobile}</a>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">call</span>
                      </div>
                      {selectedLead.whatsapp_number && selectedLead.whatsapp_number !== selectedLead.mobile && (
                        <div className="flex items-center gap-3 text-sm" data-testid="lead-whatsapp-number">
                          <MessageSquare className="w-4 h-4 text-emerald-500" />
                          <a href={`https://wa.me/${selectedLead.whatsapp_number.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-slate-900 hover:underline">{selectedLead.whatsapp_number}</a>
                          <span className="text-[10px] uppercase tracking-wider text-emerald-600">whatsapp</span>
                        </div>
                      )}
                      {selectedLead.email && (
                        <div className="flex items-center gap-3 text-sm">
                          <Mail className="w-4 h-4 text-slate-400" />
                          <a href={`mailto:${selectedLead.email}`} className="text-slate-900 hover:underline">{selectedLead.email}</a>
                        </div>
                      )}
                      {(selectedLead.city || selectedLead.state) && (
                        <div className="flex items-center gap-3 text-sm">
                          <MapPin className="w-4 h-4 text-slate-400" />
                          <span className="text-slate-900">{[selectedLead.city, selectedLead.state].filter(Boolean).join(', ')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      className="flex-1 min-w-[120px] bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => {
                        const waNum = (selectedLead.whatsapp_number || selectedLead.mobile || '').replace(/\D/g, '');
                        window.open(`https://wa.me/${waNum}`, '_blank');
                      }}
                      data-testid="whatsapp-lead-btn"
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      WhatsApp
                    </Button>
                    <Button className="flex-1 min-w-[120px] bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setShowLogCallDialog(true)} data-testid="log-call-btn">
                      <Phone className="w-4 h-4 mr-2" />
                      Log Call
                    </Button>
                    <Button variant="outline" className="flex-1 min-w-[120px]" onClick={() => setShowFollowupDialog(true)} data-testid="add-followup-btn">
                      <Clock className="w-4 h-4 mr-2" />
                      Schedule
                    </Button>
                    <Button variant="outline" className="flex-1 min-w-[120px] border-violet-200 text-violet-700 hover:bg-violet-50" onClick={() => setShowDemoDialog(true)} data-testid="book-demo-btn">
                      <Video className="w-4 h-4 mr-2" />
                      Book Demo
                    </Button>
                  </div>

                  {/* Status Update */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Status</Label>
                    <Select value={selectedLead.status} onValueChange={(v) => handleStatusChange(selectedLead._id, v)}>
                      <SelectTrigger data-testid="lead-detail-status-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Assigned To + Transfer */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Assigned To</Label>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-slate-900 flex-1">
                        {users.find((u) => u._id === selectedLead.assigned_to)?.name || <span className="text-slate-400">Unassigned</span>}
                      </p>
                      {canTransfer && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowTransferDialog(true)}
                          data-testid="transfer-lead-btn"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />
                          Transfer
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Source */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">{t.lead} Source</p>
                    <p className="text-sm text-slate-900">{selectedLead.lead_source}</p>
                  </div>

                  {/* Temperature */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Temperature</Label>
                    <Select value={selectedLead.temperature || 'warm'} onValueChange={async (v) => {
                      try {
                        await axios.put(`${API}/leads/${selectedLead._id}`, { temperature: v });
                        setSelectedLead({ ...selectedLead, temperature: v });
                        setTimelineRefresh((r) => r + 1);
                        fetchLeads();
                        toast.success(`Marked as ${v}`);
                      } catch (e) {
                        toast.error('Failed to update temperature');
                      }
                    }}>
                      <SelectTrigger data-testid="lead-detail-temp-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TEMP_OPTIONS.map(opt => (
                          <SelectItem key={opt} value={opt} data-testid={`temp-option-${opt}`}>
                            {tempEmoji[opt]} {opt.charAt(0).toUpperCase() + opt.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Created */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Created</p>
                    <p className="text-sm text-slate-900">{new Date(selectedLead.created_at).toLocaleString()}</p>
                  </div>

                  {/* Delete */}
                  <div className="pt-4 border-t border-slate-200">
                    <Button variant="outline" className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => handleDelete(selectedLead._id)} data-testid="delete-lead-btn">
                      Delete {t.lead}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="timeline" className="mt-5">
                  <LeadTimeline leadId={selectedLead._id} refreshKey={timelineRefresh} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Transfer Lead Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer {t.lead}</DialogTitle>
            <DialogDescription>Reassign this {t.lead.toLowerCase()} to another team member. The new owner will be notified.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New owner *</Label>
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger data-testid="transfer-to-select"><SelectValue placeholder="Select team member" /></SelectTrigger>
                <SelectContent>
                  {users
                    .filter((u) => u._id !== selectedLead?.assigned_to)
                    .map((u) => (
                      <SelectItem key={u._id} value={u._id} data-testid={`transfer-option-${u._id}`}>
                        {u.name} <span className="text-slate-400">({u.role.replace('_', ' ')})</span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                rows={2}
                placeholder="Why are you transferring this lead?"
                data-testid="transfer-reason-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>Cancel</Button>
            <Button onClick={handleTransfer} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="submit-transfer-btn">
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Follow-up Dialog */}
      <Dialog open={showFollowupDialog} onOpenChange={setShowFollowupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Follow-up</DialogTitle>
            <DialogDescription>Schedule a follow-up for {selectedLead?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={followup.followup_date} onChange={(e) => setFollowup({...followup, followup_date: e.target.value})} data-testid="followup-date-input" />
              </div>
              <div className="space-y-2">
                <Label>Time *</Label>
                <Input type="time" value={followup.followup_time} onChange={(e) => setFollowup({...followup, followup_time: e.target.value})} data-testid="followup-time-input" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>What is this follow-up about? *</Label>
              <Textarea
                value={followup.remarks}
                onChange={(e) => setFollowup({...followup, remarks: e.target.value})}
                rows={3}
                placeholder="e.g. Discuss EMI options, share demo recording, confirm fee structure…"
                data-testid="followup-remarks-input"
              />
              <p className="text-[11px] text-slate-500">This is the plan for the call. The actual call outcome + voice recording is captured later when you mark the follow-up complete.</p>
            </div>
            <div className="space-y-2">
              <Label>Next Follow-up (optional)</Label>
              <Input type="date" value={followup.next_followup} onChange={(e) => setFollowup({...followup, next_followup: e.target.value})} data-testid="followup-next-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFollowupDialog(false)}>Cancel</Button>
            <Button onClick={handleAddFollowup} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="submit-followup-btn">Add Follow-up</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Book Demo Dialog */}
      <BookDemoDialog
        open={showDemoDialog}
        onOpenChange={setShowDemoDialog}
        lead={selectedLead}
        users={users}
        onBooked={() => {
          setTimelineRefresh((r) => r + 1);
        }}
      />

      {/* ============ LOG CALL DIALOG (call just happened — capture everything) ============ */}
      <Dialog open={showLogCallDialog} onOpenChange={setShowLogCallDialog}>
        <DialogContent className="max-w-lg max-h-[88vh] p-0 overflow-hidden flex flex-col gap-0" data-testid="log-call-dialog">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-100 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2"><Phone className="w-5 h-5 text-emerald-600" /> Log Call</DialogTitle>
            <DialogDescription>
              {selectedLead?.name && <>Capturing what just happened with <strong className="text-slate-900">{selectedLead.name}</strong> · </>}
              Upload voice + remarks + status. Schedule next follow-up if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label>What happened on the call? *</Label>
              <Textarea
                value={logCall.summary}
                onChange={(e) => setLogCall({ ...logCall, summary: e.target.value })}
                rows={3}
                placeholder="e.g. Lead picked up, said budget is tight. Wants EMI option. Will decide by Friday."
                maxLength={2000}
                data-testid="log-call-summary"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Voice recording (highly recommended)</Label>
              <VoiceRecorder value={logCall.voice} onChange={(v) => setLogCall({ ...logCall, voice: v })} />
              <p className="text-[11px] text-slate-500">Record your call summary or upload the WhatsApp voice note.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Update lead status (optional)</Label>
              <Select value={logCall.new_status} onValueChange={(v) => setLogCall({ ...logCall, new_status: v })}>
                <SelectTrigger data-testid="log-call-status"><SelectValue placeholder="Keep current status" /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="bg-slate-50 rounded-md p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={logCall.schedule_next}
                  onChange={(e) => setLogCall({ ...logCall, schedule_next: e.target.checked })}
                  data-testid="log-call-schedule-next-toggle"
                />
                <span className="text-sm font-medium text-slate-800">Schedule next follow-up</span>
              </label>
              {logCall.schedule_next && (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Date *</Label>
                      <Input type="date" value={logCall.next_date} onChange={(e) => setLogCall({ ...logCall, next_date: e.target.value })} data-testid="log-call-next-date" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Time</Label>
                      <Input type="time" value={logCall.next_time} onChange={(e) => setLogCall({ ...logCall, next_time: e.target.value })} data-testid="log-call-next-time" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">What to discuss next (optional)</Label>
                    <Input value={logCall.next_remarks} onChange={(e) => setLogCall({ ...logCall, next_remarks: e.target.value })} placeholder="e.g. Share fee structure + EMI details" data-testid="log-call-next-remarks" />
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
            <Button variant="outline" onClick={() => setShowLogCallDialog(false)}>Cancel</Button>
            <Button
              onClick={handleLogCall}
              disabled={!logCall.summary.trim() || (logCall.schedule_next && !logCall.next_date)}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white"
              data-testid="submit-log-call-btn"
            >
              Log Call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ EDIT LEAD DIALOG (admin / org_admin / manager) ============ */}
      <Dialog open={showEditDialog} onOpenChange={(o) => { if (!o) { setShowEditDialog(false); setEditLead(null); } }}>
        <DialogContent className="max-w-2xl max-h-[88vh] p-0 overflow-hidden flex flex-col gap-0" data-testid="edit-lead-dialog">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-100 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5 text-violet-600" /> Edit Lead</DialogTitle>
            <DialogDescription>
              {editLead?.lead_id && <span className="font-mono text-xs mr-2">{editLead.lead_id}</span>}
              Update contact, source, status or remarks. Changes log in the timeline.
            </DialogDescription>
          </DialogHeader>
          {editLead && (
            <div className="overflow-y-auto flex-1 px-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input value={editLead.name || ''} onChange={(e) => setEditLead({ ...editLead, name: e.target.value })} data-testid="edit-name-input" />
                </div>
                <div className="space-y-2">
                  <Label>Mobile (Call) *</Label>
                  <Input value={editLead.mobile || ''} onChange={(e) => setEditLead({ ...editLead, mobile: e.target.value })} placeholder="+91 9830XXXXXX" data-testid="edit-mobile-input" />
                </div>
                <div className="space-y-2 col-span-1 sm:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 select-none">
                    <input
                      type="checkbox"
                      checked={!!editLead.wa_different}
                      onChange={(e) => setEditLead({ ...editLead, wa_different: e.target.checked, whatsapp_number: e.target.checked ? (editLead.whatsapp_number || '') : '' })}
                      data-testid="edit-wa-different-toggle"
                    />
                    <span>WhatsApp number is different from calling number</span>
                  </label>
                  {editLead.wa_different && (
                    <Input value={editLead.whatsapp_number || ''} onChange={(e) => setEditLead({ ...editLead, whatsapp_number: e.target.value })} placeholder="+91 9830XXXXXX" data-testid="edit-whatsapp-input" />
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={editLead.email || ''} onChange={(e) => setEditLead({ ...editLead, email: e.target.value })} placeholder="lead@example.com" data-testid="edit-email-input" />
                </div>
                <div className="space-y-2">
                  <Label>{t.serviceLabel || 'Course Interested'} *</Label>
                  <Input value={editLead.course_interested || ''} onChange={(e) => setEditLead({ ...editLead, course_interested: e.target.value })} data-testid="edit-course-input" />
                </div>
                {showCompanyCol && (
                  <>
                    <div className="space-y-2">
                      <Label>Company Name</Label>
                      <Input
                        value={editLead.company_name || ''}
                        onChange={(e) => setEditLead({ ...editLead, company_name: e.target.value })}
                        placeholder="e.g. Acme Tech Pvt Ltd"
                        data-testid="edit-company-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Designation</Label>
                      <Input
                        value={editLead.designation || ''}
                        onChange={(e) => setEditLead({ ...editLead, designation: e.target.value })}
                        placeholder="e.g. CEO, CTO, VP Sales"
                        data-testid="edit-designation-input"
                      />
                    </div>
                  </>
                )}
                {user?.industry === 'admission_consultancy' && (
                  <>
                    <div className="space-y-2">
                      <Label>Target College</Label>
                      <Input
                        value={editLead.target_college || ''}
                        onChange={(e) => setEditLead({ ...editLead, target_college: e.target.value })}
                        placeholder="e.g. IIM Bangalore"
                        data-testid="edit-target-college-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Course Fee (₹)</Label>
                      <Input
                        type="number"
                        value={editLead.course_fee ?? ''}
                        onChange={(e) => setEditLead({ ...editLead, course_fee: e.target.value })}
                        placeholder="e.g. 250000"
                        data-testid="edit-course-fee-input"
                      />
                    </div>
                  </>
                )}
                {['real_estate', 'travel'].includes(user?.industry) && (
                  <div className="space-y-2">
                    <Label>Budget Range</Label>
                    <Input
                      value={editLead.budget_range || ''}
                      onChange={(e) => setEditLead({ ...editLead, budget_range: e.target.value })}
                      placeholder="e.g. ₹50L - ₹1Cr"
                      data-testid="edit-budget-input"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input value={editLead.state || ''} onChange={(e) => setEditLead({ ...editLead, state: e.target.value })} data-testid="edit-state-input" />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={editLead.city || ''} onChange={(e) => setEditLead({ ...editLead, city: e.target.value })} data-testid="edit-city-input" />
                </div>
                <div className="space-y-2">
                  <Label>Lead Source</Label>
                  <Select value={editLead.lead_source || ''} onValueChange={(v) => setEditLead({ ...editLead, lead_source: v })}>
                    <SelectTrigger data-testid="edit-source-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Manual Add', 'Website', 'Facebook Ad', 'Google Ad', 'Instagram', 'Referral', 'CSV Import', 'Walk-in', 'WhatsApp', 'Other'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={editLead.status || ''} onValueChange={(v) => setEditLead({ ...editLead, status: v })}>
                    <SelectTrigger data-testid="edit-status-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Temperature</Label>
                  <Select value={editLead.temperature || 'warm'} onValueChange={(v) => setEditLead({ ...editLead, temperature: v })}>
                    <SelectTrigger data-testid="edit-temperature-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hot">🔥 Hot</SelectItem>
                      <SelectItem value="warm">☀️ Warm</SelectItem>
                      <SelectItem value="cold">❄️ Cold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-1 sm:col-span-2">
                  <Label>Remarks</Label>
                  <Textarea value={editLead.remarks || ''} onChange={(e) => setEditLead({ ...editLead, remarks: e.target.value })} rows={2} placeholder="Any notes about this lead…" data-testid="edit-remarks-input" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditLead(null); }} data-testid="cancel-edit-btn">Cancel</Button>
            <Button
              onClick={handleSaveEdit}
              disabled={!editLead?.name?.trim() || !editLead?.mobile?.trim()}
              className="bg-violet-700 hover:bg-violet-800 disabled:bg-slate-300 text-white"
              data-testid="save-edit-btn"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
