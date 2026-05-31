import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Plus, CheckSquare, AlertCircle, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const PRIORITY_COLORS = {
  Low: 'bg-slate-50 text-slate-700 border-slate-200',
  Medium: 'bg-blue-50 text-blue-700 border-blue-200',
  High: 'bg-red-50 text-red-700 border-red-200',
};

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', assigned_to: '', due_date: '', priority: 'Medium'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [tasksRes, usersRes] = await Promise.all([
        axios.get(`${API}/tasks`),
        axios.get(`${API}/users`).catch(() => ({ data: [] })),
      ]);
      setTasks(tasksRes.data);
      setUsers(usersRes.data);
    } catch (e) {
      toast.error('Failed to fetch tasks');
    }
  };

  const handleAdd = async () => {
    try {
      await axios.post(`${API}/tasks`, form);
      toast.success('Task created');
      setShowAddDialog(false);
      setForm({ title: '', description: '', assigned_to: '', due_date: '', priority: 'Medium' });
      fetchData();
    } catch (e) {
      toast.error('Failed to create task');
    }
  };

  const handleStatusChange = async (taskId, status) => {
    try {
      await axios.put(`${API}/tasks/${taskId}`, { status });
      toast.success('Task updated');
      fetchData();
    } catch (e) {
      toast.error('Failed to update task');
    }
  };

  const pending = tasks.filter(t => t.status === 'pending');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const completed = tasks.filter(t => t.status === 'completed');

  const TaskColumn = ({ title, items, status, color }) => (
    <div className="bg-slate-50 rounded-md p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-sm font-semibold text-slate-700`} style={{fontFamily: 'Outfit'}}>{title}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-md ${color}`}>{items.length}</span>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No tasks</p>
        ) : (
          items.map(task => (
            <div key={task._id} className="bg-white border border-slate-200 rounded-md p-3 hover:border-slate-300 transition-colors" data-testid={`task-card-${task._id}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-medium text-sm text-slate-900 flex-1">{task.title}</p>
                <Badge variant="outline" className={`${PRIORITY_COLORS[task.priority]} text-xs`}>
                  <Flag className="w-2.5 h-2.5 mr-1" />
                  {task.priority}
                </Badge>
              </div>
              {task.description && <p className="text-xs text-slate-600 mb-3">{task.description}</p>}
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Due: {task.due_date}</span>
                <Select value={task.status} onValueChange={(v) => handleStatusChange(task._id, v)}>
                  <SelectTrigger className="h-7 text-xs w-32" data-testid={`task-status-${task._id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="tasks-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Productivity</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{fontFamily: 'Outfit'}}>Tasks</h1>
          <p className="text-sm text-slate-600 mt-1">Manage and track team tasks</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="add-task-btn">
              <Plus className="w-4 h-4 mr-2" />
              Create Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Task</DialogTitle>
              <DialogDescription>Assign a new task to your team</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} data-testid="task-title-input" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} rows={3} data-testid="task-desc-input" />
              </div>
              <div className="space-y-2">
                <Label>Assigned To *</Label>
                <Select value={form.assigned_to} onValueChange={(v) => setForm({...form, assigned_to: v})}>
                  <SelectTrigger data-testid="task-assigned-select"><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => <SelectItem key={u._id} value={u._id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Due Date *</Label>
                  <Input type="date" value={form.due_date} onChange={(e) => setForm({...form, due_date: e.target.value})} data-testid="task-date-input" />
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({...form, priority: v})}>
                    <SelectTrigger data-testid="task-priority-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
              <Button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="submit-task-btn">Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TaskColumn title="Pending" items={pending} status="pending" color="bg-amber-100 text-amber-800" />
        <TaskColumn title="In Progress" items={inProgress} status="in_progress" color="bg-blue-100 text-blue-800" />
        <TaskColumn title="Completed" items={completed} status="completed" color="bg-emerald-100 text-emerald-800" />
      </div>
    </div>
  );
}
