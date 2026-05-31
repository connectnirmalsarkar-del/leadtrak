import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Plus, GraduationCap, IndianRupee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

export default function AdmissionsPage() {
  const [admissions, setAdmissions] = useState([]);
  const [revenue, setRevenue] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [form, setForm] = useState({
    student_name: '', mobile: '', course: '', fees: '', admission_date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [admRes, revRes] = await Promise.all([
        axios.get(`${API}/admissions`),
        axios.get(`${API}/reports/revenue`),
      ]);
      setAdmissions(admRes.data);
      setRevenue(revRes.data.total_revenue);
    } catch (e) {
      toast.error('Failed to load admissions');
    }
  };

  const handleAdd = async () => {
    try {
      await axios.post(`${API}/admissions`, { ...form, fees: parseFloat(form.fees) });
      toast.success('Admission recorded');
      setShowAddDialog(false);
      setForm({ student_name: '', mobile: '', course: '', fees: '', admission_date: new Date().toISOString().split('T')[0] });
      fetchData();
    } catch (e) {
      toast.error('Failed to add admission');
    }
  };

  return (
    <div className="space-y-6" data-testid="admissions-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Enrollment</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{fontFamily: 'Outfit'}}>Admissions</h1>
          <p className="text-sm text-slate-600 mt-1">{admissions.length} total enrollments</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="add-admission-btn">
              <Plus className="w-4 h-4 mr-2" />
              Record Admission
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record New Admission</DialogTitle>
              <DialogDescription>Add a new student enrollment</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Student Name *</Label>
                <Input value={form.student_name} onChange={(e) => setForm({...form, student_name: e.target.value})} data-testid="adm-student-input" />
              </div>
              <div className="space-y-2">
                <Label>Mobile *</Label>
                <Input value={form.mobile} onChange={(e) => setForm({...form, mobile: e.target.value})} data-testid="adm-mobile-input" />
              </div>
              <div className="space-y-2">
                <Label>Course *</Label>
                <Input value={form.course} onChange={(e) => setForm({...form, course: e.target.value})} data-testid="adm-course-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Fees (₹) *</Label>
                  <Input type="number" value={form.fees} onChange={(e) => setForm({...form, fees: e.target.value})} data-testid="adm-fees-input" />
                </div>
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input type="date" value={form.admission_date} onChange={(e) => setForm({...form, admission_date: e.target.value})} data-testid="adm-date-input" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
              <Button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="submit-admission-btn">Record</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Revenue card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-50 rounded-md flex items-center justify-center">
              <IndianRupee className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Total Revenue</p>
              <p className="text-3xl font-semibold text-slate-900 font-mono">₹{revenue.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-50 rounded-md flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Total Admissions</p>
              <p className="text-3xl font-semibold text-slate-900 font-mono">{admissions.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Student</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Mobile</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Course</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Fees</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Date</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Counselor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate-500">No admissions yet</TableCell>
              </TableRow>
            ) : (
              admissions.map((adm) => (
                <TableRow key={adm._id} data-testid={`admission-row-${adm._id}`}>
                  <TableCell className="font-medium text-slate-900">{adm.student_name}</TableCell>
                  <TableCell className="text-sm text-slate-600">{adm.mobile}</TableCell>
                  <TableCell className="text-sm text-slate-700">{adm.course}</TableCell>
                  <TableCell className="font-mono text-sm">₹{adm.fees.toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-sm text-slate-600">{adm.admission_date}</TableCell>
                  <TableCell className="text-sm text-slate-600">{adm.counselor_name}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
