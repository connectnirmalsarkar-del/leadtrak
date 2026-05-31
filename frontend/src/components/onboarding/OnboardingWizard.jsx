import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, CheckCircle2, ArrowRight, X, Loader2, Plus, Tag, Users, Webhook, UserPlus, Globe, Facebook, Activity,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const STEPS = [
  { key: 'welcome', label: 'Welcome', icon: Sparkles },
  { key: 'services', label: 'Add Services', icon: Tag },
  { key: 'team', label: 'Invite Team', icon: Users },
  { key: 'lead_source', label: 'Lead Source', icon: Webhook },
  { key: 'first_lead', label: 'First Lead', icon: UserPlus },
];

const ROLES = [
  { value: 'manager', label: 'Manager' },
  { value: 'counselor', label: 'Counselor' },
  { value: 'telecaller', label: 'Telecaller' },
];

export default function OnboardingWizard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  // Step form states
  const [service, setService] = useState({ name: '', base_price: '', min_price: '' });
  const [member, setMember] = useState({ name: '', email: '', mobile: '', role: 'counselor' });
  const [lead, setLead] = useState({ name: '', mobile: '', email: '' });

  useEffect(() => {
    if (!user || !['org_admin', 'super_admin'].includes(user.role)) return;
    // Don't show for super admin viewing their own org
    if (user.role === 'super_admin') return;
    axios.get(`${API}/onboarding/state`)
      .then(({ data }) => {
        setState(data);
        if (!data.completed && !data.skipped) setOpen(true);
      })
      .catch(() => {});
  }, [user]);

  const refresh = async () => {
    const { data } = await axios.get(`${API}/onboarding/state`);
    setState(data);
    if (data.completed) {
      toast.success('🎉 Onboarding complete! You\'re all set up.');
      setOpen(false);
    }
  };

  const advanceTo = async (key) => {
    try {
      await axios.post(`${API}/onboarding/advance`, { step: key });
      await refresh();
    } catch (e) { toast.error('Failed to save progress'); }
  };

  const skipAll = async () => {
    if (!window.confirm('Skip the setup guide? You can revisit it anytime from Settings.')) return;
    try {
      await axios.post(`${API}/onboarding/skip`);
      toast.message('Setup guide dismissed');
      setOpen(false);
    } catch (e) { toast.error('Failed'); }
  };

  const currentStepKey = useMemo(() => {
    if (!state) return null;
    return state.all_steps[state.step_index] || null;
  }, [state]);

  const stepIndex = state?.step_index ?? 0;
  const totalSteps = STEPS.length;
  const progressPct = Math.round((stepIndex / totalSteps) * 100);

  // Welcome step
  const handleWelcome = () => advanceTo('welcome');

  // Services step
  const handleAddService = async () => {
    if (!service.name.trim() || !service.base_price) {
      toast.error('Service name and base price are required');
      return;
    }
    setBusy(true);
    try {
      await axios.post(`${API}/services`, {
        name: service.name.trim(),
        base_price: parseFloat(service.base_price),
        min_price: parseFloat(service.min_price || service.base_price),
        category: 'General',
      });
      toast.success(`${service.name} added`);
      setService({ name: '', base_price: '', min_price: '' });
      await advanceTo('services');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to add service');
    } finally { setBusy(false); }
  };

  // Team step
  const handleInviteMember = async () => {
    if (!member.name.trim() || !member.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    setBusy(true);
    try {
      await axios.post(`${API}/users`, {
        name: member.name.trim(),
        email: member.email.trim(),
        mobile: member.mobile.trim() || '0000000000',
        role: member.role,
        password: 'Welcome@123',
      });
      toast.success(`${member.name} invited! Temporary password: Welcome@123`);
      setMember({ name: '', email: '', mobile: '', role: 'counselor' });
      await advanceTo('team');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to invite');
    } finally { setBusy(false); }
  };

  // Lead source step — user just acknowledges, then navigates
  const handlePickSource = async (where) => {
    await advanceTo('lead_source');
    setOpen(false);
    setTimeout(() => navigate(where), 200);
  };

  // First lead step
  const handleAddLead = async () => {
    if (!lead.name.trim() || !lead.mobile.trim()) {
      toast.error('Name and mobile are required');
      return;
    }
    setBusy(true);
    try {
      await axios.post(`${API}/leads`, {
        name: lead.name.trim(),
        mobile: lead.mobile.trim(),
        email: lead.email.trim() || null,
        course_interested: 'General Inquiry',
        lead_source: 'Manual Entry',
        status: 'New',
        temperature: 'warm',
      });
      toast.success(`${lead.name} added as your first lead!`);
      setLead({ name: '', mobile: '', email: '' });
      await advanceTo('first_lead');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to add lead');
    } finally { setBusy(false); }
  };

  if (!state || state.completed || state.skipped) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden" data-testid="onboarding-wizard">
        {/* Header */}
        <div className="relative px-7 pt-7 pb-5 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600 text-white">
          <button onClick={skipAll} className="absolute top-4 right-4 text-white/80 hover:text-white" data-testid="onboarding-skip-btn">
            <X className="w-5 h-5" />
          </button>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-[10px] font-bold tracking-[0.15em] uppercase mb-3">
            <Sparkles className="w-3 h-3" /> Setup Guide · Step {Math.min(stepIndex + 1, totalSteps)} of {totalSteps}
          </div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Sora' }} data-testid="onboarding-headline">
            {currentStepKey === 'welcome' && `Welcome to Leadtrak, ${user?.name?.split(' ')[0] || 'there'}!`}
            {currentStepKey === 'services' && 'Add your services'}
            {currentStepKey === 'team' && 'Invite your team'}
            {currentStepKey === 'lead_source' && 'Connect a lead source'}
            {currentStepKey === 'first_lead' && 'Add your first lead'}
            {!currentStepKey && 'You\'re all set!'}
          </h2>
          <p className="text-sm text-white/85 mt-1 max-w-lg">
            {currentStepKey === 'welcome' && `We've detected your industry as `}
            {currentStepKey === 'welcome' && <strong className="capitalize">{state.industry?.replace('_', ' ') || 'generic'}</strong>}
            {currentStepKey === 'welcome' && `. Let's get your workspace ready in under 2 minutes.`}
            {currentStepKey === 'services' && 'These will appear in your lead capture forms and admission dialog.'}
            {currentStepKey === 'team' && 'Invite at least one team member. They\'ll receive login credentials.'}
            {currentStepKey === 'lead_source' && 'Pick how you want leads to flow into your CRM.'}
            {currentStepKey === 'first_lead' && 'Add a sample lead to test your follow-up flow.'}
          </p>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mt-5">
            {STEPS.map((s, i) => {
              const done = state.completed_steps.includes(s.key);
              const active = i === stepIndex;
              return (
                <div
                  key={s.key}
                  className={`h-1.5 rounded-full transition-all duration-300 ${active ? 'w-12 bg-white' : done ? 'w-6 bg-white/80' : 'w-6 bg-white/25'}`}
                />
              );
            })}
            <span className="ml-2 text-[11px] text-white/85 font-mono">{progressPct}%</span>
          </div>
        </div>

        {/* Body */}
        <div className="px-7 py-6 max-h-[60vh] overflow-y-auto">
          {/* Step: Welcome */}
          {currentStepKey === 'welcome' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: Tag, label: 'Service Catalog', desc: 'Define what you sell' },
                  { icon: Users, label: 'Team Members', desc: 'Distribute leads' },
                  { icon: Activity, label: 'Lead Sources', desc: 'Multi-channel inbox' },
                ].map((c) => {
                  const Icon = c.icon;
                  return (
                    <div key={c.label} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <Icon className="w-5 h-5 text-violet-700 mb-2" />
                      <p className="text-sm font-bold text-slate-900">{c.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{c.desc}</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-sm text-slate-600">
                We'll walk through 4 quick steps. Each one takes under 30 seconds. Ready?
              </p>
            </div>
          )}

          {/* Step: Services */}
          {currentStepKey === 'services' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label>Service / Course Name *</Label>
                  <Input
                    value={service.name}
                    onChange={(e) => setService({ ...service, name: e.target.value })}
                    placeholder="e.g. MBA Full-time, 2 BHK Apartment, Annual Membership"
                    data-testid="onboarding-service-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Base Price (₹) *</Label>
                  <Input
                    type="number"
                    value={service.base_price}
                    onChange={(e) => setService({ ...service, base_price: e.target.value, min_price: service.min_price || e.target.value })}
                    placeholder="100000"
                    data-testid="onboarding-service-price"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Floor Price (₹)</Label>
                  <Input
                    type="number"
                    value={service.min_price}
                    onChange={(e) => setService({ ...service, min_price: e.target.value })}
                    placeholder="Minimum sale price"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Tip: You can add more services anytime from the Services & Pricing page.
              </p>
            </div>
          )}

          {/* Step: Team */}
          {currentStepKey === 'team' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Full Name *</Label>
                  <Input value={member.name} onChange={(e) => setMember({ ...member, name: e.target.value })} placeholder="Priya Sharma" data-testid="onboarding-member-name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={member.role} onValueChange={(v) => setMember({ ...member, role: v })}>
                    <SelectTrigger data-testid="onboarding-member-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Email *</Label>
                  <Input type="email" value={member.email} onChange={(e) => setMember({ ...member, email: e.target.value })} placeholder="priya@yourcompany.com" data-testid="onboarding-member-email" />
                </div>
                <div className="space-y-1.5">
                  <Label>Mobile</Label>
                  <Input value={member.mobile} onChange={(e) => setMember({ ...member, mobile: e.target.value })} placeholder="9876543210" />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                A temporary password <code className="px-1 bg-slate-100 rounded">Welcome@123</code> will be set. Ask them to change it on first login.
              </p>
            </div>
          )}

          {/* Step: Lead Source */}
          {currentStepKey === 'lead_source' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: Globe, label: 'Lead Widget', desc: 'Embed on your website', color: 'violet', to: '/lead-widget' },
                { icon: Facebook, label: 'Facebook Ads', desc: 'Lead form ads', color: 'blue', to: '/integrations' },
                { icon: Webhook, label: 'Google Ads', desc: 'Lead form extensions', color: 'amber', to: '/integrations' },
              ].map((opt) => {
                const Icon = opt.icon;
                const colors = {
                  violet: 'bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-200',
                  blue: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200',
                  amber: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200',
                };
                return (
                  <button
                    key={opt.label}
                    onClick={() => handlePickSource(opt.to)}
                    className={`text-left border rounded-xl p-4 transition-colors ${colors[opt.color]}`}
                    data-testid={`onboarding-source-${opt.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Icon className="w-5 h-5 mb-2" />
                    <p className="font-bold text-sm">{opt.label}</p>
                    <p className="text-xs opacity-80 mt-0.5">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step: First Lead */}
          {currentStepKey === 'first_lead' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Name *</Label>
                  <Input value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} placeholder="Test Customer" data-testid="onboarding-lead-name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Mobile *</Label>
                  <Input value={lead.mobile} onChange={(e) => setLead({ ...lead, mobile: e.target.value })} placeholder="9876543210" data-testid="onboarding-lead-mobile" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Email</Label>
                  <Input type="email" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} placeholder="test@example.com" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button onClick={skipAll} className="text-xs text-slate-500 hover:text-slate-700" data-testid="onboarding-skip-link">
            Skip setup guide
          </button>
          <div className="flex items-center gap-2">
            {currentStepKey !== 'welcome' && currentStepKey !== 'lead_source' && (
              <Button variant="outline" size="sm" onClick={() => advanceTo(currentStepKey)} data-testid="onboarding-skip-step-btn">
                Skip this
              </Button>
            )}
            {currentStepKey === 'welcome' && (
              <Button onClick={handleWelcome} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="onboarding-next-btn">
                Let's go <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            )}
            {currentStepKey === 'services' && (
              <Button onClick={handleAddService} disabled={busy} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="onboarding-save-service-btn">
                {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
                Add & Continue
              </Button>
            )}
            {currentStepKey === 'team' && (
              <Button onClick={handleInviteMember} disabled={busy} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="onboarding-save-member-btn">
                {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1.5" />}
                Invite & Continue
              </Button>
            )}
            {currentStepKey === 'first_lead' && (
              <Button onClick={handleAddLead} disabled={busy} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="onboarding-save-lead-btn">
                {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                Add Lead & Finish
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
