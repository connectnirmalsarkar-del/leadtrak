import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import { Lock, User, Mail, Shield, CheckCircle2, Camera, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { user, checkAuth } = useAuth();
  const fileRef = useRef(null);

  // --- Avatar + identity state ---
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [name, setName] = useState(user?.name || '');
  const [mobile, setMobile] = useState(user?.mobile || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    setAvatarUrl(user?.avatar_url || '');
    setName(user?.name || '');
    setMobile(user?.mobile || '');
  }, [user?.avatar_url, user?.name, user?.mobile]);

  // --- Password state ---
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const initials = (name || user?.name || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleAvatarPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Please choose a JPG / PNG / WEBP image');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be ≤ 10 MB');
      return;
    }
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await axios.post(`${API}/uploads/avatar`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAvatarUrl(data.avatar_url);
      await checkAuth();
      if (data.compressed_size && data.original_size && data.compressed_size < data.original_size) {
        const origKb = Math.round(data.original_size / 1024);
        const compKb = Math.round(data.compressed_size / 1024);
        toast.success(`Profile picture updated · auto-compressed ${origKb} KB → ${compKb} KB`);
      } else {
        toast.success('Profile picture updated');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Avatar upload failed');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarRemove = async () => {
    if (!avatarUrl) return;
    setUploadingAvatar(true);
    try {
      await axios.delete(`${API}/uploads/avatar`);
      setAvatarUrl('');
      await checkAuth();
      toast.success('Profile picture removed');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to remove avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Name is required');
      return;
    }
    setSavingProfile(true);
    try {
      await axios.put(`${API}/users/me`, {
        name: trimmedName,
        mobile: mobile.trim() || null,
      });
      await checkAuth();
      toast.success('Profile saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

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

  const profileChanged = name.trim() !== (user?.name || '') || (mobile || '').trim() !== (user?.mobile || '');

  return (
    <div className="space-y-6 max-w-3xl" data-testid="profile-page">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Account</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>My Profile</h1>
        <p className="text-sm text-slate-600 mt-1">Update your profile picture, identity details, and password.</p>
      </div>

      {/* Identity + Avatar card */}
      <form onSubmit={handleProfileSave} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5" data-testid="profile-identity-form">
        <div className="flex items-start gap-5 flex-wrap">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div
              className="w-24 h-24 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center overflow-hidden border border-slate-200"
              data-testid="profile-avatar-preview"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold">{initials}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute -bottom-1 -right-1 bg-violet-700 hover:bg-violet-800 text-white p-2 rounded-full shadow-md disabled:opacity-60"
              data-testid="profile-avatar-upload-btn"
              title="Change picture"
            >
              {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              className="hidden"
              onChange={handleAvatarPick}
              data-testid="profile-avatar-input"
            />
          </div>
          <div className="flex-1 min-w-[220px] space-y-1.5">
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
            <div className="flex items-center gap-2 pt-1">
              <p className="text-[11px] text-slate-500">JPG / PNG / WEBP · auto-compressed to ≤ 800 KB</p>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleAvatarRemove}
                  disabled={uploadingAvatar}
                  className="text-[11px] text-red-600 hover:text-red-700 inline-flex items-center gap-1 disabled:opacity-60"
                  data-testid="profile-avatar-remove-btn"
                >
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Editable identity fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              data-testid="profile-name-input"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mobile</Label>
            <Input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="+91 90000 00000"
              data-testid="profile-mobile-input"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={savingProfile || !profileChanged || !name.trim()}
            className="bg-violet-700 hover:bg-violet-800 text-white"
            data-testid="save-profile-btn"
          >
            {savingProfile ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </form>

      {/* Change password */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5" data-testid="change-password-form">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-violet-600" />
          <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Sora' }}>Change password</h2>
        </div>
        <div className="space-y-1.5">
          <Label>Current password</Label>
          <PasswordInput
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
            <PasswordInput
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
            <PasswordInput
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
