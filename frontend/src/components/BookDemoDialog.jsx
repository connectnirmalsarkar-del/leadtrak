import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Video, MessageSquare, Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

/**
 * BookDemoDialog
 * Props:
 *   open: bool
 *   onOpenChange: (bool) => void
 *   lead: { _id, name, mobile, email } | null
 *   users: full org user list (manager+counselor+telecaller pool to pick demo owner)
 *   onBooked: (demo) => void   // called after successful book — { share.whatsapp, share.mailto, ... }
 */
export default function BookDemoDialog({ open, onOpenChange, lead, users = [], onBooked }) {
  const [form, setForm] = useState({
    demo_owner_id: '',
    scheduled_date: new Date().toISOString().split('T')[0],
    scheduled_time: '11:00',
    demo_mode: 'Online',
    demo_link: '',
    agenda: '',
  });
  const [savedDemo, setSavedDemo] = useState(null);

  useEffect(() => {
    if (open) {
      setSavedDemo(null);
      setForm({
        demo_owner_id: '',
        scheduled_date: new Date().toISOString().split('T')[0],
        scheduled_time: '11:00',
        demo_mode: 'Online',
        demo_link: '',
        agenda: '',
      });
    }
  }, [open]);

  const submit = async () => {
    if (!lead) return;
    if (!form.demo_owner_id) {
      toast.error('Please choose a demo owner');
      return;
    }
    try {
      const { data } = await axios.post(`${API}/demos`, {
        lead_id: lead._id,
        ...form,
      });
      toast.success('Demo booked. Share invite via WhatsApp or email.');
      setSavedDemo(data);
      onBooked && onBooked(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to book demo');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="w-5 h-5 text-violet-600" />
            Book Demo {lead && <span className="text-sm font-normal text-slate-500">for {lead.name}</span>}
          </DialogTitle>
          <DialogDescription>
            Schedule a demo with the right team member. Once booked, share the invite via WhatsApp or email in one click.
          </DialogDescription>
        </DialogHeader>

        {!savedDemo ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Demo presenter *</Label>
              <Select value={form.demo_owner_id} onValueChange={(v) => setForm({ ...form, demo_owner_id: v })}>
                <SelectTrigger data-testid="demo-owner-select">
                  <SelectValue placeholder="Pick team member to present" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u._id} value={u._id} data-testid={`demo-owner-option-${u._id}`}>
                      {u.name} <span className="text-slate-400">({(u.role || '').replace('_', ' ')})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} data-testid="demo-date-input" />
              </div>
              <div className="space-y-2">
                <Label>Time *</Label>
                <Input type="time" value={form.scheduled_time} onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })} data-testid="demo-time-input" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={form.demo_mode} onValueChange={(v) => setForm({ ...form, demo_mode: v })}>
                <SelectTrigger data-testid="demo-mode-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Online">Online (Zoom / Meet / Teams)</SelectItem>
                  <SelectItem value="Onsite">Onsite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Demo link {form.demo_mode === 'Online' && '*'}</Label>
              <Input
                value={form.demo_link}
                onChange={(e) => setForm({ ...form, demo_link: e.target.value })}
                placeholder="https://meet.google.com/abc-defg-hij"
                data-testid="demo-link-input"
              />
              <p className="text-[11px] text-slate-500">Paste the meeting URL. It will appear in the WhatsApp + email invite.</p>
            </div>
            <div className="space-y-2">
              <Label>Agenda (optional)</Label>
              <Textarea
                value={form.agenda}
                onChange={(e) => setForm({ ...form, agenda: e.target.value })}
                rows={2}
                placeholder="e.g. Walk through reporting + custom fields"
                data-testid="demo-agenda-input"
              />
            </div>
          </div>
        ) : (
          // Post-booking: share invite via WhatsApp / Email
          <div className="space-y-3 py-2">
            <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-sm text-emerald-800">
              <p className="font-semibold">✓ Demo booked successfully</p>
              <p className="text-xs mt-0.5">
                {savedDemo.scheduled_date} at {savedDemo.scheduled_time} ({savedDemo.demo_mode}) — presented by {savedDemo.demo_owner_name}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Pre-filled invite message</Label>
              <Textarea value={savedDemo.share?.message || ''} readOnly rows={4} className="text-xs font-mono bg-slate-50" data-testid="demo-share-message" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {savedDemo.share?.whatsapp ? (
                <a href={savedDemo.share.whatsapp} target="_blank" rel="noopener noreferrer" className="contents">
                  <Button variant="outline" className="w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50" data-testid="share-whatsapp-btn">
                    <MessageSquare className="w-4 h-4 mr-1.5" />
                    Send WhatsApp
                  </Button>
                </a>
              ) : (
                <Button variant="outline" disabled className="w-full opacity-50">
                  <MessageSquare className="w-4 h-4 mr-1.5" />
                  No mobile
                </Button>
              )}
              {savedDemo.share?.mailto ? (
                <a href={savedDemo.share.mailto} className="contents">
                  <Button variant="outline" className="w-full border-blue-300 text-blue-700 hover:bg-blue-50" data-testid="share-email-btn">
                    <Mail className="w-4 h-4 mr-1.5" />
                    Send Email
                  </Button>
                </a>
              ) : (
                <Button variant="outline" disabled className="w-full opacity-50">
                  <Mail className="w-4 h-4 mr-1.5" />
                  No email
                </Button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 text-center">
              Both buttons open the message pre-filled — just hit send.
            </p>
          </div>
        )}

        <DialogFooter>
          {!savedDemo ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={submit} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="book-demo-submit-btn">
                <Send className="w-4 h-4 mr-1.5" />
                Book demo
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)} className="bg-slate-900 hover:bg-slate-800 text-white">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
