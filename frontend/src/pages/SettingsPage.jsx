import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';
import { Building2, Mail, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { user } = useAuth();
  const [organization, setOrganization] = useState({ name: '' });
  const [sources, setSources] = useState([]);
  const [newSource, setNewSource] = useState('');

  useEffect(() => {
    fetchOrg();
    fetchSources();
  }, []);

  const fetchOrg = async () => {
    try {
      const { data } = await axios.get(`${API}/organization`);
      setOrganization(data);
    } catch (e) {
      // ignore
    }
  };

  const fetchSources = async () => {
    try {
      const { data } = await axios.get(`${API}/lead-sources`);
      setSources(data);
    } catch (e) {
      // ignore
    }
  };

  const handleSaveOrg = async () => {
    try {
      await axios.put(`${API}/organization`, { name: organization.name });
      toast.success('Organization updated');
    } catch (e) {
      toast.error('Failed to update organization');
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

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Configuration</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{fontFamily: 'Outfit'}}>Settings</h1>
        <p className="text-sm text-slate-600 mt-1">Configure your workspace</p>
      </div>

      <Tabs defaultValue="organization">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="organization" data-testid="tab-organization"><Building2 className="w-4 h-4 mr-2" />Organization</TabsTrigger>
          <TabsTrigger value="sources" data-testid="tab-sources">Lead Sources</TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="organization" className="space-y-4 mt-4">
          <div className="bg-white border border-slate-200 rounded-md p-6 max-w-2xl">
            <h3 className="text-lg font-medium text-slate-900 mb-4" style={{fontFamily: 'Outfit'}}>Organization Details</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input value={organization.name || ''} onChange={(e) => setOrganization({...organization, name: e.target.value})} data-testid="org-name-input" />
              </div>
              <div className="space-y-2">
                <Label>Subscription Plan</Label>
                <Input value={organization.subscription_plan || 'starter'} disabled />
              </div>
              <Button onClick={handleSaveOrg} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="save-org-btn">Save Changes</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sources" className="space-y-4 mt-4">
          <div className="bg-white border border-slate-200 rounded-md p-6 max-w-2xl">
            <h3 className="text-lg font-medium text-slate-900 mb-4" style={{fontFamily: 'Outfit'}}>Custom Lead Sources</h3>
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="Add new source (e.g., LinkedIn Ads)"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSource()}
                data-testid="new-source-input"
              />
              <Button onClick={handleAddSource} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="add-source-btn">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {sources.length === 0 ? (
                <p className="text-sm text-slate-500">No custom sources yet. Default sources include: Facebook Ads, Website, Google Ads, Referral, Walk-in, Telecalling.</p>
              ) : (
                sources.map(s => (
                  <div key={s._id} className="flex items-center justify-between p-3 bg-slate-50 rounded-md">
                    <span className="text-sm text-slate-900">{s.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-md p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-md flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900" style={{fontFamily: 'Outfit'}}>WhatsApp (Twilio)</h3>
                  <p className="text-xs text-slate-500">Send messages via Twilio API</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-3">Configure your Twilio credentials in the backend .env file to enable WhatsApp messaging.</p>
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-700">
                Status: Not configured - add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-md p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-50 rounded-md flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900" style={{fontFamily: 'Outfit'}}>Facebook Lead Ads</h3>
                  <p className="text-xs text-slate-500">Auto-import leads from Meta</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-3">Configure Facebook App credentials and webhook URL: <code className="bg-slate-100 px-1 rounded text-xs">/api/integrations/facebook-leads</code></p>
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-700">
                Status: Webhook endpoint ready - add Facebook App credentials
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
