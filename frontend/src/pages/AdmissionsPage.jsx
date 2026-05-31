import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { useTerminology } from '@/lib/terminology';
import { Plus, GraduationCap, IndianRupee, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

export default function AdmissionsPage() {
  const t = useTerminology();
  const [admissions, setAdmissions] = useState([]);
  const [revenue, setRevenue] = useState(0);
  const [services, setServices] = useState([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const emptyForm = {
    student_name: '', mobile: '',
    service_id: '',
    discount_amount: '0',
    discount_reason: '',
    admission_date: new Date().toISOString().split('T')[0],
  };
  const [form, setForm] = useState(emptyForm);

  const selectedService = useMemo(
    () => services.find((s) => s._id === form.service_id),
    [services, form.service_id]
  );
  const basePrice = selectedService?.base_price || 0;
  const minPrice = selectedService?.min_price || 0;
  const discount = parseFloat(form.discount_amount || 0) || 0;
  const finalPrice = Math.max(0, basePrice - discount);
  const belowFloor = selectedService && finalPrice < minPrice;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [admRes, revRes, srvRes] = await Promise.all([
        axios.get(`${API}/admissions`),
        axios.get(`${API}/reports/revenue`),
        axios.get(`${API}/services`),
      ]);
      setAdmissions(admRes.data);
      setRevenue(revRes.data.total_revenue);
      setServices(srvRes.data);
    } catch (e) {
      toast.error('Failed to load admissions');
    }
  };

  const handleAdd = async () => {
    if (!form.service_id) {
      toast.error(`Please select a ${t.offering.toLowerCase()}`);
      return;
    }
    if (belowFloor) {
      toast.error(`Final price ₹${finalPrice.toLocaleString('en-IN')} is below min price ₹${minPrice.toLocaleString('en-IN')}`);
      return;
    }
    try {
      await axios.post(`${API}/admissions`, {
        student_name: form.student_name,
        mobile: form.mobile,
        course: selectedService?.name || '',
        service_id: form.service_id,
        base_price: basePrice,
        discount_amount: discount,
        discount_reason: form.discount_reason,
        fees: finalPrice,
        admission_date: form.admission_date,
      });
      toast.success(`${t.conversion} recorded`);
      setShowAddDialog(false);
      setForm(emptyForm);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || `Failed to record ${t.conversion.toLowerCase()}`);
    }
  };

  return (
    <div className="space-y-6" data-testid="admissions-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">{t.conversion_verb}</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily: 'Sora'}}>{t.conversions}</h1>
          <p className="text-sm text-slate-600 mt-1">{admissions.length} total {t.conversions.toLowerCase()}</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="add-admission-btn">
              <Plus className="w-4 h-4 mr-2" />
              Record {t.conversion}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record New {t.conversion}</DialogTitle>
              <DialogDescription>Add a new {t.contact.toLowerCase()} {t.conversion.toLowerCase()}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t.contact} Name *</Label>
                  <Input value={form.student_name} onChange={(e) => setForm({...form, student_name: e.target.value})} data-testid="adm-student-input" />
                </div>
                <div className="space-y-2">
                  <Label>Mobile *</Label>
                  <Input value={form.mobile} onChange={(e) => setForm({...form, mobile: e.target.value})} data-testid="adm-mobile-input" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t.offering} *</Label>
                <Select value={form.service_id} onValueChange={(v) => setForm({...form, service_id: v})}>
                  <SelectTrigger data-testid="adm-service-select">
                    <SelectValue placeholder={`Select ${t.offering.toLowerCase()} from catalog`} />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s._id} value={s._id} data-testid={`adm-service-option-${s._id}`}>
                        <div className="flex flex-col py-0.5">
                          <span className="font-medium text-sm">{s.name}</span>
                          <span className="text-[11px] text-slate-500">{s.category} · ₹{Number(s.base_price).toLocaleString('en-IN')}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {services.length === 0 && (
                  <p className="text-xs text-amber-600">
                    No {t.offerings.toLowerCase()} configured yet. Ask your admin to add them under Services & Pricing.
                  </p>
                )}
              </div>

              {selectedService && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3" data-testid="pricing-summary">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Base Price</span>
                    <span className="font-mono font-medium text-slate-900">₹{basePrice.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Discount (₹)</Label>
                      <div className="relative">
                        <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                        <Input
                          type="number"
                          value={form.discount_amount}
                          onChange={(e) => setForm({...form, discount_amount: e.target.value})}
                          className="pl-6 h-9"
                          data-testid="adm-discount-input"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Reason</Label>
                      <Input
                        value={form.discount_reason}
                        onChange={(e) => setForm({...form, discount_reason: e.target.value})}
                        placeholder="e.g. Sibling discount"
                        className="h-9"
                        data-testid="adm-discount-reason-input"
                      />
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                    <span className="text-sm font-semibold text-slate-700">Final Price</span>
                    <span className={`font-mono font-bold text-lg ${belowFloor ? 'text-red-600' : 'text-emerald-700'}`} data-testid="final-price">
                      ₹{finalPrice.toLocaleString('en-IN')}
                    </span>
                  </div>
                  {belowFloor && (
                    <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2" data-testid="below-floor-warning">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>Final price is below min price ₹{minPrice.toLocaleString('en-IN')}. Reduce the discount.</span>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={form.admission_date} onChange={(e) => setForm({...form, admission_date: e.target.value})} data-testid="adm-date-input" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={belowFloor || !form.service_id} className="bg-violet-700 hover:bg-violet-800 disabled:bg-slate-300 text-white" data-testid="submit-admission-btn">Record</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Revenue card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-50 rounded-md flex items-center justify-center">
              <IndianRupee className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Total {t.revenue_label}</p>
              <p className="text-3xl font-semibold text-slate-900 font-mono">₹{revenue.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-50 rounded-md flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Total {t.conversions}</p>
              <p className="text-3xl font-semibold text-slate-900 font-mono">{admissions.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">{t.contact}</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Mobile</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">{t.offering}</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">{t.revenue_label}</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Date</TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-[0.1em]">Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate-500">No {t.conversions.toLowerCase()} yet</TableCell>
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
