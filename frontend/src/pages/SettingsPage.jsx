import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import {
  Building2,
  Plus,
  Trash2,
  Upload,
  ImageIcon,
  MapPin,
  FileText,
  Phone,
  Mail,
  Globe,
  Layers,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Save,
  ListChecks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

const GST_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const [organization, setOrganization] = useState({
    name: '', logo_url: '', address: '', gst_number: '', phone: '', email: '', website: '',
  });
  const [sources, setSources] = useState([]);
  const [newSource, setNewSource] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);

  // Lead Statuses customization
  const [statusList, setStatusList] = useState([]);
  const [statusMeta, setStatusMeta] = useState({ industry: '', industry_defaults: [], is_custom: false });
  const [newStatus, setNewStatus] = useState('');
  const [savingStatuses, setSavingStatuses] = useState(false);

  const canManage = user && ['super_admin', 'org_admin'].includes(user.role);

  useEffect(() => {
    fetchOrg();
    fetchSources();
    fetchLeadStatuses();
  }, []);

  const fetchOrg = async () => {
    try {
      const { data } = await axios.get(`${API}/organization`);
      setOrganization({
        name: data.name || '',
        logo_url: data.logo_url || '',
        address: data.address || '',
        gst_number: data.gst_number || '',
        phone: data.phone || '',
        email: data.email || '',
        website: data.website || '',
      });
    } catch (e) {
      // silent
    }
  };

  const fetchSources = async () => {
    try {
      const { data } = await axios.get(`${API}/lead-sources`);
      setSources(data);
    } catch (e) {
      // silent
    }
  };

  const handleSaveCompany = async () => {
    // Validate GST client-side first
    const gst = (organization.gst_number || '').trim().toUpperCase();
    if (gst && !GST_PATTERN.test(gst)) {
      toast.error('Invalid GST format. Expected: 27ABCDE1234F1Z5');
      return;
    }
    setSavingCompany(true);
    try {
      const payload = { ...organization };
      if (gst) payload.gst_number = gst;
      else delete payload.gst_number;
      // Don't send empty strings on optional fields → keep DB clean
      Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k]; });
      await axios.put(`${API}/organization`, payload);
      toast.success('Company profile updated');
      // Refresh auth user so topbar updates immediately
      try {
        const { data } = await axios.get(`${API}/auth/me`);
        setUser && setUser(data);
      } catch (e) { /* ignore */ }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally {
      setSavingCompany(false);
    }
  };

  const handleLogoChoose = () => logoInputRef.current?.click();

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      toast.error('Logo too large. Max 500 KB allowed.');
      e.target.value = '';
      return;
    }
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await axios.post(`${API}/uploads/org-logo`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setOrganization((o) => ({ ...o, logo_url: data.logo_url }));
      toast.success('Logo uploaded');
      // Refresh auth user
      try {
        const { data: me } = await axios.get(`${API}/auth/me`);
        setUser && setUser(me);
      } catch (err) { /* ignore */ }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleAddSource = async () => {
    if (!newSource.trim()) return;
    try {
      await axios.post(`${API}/lead-sources`, { name: newSource });
      toast.success('Source added');
      setNewSource('');
      fetchSources();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to add source');
    }
  };

  // -------- Lead Statuses customization --------
  const fetchLeadStatuses = async () => {
    try {
      const { data } = await axios.get(`${API}/organization/lead-statuses`);
      setStatusList(data.effective || []);
      setStatusMeta({
        industry: data.industry,
        industry_defaults: data.industry_defaults || [],
        is_custom: !!data.is_custom,
      });
    } catch (e) {
      // silent
    }
  };

  const refreshUserStatuses = async () => {
    try {
      const { data: me } = await axios.get(`${API}/auth/me`);
      setUser && setUser(me);
    } catch (err) { /* ignore */ }
  };

  const handleAddStatus = () => {
    const v = newStatus.trim();
    if (!v) return;
    if (statusList.includes(v)) {
      toast.error('That status is already in the list');
      return;
    }
    if (v.length > 64) {
      toast.error('Status name too long (max 64 characters)');
      return;
    }
    setStatusList([...statusList, v]);
    setNewStatus('');
  };

  const handleRemoveStatus = (idx) => {
    setStatusList(statusList.filter((_, i) => i !== idx));
  };

  const handleMoveStatus = (idx, dir) => {
    const next = [...statusList];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setStatusList(next);
  };

  const handleSaveStatuses = async () => {
    if (statusList.length === 0) {
      toast.error('You need at least one status. Use "Reset to defaults" instead.');
      return;
    }
    setSavingStatuses(true);
    try {
      await axios.put(`${API}/organization/lead-statuses`, { statuses: statusList });
      toast.success('Lead statuses saved');
      await fetchLeadStatuses();
      await refreshUserStatuses();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save statuses');
    } finally {
      setSavingStatuses(false);
    }
  };

  const handleResetStatuses = async () => {
    if (!window.confirm('Reset to industry-default statuses? Your custom changes will be removed.')) return;
    setSavingStatuses(true);
    try {
      await axios.post(`${API}/organization/lead-statuses/reset`);
      toast.success('Reset to industry defaults');
      await fetchLeadStatuses();
      await refreshUserStatuses();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to reset');
    } finally {
      setSavingStatuses(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl" data-testid="settings-page">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Configuration</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>Settings</h1>
        <p className="text-sm text-slate-600 mt-1">Manage your company profile, lead sources, and integrations.</p>
      </div>

      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-violet-900">Onboarding Guide</p>
          <p className="text-xs text-violet-700 mt-0.5">Re-run the 5-step setup wizard to revisit any skipped step.</p>
        </div>
        <button
          onClick={async () => {
            try {
              await axios.post(`${API}/onboarding/reset`);
              toast.success('Setup guide re-enabled — reload the page to see it.');
            } catch (e) { toast.error('Failed'); }
          }}
          className="text-sm font-semibold text-violet-700 hover:text-violet-900 px-3 py-1.5 rounded-md hover:bg-violet-100 transition-colors"
          data-testid="reopen-onboarding-btn"
        >
          Re-show wizard →
        </button>
      </div>

      <Tabs defaultValue="company">
        <TabsList className="bg-slate-100 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="company" data-testid="tab-company" className="text-xs sm:text-sm"><Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" /><span className="hidden xs:inline sm:inline">Company Profile</span><span className="xs:hidden sm:hidden">Profile</span></TabsTrigger>
          <TabsTrigger value="sources" data-testid="tab-sources" className="text-xs sm:text-sm">Lead Sources</TabsTrigger>
          <TabsTrigger value="lead-statuses" data-testid="tab-lead-statuses" className="text-xs sm:text-sm"><ListChecks className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />Lead Statuses</TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-integrations" asChild>
            <Link to="/integrations" className="flex items-center text-xs sm:text-sm"><Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />Integrations →</Link>
          </TabsTrigger>
        </TabsList>

        {/* Company Profile */}
        <TabsContent value="company" className="space-y-4 mt-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-1" style={{ fontFamily: 'Sora' }}>Brand & Identity</h3>
            <p className="text-xs text-slate-500 mb-5">Your logo appears in the topbar and on future invoices and lead-capture forms.</p>

            <div className="flex flex-col sm:flex-row items-start gap-6 pb-6 border-b border-slate-100">
              <div className="w-32 h-32 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden" data-testid="logo-preview">
                {organization.logo_url ? (
                  <img src={organization.logo_url} alt="Logo" className="max-w-full max-h-full object-contain" />
                ) : (
                  <ImageIcon className="w-8 h-8 text-slate-300" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Label>Company logo</Label>
                <p className="text-xs text-slate-500">PNG / JPG / WEBP / SVG · max 500 KB · any aspect ratio</p>
                <div className="flex gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/svg+xml"
                    onChange={handleLogoUpload}
                    className="hidden"
                    data-testid="org-logo-file-input"
                  />
                  <Button
                    onClick={handleLogoChoose}
                    disabled={uploadingLogo || !canManage}
                    variant="outline"
                    data-testid="upload-logo-btn"
                  >
                    <Upload className="w-4 h-4 mr-1.5" />
                    {uploadingLogo ? 'Uploading…' : (organization.logo_url ? 'Replace logo' : 'Upload logo')}
                  </Button>
                  {organization.logo_url && canManage && (
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => setOrganization((o) => ({ ...o, logo_url: '' }))}
                      data-testid="remove-logo-btn"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-6 space-y-4">
              <h4 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Company details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label><Building2 className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />Company name *</Label>
                  <Input
                    value={organization.name}
                    onChange={(e) => setOrganization({ ...organization, name: e.target.value })}
                    placeholder="Bright Future Coaching Pvt. Ltd."
                    disabled={!canManage}
                    data-testid="org-name-input"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label><MapPin className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />Registered address</Label>
                  <Textarea
                    value={organization.address}
                    onChange={(e) => setOrganization({ ...organization, address: e.target.value })}
                    rows={3}
                    placeholder={"42 MG Road, Sector 18\nGurgaon, Haryana 122001\nIndia"}
                    disabled={!canManage}
                    data-testid="org-address-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label><FileText className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />GST number</Label>
                  <Input
                    value={organization.gst_number}
                    onChange={(e) => setOrganization({ ...organization, gst_number: e.target.value.toUpperCase() })}
                    placeholder="27ABCDE1234F1Z5"
                    maxLength={15}
                    disabled={!canManage}
                    className="font-mono"
                    data-testid="org-gst-input"
                  />
                  <p className="text-[11px] text-slate-500">Format: 2-digit state + 10-char PAN + 1 entity + Z + 1 check</p>
                </div>
                <div className="space-y-2">
                  <Label><Phone className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />Phone</Label>
                  <Input
                    value={organization.phone}
                    onChange={(e) => setOrganization({ ...organization, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    disabled={!canManage}
                    data-testid="org-phone-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label><Mail className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />Email</Label>
                  <Input
                    type="email"
                    value={organization.email}
                    onChange={(e) => setOrganization({ ...organization, email: e.target.value })}
                    placeholder="contact@brightfuture.com"
                    disabled={!canManage}
                    data-testid="org-email-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label><Globe className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />Website</Label>
                  <Input
                    value={organization.website}
                    onChange={(e) => setOrganization({ ...organization, website: e.target.value })}
                    placeholder="https://brightfuture.com"
                    disabled={!canManage}
                    data-testid="org-website-input"
                  />
                </div>
              </div>
              {canManage && (
                <div className="pt-2 flex justify-end">
                  <Button
                    onClick={handleSaveCompany}
                    disabled={savingCompany}
                    className="bg-violet-700 hover:bg-violet-800 text-white"
                    data-testid="save-company-btn"
                  >
                    {savingCompany ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Lead Sources */}
        <TabsContent value="sources" className="space-y-4 mt-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-1" style={{ fontFamily: 'Sora' }}>Lead Sources</h3>
            <p className="text-xs text-slate-500 mb-5">These appear in the "Lead Source" dropdown when adding new leads.</p>
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="Add a new source (e.g. LinkedIn Ads)"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSource()}
                disabled={!canManage}
                data-testid="new-source-input"
              />
              <Button onClick={handleAddSource} disabled={!canManage} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="add-source-btn">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {sources.length === 0 ? (
                <p className="text-sm text-slate-500 col-span-3">No sources yet.</p>
              ) : (
                sources.map((s) => (
                  <div key={s._id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-md border border-slate-200">
                    <span className="text-sm text-slate-900 flex-1 truncate">{s.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>

        {/* Lead Statuses */}
        <TabsContent value="lead-statuses" className="space-y-4 mt-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6" data-testid="lead-statuses-card">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 mb-1" style={{ fontFamily: 'Sora' }}>Lead Statuses</h3>
                <p className="text-xs text-slate-500">
                  The single list used everywhere a lead status appears — Lead form, Call Log, Follow-up completion, Demo outcome.
                  Industry: <span className="font-medium text-slate-700">{statusMeta.industry || '—'}</span>
                  {statusMeta.is_custom ? (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px] font-semibold uppercase tracking-wide" data-testid="lead-statuses-custom-badge">Custom</span>
                  ) : (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold uppercase tracking-wide" data-testid="lead-statuses-default-badge">Industry Default</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetStatuses}
                  disabled={!canManage || savingStatuses || !statusMeta.is_custom}
                  data-testid="reset-statuses-btn"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Reset to defaults
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveStatuses}
                  disabled={!canManage || savingStatuses}
                  className="bg-violet-700 hover:bg-violet-800 text-white"
                  data-testid="save-statuses-btn"
                >
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {savingStatuses ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>

            {/* Add new status */}
            <div className="flex gap-2 mb-5">
              <Input
                placeholder='Add a new status (e.g. "Document Verification")'
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddStatus()}
                disabled={!canManage}
                maxLength={64}
                data-testid="new-status-input"
              />
              <Button
                onClick={handleAddStatus}
                disabled={!canManage || !newStatus.trim()}
                className="bg-violet-700 hover:bg-violet-800 text-white"
                data-testid="add-status-btn"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Status list with reorder + remove */}
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100" data-testid="status-list">
              {statusList.length === 0 ? (
                <p className="text-sm text-slate-500 p-4 text-center">No statuses configured.</p>
              ) : (
                statusList.map((s, idx) => (
                  <div
                    key={`${s}-${idx}`}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50"
                    data-testid={`status-row-${idx}`}
                  >
                    <span className="text-xs font-mono text-slate-400 w-6 text-right">{idx + 1}.</span>
                    <span className="text-sm text-slate-900 flex-1" data-testid={`status-label-${idx}`}>{s}</span>
                    <button
                      type="button"
                      onClick={() => handleMoveStatus(idx, -1)}
                      disabled={!canManage || idx === 0}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                      data-testid={`status-up-${idx}`}
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveStatus(idx, 1)}
                      disabled={!canManage || idx === statusList.length - 1}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                      data-testid={`status-down-${idx}`}
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveStatus(idx)}
                      disabled={!canManage}
                      className="p-1 text-rose-500 hover:text-rose-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Remove"
                      data-testid={`status-remove-${idx}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600">
              <p className="font-semibold text-slate-700 mb-1">How it works</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>This list appears in every status dropdown across the app.</li>
                <li>Reorder with the arrows — the order is how it shows up everywhere.</li>
                <li>You can't remove a status that's currently in use by an existing lead. Move those leads first.</li>
                <li>Reset reverts to the {statusMeta.industry || 'industry'} default list (only enabled when custom).</li>
              </ul>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
