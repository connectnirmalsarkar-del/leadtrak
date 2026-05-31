import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Plus, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const ROLES = ['org_admin', 'manager', 'counselor', 'telecaller'];

const roleColors = {
  super_admin: 'bg-purple-50 text-purple-700 border-purple-200',
  org_admin: 'bg-blue-50 text-blue-700 border-blue-200',
  manager: 'bg-amber-50 text-amber-700 border-amber-200',
  counselor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  telecaller: 'bg-slate-50 text-slate-700 border-slate-200',
};

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [form, setForm] = useState({ name: '', email: '', role: 'counselor', mobile: '' });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data } = await axios.get(`${API}/users`);
      setUsers(data);
    } catch (e) {
      toast.error('Failed to fetch users');
    }
  };

  const handleAdd = async () => {
    try {
      const { data } = await axios.post(`${API}/users`, form);
      setTempPassword(data.temp_password);
      toast.success('User created');
      setForm({ name: '', email: '', role: 'counselor', mobile: '' });
      fetchUsers();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create user');
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Delete this user?')) return;
    try {
      await axios.delete(`${API}/users/${userId}`);
      toast.success('User deleted');
      fetchUsers();
    } catch (e) {
      toast.error('Failed to delete user');
    }
  };

  const closeDialog = () => {
    setShowAddDialog(false);
    setTempPassword('');
  };

  return (
    <div className="space-y-6" data-testid="users-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Team</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily: 'Sora'}}>Team Members</h1>
          <p className="text-sm text-slate-600 mt-1">{users.length} active members</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={(o) => { if(!o) closeDialog(); else setShowAddDialog(true); }}>
          <DialogTrigger asChild>
            <Button className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="add-user-btn">
              <Plus className="w-4 h-4 mr-2" />
              Add Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
              <DialogDescription>Create a new user account</DialogDescription>
            </DialogHeader>
            {tempPassword ? (
              <div className="space-y-4 py-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-md p-4">
                  <p className="text-sm font-medium text-emerald-900 mb-2">User created successfully!</p>
                  <p className="text-xs text-emerald-700 mb-2">Share these credentials with the user:</p>
                  <div className="bg-white rounded-md p-3 font-mono text-sm">
                    <p>Email: {form.email || 'See above'}</p>
                    <p>Password: <span className="font-bold" data-testid="temp-password">{tempPassword}</span></p>
                  </div>
                </div>
                <Button onClick={closeDialog} className="w-full">Done</Button>
              </div>
            ) : (
              <>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Full Name *</Label>
                    <Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} data-testid="user-name-input" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email *</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} data-testid="user-email-input" />
                  </div>
                  <div className="space-y-2">
                    <Label>Mobile</Label>
                    <Input value={form.mobile} onChange={(e) => setForm({...form, mobile: e.target.value})} data-testid="user-mobile-input" />
                  </div>
                  <div className="space-y-2">
                    <Label>Role *</Label>
                    <Select value={form.role} onValueChange={(v) => setForm({...form, role: v})}>
                      <SelectTrigger data-testid="user-role-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map(r => <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                  <Button onClick={handleAdd} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="submit-user-btn">Create</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Name</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Email</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Role</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Joined</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em] w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-slate-500">No team members yet</TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const initials = u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                return (
                  <TableRow key={u._id} data-testid={`user-row-${u._id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-slate-200 text-slate-700 text-xs">{initials}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-slate-900">{u.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={roleColors[u.role] || roleColors.telecaller}>
                        {u.role.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {u.role !== 'super_admin' && (
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(u._id)} data-testid={`delete-user-${u._id}`}>
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
