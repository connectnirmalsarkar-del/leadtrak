import React, { useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import { Lock, User, Mail, Shield, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { user } = useAuth();
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPwd.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error('New password and confirmation do not match');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/auth/change-password`, {
        current_password: currentPwd,
        new_password: newPwd,
      });
      toast.success('Password changed successfully');
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl" data-testid="profile-page">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Account</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>My Profile</h1>
        <p className="text-sm text-slate-600 mt-1">View your account info and change your password.</p>
      </div>

      {/* Identity card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center flex-shrink-0">
            <User className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-lg font-semibold text-slate-900" data-testid="profile-name">{user?.name || '—'}</p>
              <Badge variant="outline" className="capitalize text-xs">{(user?.role || '').replace('_', ' ')}</Badge>
              {user?.impersonating && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Impersonating</Badge>
              )}
            </div>
            <p className="text-sm text-slate-600 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              <span data-testid="profile-email">{user?.email}</span>
            </p>
            {user?.organization_name && (
              <p className="text-sm text-slate-600 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                {user.organization_name}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Change password */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5" data-testid="change-password-form">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-violet-600" />
          <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Sora' }}>Change password</h2>
        </div>
        <div className="space-y-1.5">
          <Label>Current password</Label>
          <Input
            type="password"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            required
            autoComplete="current-password"
            data-testid="current-password-input"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              data-testid="new-password-input"
            />
            <p className="text-[11px] text-slate-500">At least 8 characters</p>
          </div>
          <div className="space-y-1.5">
            <Label>Confirm new password</Label>
            <Input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              data-testid="confirm-password-input"
            />
            {confirmPwd && newPwd && confirmPwd === newPwd && (
              <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Match
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <Button
            type="submit"
            disabled={submitting || !currentPwd || !newPwd || !confirmPwd}
            className="bg-violet-700 hover:bg-violet-800 text-white"
            data-testid="change-password-btn"
          >
            {submitting ? 'Updating…' : 'Update password'}
          </Button>
        </div>
      </form>
    </div>
  );
}
