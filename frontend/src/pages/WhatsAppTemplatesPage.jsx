import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { MessageSquare, Plus, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function WhatsAppTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: '', body: '', category: 'general' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const { data } = await axios.get(`${API}/whatsapp-templates`);
      setTemplates(data);
    } catch (e) { toast.error('Failed to load templates'); }
  };

  const handleAdd = async () => {
    try {
      await axios.post(`${API}/whatsapp-templates`, form);
      toast.success('Template added');
      setShowDialog(false);
      setForm({ name: '', body: '', category: 'general' });
      load();
    } catch (e) { toast.error('Failed to add'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete template?')) return;
    try {
      await axios.delete(`${API}/whatsapp-templates/${id}`);
      toast.success('Deleted');
      load();
    } catch (e) { toast.error('Failed to delete'); }
  };

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="space-y-6 max-w-5xl" data-testid="whatsapp-templates-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 mb-1.5">Messaging</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>WhatsApp Templates</h1>
          <p className="text-sm text-slate-500 mt-1">Reusable messages for follow-ups</p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="add-template-btn">
              <Plus className="w-4 h-4 mr-1.5" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New WhatsApp Template</DialogTitle>
              <DialogDescription>Use {'{{name}}'} as placeholder</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Template Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Welcome Message" data-testid="tpl-name-input" />
              </div>
              <div className="space-y-2">
                <Label>Body *</Label>
                <Textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={5}
                  placeholder="Hi {{name}}, thanks for your interest in our coaching program..."
                  data-testid="tpl-body-input"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button onClick={handleAdd} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="submit-template-btn">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <div className="w-16 h-16 mx-auto bg-violet-50 rounded-full flex items-center justify-center mb-4">
            <MessageSquare className="w-8 h-8 text-violet-400" />
          </div>
          <p className="text-slate-600">No templates yet. Create your first.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <div key={t._id} className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow" data-testid={`template-card-${t._id}`}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-slate-900" style={{ fontFamily: 'Sora' }}>{t.name}</h3>
                <div className="flex gap-1">
                  <button onClick={() => copy(t.body)} className="text-slate-400 hover:text-violet-600" data-testid={`copy-${t._id}`}>
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(t._id)} className="text-slate-400 hover:text-red-600" data-testid={`delete-tpl-${t._id}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{t.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
