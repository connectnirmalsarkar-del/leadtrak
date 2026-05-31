import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import { useTerminology } from '@/lib/terminology';
import { Plus, Search, Filter, MoreHorizontal, Phone, Mail, MapPin, MessageSquare, Upload, Download, ArrowRightLeft, AlertCircle, Clock, Activity, Video } from 'lucide-react';
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

const STATUS_OPTIONS = ['New', 'Contacted', 'Interested', 'Follow-up', 'Admission Done', 'Not Interested', 'Lost'];
const SOURCES = ['Facebook Ads', 'Website', 'Google Ads', 'Referral', 'Walk-in', 'Telecalling'];

const TEMP_OPTIONS = ['hot', 'warm', 'cold'];
const tempBadgeClass = (t) => {
  const k = (t || 'warm').toLowerCase();
  if (k === 'hot') return 'bg-red-100 text-red-700 border-red-200';
  if (k === 'cold') return 'bg-sky-100 text-sky-700 border-sky-200';
  return 'bg-amber-100 text-amber-700 border-amber-200';
};
const tempEmoji = { hot: '🔥', warm: '☀️', cold: '❄️' };

const statusBadgeClass = (status) => {
  const map = {
    'New': 'status-new',
    'Contacted': 'status-contacted',
    'Interested': 'status-interested',
    'Follow-up': 'status-followup',
    'Admission Done': 'status-admission',
    'Not Interested': 'status-notinterested',
    'Lost': 'status-lost',
  };
  return map[status] || 'status-new';
};

export default function LeadsPage() {
  const t = useTerminology();
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [services, setServices] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showFollowupDialog, setShowFollowupDialog] = useState(false);
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
    name: '', mobile: '', email: '', course_interested: '', state: '', city: '',
    lead_source: 'Website', assigned_to: '', status: 'New', temperature: 'warm'
  });

  const [followup, setFollowup] = useState({
    followup_date: '', followup_time: '', remarks: '', next_followup: '',
    voice: null,
  });

  useEffect(() => {
    fetchLeads();
    fetchUsers();
    fetchServices();
  }, [filterStatus, search]);

  const fetchLeads = async () => {
    try {
      const params = {};
      if (filterStatus !== 'all') params.status = filterStatus;
      if (search) params.search = search;
      const { data } = await axios.get(`${API}/leads`, { params });
      setLeads(data);
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
    try {
      await axios.post(`${API}/leads`, newLead);
      toast.success('Lead added successfully');
      setShowAddDialog(false);
      setDuplicate(null);
      setNewLead({
        name: '', mobile: '', email: '', course_interested: '', state: '', city: '',
        lead_source: 'Website', assigned_to: '', status: 'New', temperature: 'warm'
      });
      fetchLeads();
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 409 && detail && typeof detail === 'object') {
        // Duplicate — show inline
        setDuplicate(detail);
        toast.error(detail.message || 'Duplicate lead');
      } else {
        toast.error(typeof detail === 'string' ? detail : 'Failed to add lead');
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
          <p className="text-sm text-slate-600 mt-1">{leads.length} {leads.length === 1 ? t.lead.toLowerCase() : t.leads.toLowerCase()} total</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadSample} data-testid="download-csv-sample-btn">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Sample CSV
          </Button>
          <label htmlFor="csv-upload" className="cursor-pointer">
            <div className="inline-flex items-center gap-1.5 h-10 px-3 border border-slate-300 hover:bg-slate-50 rounded-md text-sm font-medium text-slate-700">
              <Upload className="w-4 h-4" />
              Import CSV
            </div>
            <input id="csv-upload" type="file" accept=".csv" onChange={handleCSVImport} className="hidden" data-testid="csv-import-input" />
          </label>
          <Button variant="outline" onClick={handleExcelExport} data-testid="export-excel-leads-btn">
            <Download className="w-4 h-4 mr-1.5" />
            Excel
          </Button>

          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="add-lead-btn">
                <Plus className="w-4 h-4 mr-2" />
                Add {t.lead}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
              <DialogTitle>Add New {t.lead}</DialogTitle>
              <DialogDescription>Capture a new prospect into your pipeline</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input value={newLead.name} onChange={(e) => setNewLead({...newLead, name: e.target.value})} data-testid="lead-name-input" />
              </div>
              <div className="space-y-2">
                <Label>Mobile *</Label>
                <Input
                  value={newLead.mobile}
                  onChange={(e) => setNewLead({...newLead, mobile: e.target.value})}
                  onBlur={checkForDuplicate}
                  data-testid="lead-mobile-input"
                />
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
              <div className="space-y-2">
                <Label>State</Label>
                <Input value={newLead.state} onChange={(e) => setNewLead({...newLead, state: e.target.value})} data-testid="lead-state-input" />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={newLead.city} onChange={(e) => setNewLead({...newLead, city: e.target.value})} data-testid="lead-city-input" />
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowAddDialog(false); setDuplicate(null); }} data-testid="cancel-add-lead-btn">Cancel</Button>
              <Button
                onClick={handleAddLead}
                disabled={!!duplicate}
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
            placeholder="Search by name, mobile, or email..."
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
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">{t.lead} ID</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Name</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">{t.offering}</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Source</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Temp</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Status</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-slate-500">
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
                  <TableCell className="text-sm text-slate-600">{lead.lead_source}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={tempBadgeClass(lead.temperature)} data-testid={`temp-badge-${lead._id}`}>
                      {tempEmoji[(lead.temperature || 'warm').toLowerCase()]} {(lead.temperature || 'warm')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusBadgeClass(lead.status)}>{lead.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Lead Detail Drawer */}
      {/* Lead Detail Drawer */}
      <Sheet open={!!selectedLead} onOpenChange={(o) => { if (!o) { setSelectedLead(null); setActiveTab('details'); } }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto" data-testid="lead-detail-drawer">
          {selectedLead && (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-slate-500">{selectedLead.lead_id}</span>
                  <Badge variant="outline" className={statusBadgeClass(selectedLead.status)}>{selectedLead.status}</Badge>
                </div>
                <SheetTitle className="text-2xl" style={{fontFamily: 'Sora'}}>{selectedLead.name}</SheetTitle>
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
                      </div>
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
                      onClick={() => window.open(`https://wa.me/${selectedLead.mobile.replace(/\D/g, '')}`, '_blank')}
                      data-testid="whatsapp-lead-btn"
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      WhatsApp
                    </Button>
                    <Button variant="outline" className="flex-1 min-w-[120px]" onClick={() => setShowFollowupDialog(true)} data-testid="add-followup-btn">
                      <Clock className="w-4 h-4 mr-2" />
                      Follow-up
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
              <Label>Remarks *</Label>
              <Textarea value={followup.remarks} onChange={(e) => setFollowup({...followup, remarks: e.target.value})} rows={3} data-testid="followup-remarks-input" />
            </div>
            {canRecordVoice && (
              <div className="space-y-2">
                <Label>Voice note (optional)</Label>
                <VoiceRecorder
                  value={followup.voice}
                  onChange={(v) => setFollowup({ ...followup, voice: v })}
                />
              </div>
            )}
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
    </div>
  );
}
