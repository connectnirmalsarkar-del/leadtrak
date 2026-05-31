import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import {
  CreditCard,
  MessageSquare,
  Facebook,
  Globe2,
  CheckCircle2,
  Circle,
  Settings as SettingsIcon,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const PROVIDERS = [
  {
    key: 'razorpay',
    name: 'Razorpay',
    desc: 'Accept online payments at deal close. Settle to your bank in T+2 days.',
    icon: CreditCard,
    color: 'sky',
    docs: 'https://dashboard.razorpay.com/app/keys',
    fields: [
      { name: 'key_id', label: 'Key ID', placeholder: 'rzp_test_xxxxxxxxxxxx', secret: false },
      { name: 'key_secret', label: 'Key Secret', placeholder: 'Enter Razorpay key secret', secret: true },
      { name: 'webhook_secret', label: 'Webhook Secret (optional)', placeholder: 'For payment notifications', secret: true },
    ],
  },
  {
    key: 'twilio_whatsapp',
    name: 'Twilio WhatsApp',
    desc: 'Send WhatsApp messages, templates, and OTPs from your sales team.',
    icon: MessageSquare,
    color: 'emerald',
    docs: 'https://console.twilio.com/',
    fields: [
      { name: 'account_sid', label: 'Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', secret: false },
      { name: 'auth_token', label: 'Auth Token', placeholder: 'Enter Twilio auth token', secret: true },
      { name: 'whatsapp_number', label: 'WhatsApp Number', placeholder: '+14155238886', secret: false },
    ],
  },
  {
    key: 'facebook_lead_ads',
    name: 'Facebook Lead Ads',
    desc: 'Ingest leads directly from your Facebook & Instagram lead forms.',
    icon: Facebook,
    color: 'blue',
    docs: 'https://developers.facebook.com/docs/marketing-api/guides/lead-ads/',
    fields: [
      { name: 'page_id', label: 'Facebook Page ID', placeholder: 'e.g. 102301234567890', secret: false },
      { name: 'page_access_token', label: 'Page Access Token', placeholder: 'EAA...', secret: true },
      { name: 'verify_token', label: 'Webhook Verify Token', placeholder: 'A custom string you choose', secret: false },
    ],
  },
  {
    key: 'google_ads',
    name: 'Google Ads',
    desc: 'Track conversions + receive lead-form submissions via webhook.',
    icon: Globe2,
    color: 'amber',
    docs: 'https://support.google.com/google-ads/answer/6095821',
    fields: [
      { name: 'conversion_id', label: 'Conversion ID', placeholder: 'AW-1234567890', secret: false },
      { name: 'conversion_label', label: 'Conversion Label', placeholder: 'AbC-D_efG-h12_34-567', secret: false },
      { name: 'webhook_secret', label: 'Lead Form Webhook Secret', placeholder: 'A random shared secret', secret: true, hint: 'Used to authenticate inbound Google Ads Lead Form submissions.' },
    ],
  },
];

const COLOR_CLASS = {
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function IntegrationsPage() {
  const { user } = useAuth();
  const [integrations, setIntegrations] = useState({});
  const [autoAssign, setAutoAssign] = useState(true);
  const [dialogProvider, setDialogProvider] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const canManage = user && ['super_admin', 'org_admin'].includes(user.role);

  const load = async () => {
    try {
      const { data } = await axios.get(`${API}/organization/integrations`);
      setIntegrations(data.integrations || {});
      setAutoAssign(data.auto_assign_enabled !== false);
    } catch (e) {
      toast.error('Failed to load integrations');
    }
  };

  useEffect(() => {
    if (canManage) load();
  }, [canManage]);

  const isConnected = (key) => {
    const cfg = integrations[key];
    if (!cfg) return false;
    // Determine "connected" based on whether the primary required field is set
    if (key === 'razorpay') return !!cfg.key_id;
    if (key === 'twilio_whatsapp') return !!cfg.account_sid;
    if (key === 'facebook_lead_ads') return !!cfg.page_id;
    if (key === 'google_ads') return !!cfg.conversion_id || !!cfg.webhook_secret;
    return false;
  };

  const openDialog = (provider) => {
    setDialogProvider(provider);
    setForm(integrations[provider.key] || {});
  };

  const save = async () => {
    if (!dialogProvider) return;
    setSaving(true);
    try {
      const { data } = await axios.put(`${API}/organization/integrations`, {
        [dialogProvider.key]: form,
      });
      setIntegrations(data.integrations || {});
      toast.success(`${dialogProvider.name} settings saved`);
      setDialogProvider(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleAutoAssign = async (v) => {
    setAutoAssign(v);
    try {
      await axios.put(`${API}/organization/integrations`, { auto_assign_enabled: v });
      toast.success(`Auto-assignment ${v ? 'enabled' : 'disabled'}`);
    } catch (e) {
      setAutoAssign(!v);
      toast.error('Failed to update');
    }
  };

  if (!canManage) {
    return (
      <div className="p-6 text-center text-slate-500" data-testid="integrations-no-access">
        Only Org Admin or Super Admin can manage integrations.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl" data-testid="integrations-page">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Tenant Setup</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>
          Integrations
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Connect external services. Secrets are stored encrypted at rest and shown masked here.
        </p>
      </div>

      {/* Lead auto-distribution toggle */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-violet-700" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="text-base font-semibold text-slate-900">Auto-assign incoming leads</h3>
            <Switch checked={autoAssign} onCheckedChange={toggleAutoAssign} data-testid="auto-assign-toggle" />
          </div>
          <p className="text-sm text-slate-600">
            When ON, leads from web widget, Facebook Ads, CSV import, and manual entry (without explicit owner) are <strong>round-robin distributed</strong> equally among active counselors + telecallers.
          </p>
        </div>
      </div>

      {/* Provider cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        {PROVIDERS.map((p) => {
          const Icon = p.icon;
          const connected = isConnected(p.key);
          return (
            <div
              key={p.key}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4 hover:border-violet-300 hover:shadow-sm transition-all"
              data-testid={`integration-card-${p.key}`}
            >
              <div className="flex items-start justify-between">
                <div className={`w-11 h-11 rounded-md border flex items-center justify-center ${COLOR_CLASS[p.color]}`}>
                  <Icon className="w-5 h-5" />
                </div>
                {connected ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200" data-testid={`integration-status-${p.key}`}>
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200" data-testid={`integration-status-${p.key}`}>
                    <Circle className="w-3 h-3 mr-1" /> Not connected
                  </Badge>
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: 'Sora' }}>{p.name}</h3>
                <p className="text-sm text-slate-600 mt-1">{p.desc}</p>
              </div>
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <a
                  href={p.docs}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-500 hover:text-violet-700"
                >
                  Where to find keys ↗
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openDialog(p)}
                  data-testid={`integration-setup-btn-${p.key}`}
                >
                  <SettingsIcon className="w-3.5 h-3.5 mr-1.5" />
                  {connected ? 'Edit' : 'Setup'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Setup dialog */}
      <Dialog open={!!dialogProvider} onOpenChange={(o) => !o && setDialogProvider(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set up {dialogProvider?.name}</DialogTitle>
            <DialogDescription>{dialogProvider?.desc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {dialogProvider?.fields.map((f) => (
              <div key={f.name} className="space-y-2">
                <Label>
                  {f.label}
                  {f.secret && <span className="text-xs text-amber-600 ml-2">🔒 stored encrypted</span>}
                </Label>
                <Input
                  type={f.secret ? 'password' : 'text'}
                  value={form[f.name] || ''}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                  placeholder={f.placeholder}
                  data-testid={`integration-field-${dialogProvider.key}-${f.name}`}
                />
                {f.secret && form[f.name] && form[f.name].includes('•') && (
                  <p className="text-[11px] text-slate-500">Leave as-is to keep existing secret, or type a new one to replace.</p>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogProvider(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid={`integration-save-${dialogProvider?.key}`}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
