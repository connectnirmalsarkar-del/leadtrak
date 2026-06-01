import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Download, Mail } from 'lucide-react';

const fmtINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch (_) { return iso; }
};

/**
 * InvoiceDialog — Success modal shown right after a successful subscription
 * payment, and re-openable from the Invoice History list. Includes a
 * print-to-PDF button that uses the browser's native print dialog scoped
 * to the receipt area (works on mobile + desktop).
 */
export default function InvoiceDialog({ invoice, open, onClose, justPaid = false }) {
  if (!invoice) return null;

  const handlePrint = () => {
    const node = document.getElementById('leadtrak-invoice-printable');
    if (!node) return;
    const w = window.open('', 'PRINT', 'width=720,height=900');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Invoice ${invoice.receipt_no || ''}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        body{padding:32px;color:#0f172a;margin:0}
        h1{font-size:24px;margin:0 0 4px}
        h2{font-size:16px;margin:0;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.2em}
        .row{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:24px}
        .muted{color:#64748b;font-size:12px}
        table{width:100%;border-collapse:collapse;margin:16px 0}
        th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:13px}
        th{background:#f8fafc;font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#64748b}
        .totals td{border:none;padding:6px 12px}
        .totals .lbl{text-align:right;color:#64748b}
        .grand{font-weight:700;font-size:16px;border-top:2px solid #0f172a !important}
        .badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:600}
        .header{border-bottom:2px solid #7c3aed;padding-bottom:16px;margin-bottom:24px}
      </style></head><body>${node.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 250);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="invoice-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {justPaid && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            {justPaid ? 'Payment Successful' : 'Invoice'}
          </DialogTitle>
        </DialogHeader>

        {justPaid && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900" data-testid="payment-success-banner">
            Your <strong>{invoice.plan_name}</strong> ({invoice.billing_cycle}) subscription is now active.
            {invoice.subscription_end_date && (
              <> Valid until <strong>{fmtDate(invoice.subscription_end_date).split(',')[0]}</strong>.</>
            )}
          </div>
        )}

        {/* Printable invoice section */}
        <div id="leadtrak-invoice-printable" className="bg-white border border-slate-200 rounded-lg p-6 space-y-5" data-testid="invoice-printable">
          <div className="header">
            <div className="row flex justify-between items-start gap-6 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Sora' }}>Leadtrak</h1>
                <p className="text-xs text-slate-500 mt-0.5">Multi-Industry CRM Platform</p>
                <p className="text-[11px] text-slate-500 mt-2">leadtrak.in · care@leadtrak.in · +91 98368 07060</p>
              </div>
              <div className="text-right">
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Tax Invoice</h2>
                <p className="text-lg font-bold text-slate-900 mt-1" data-testid="invoice-receipt-no">{invoice.receipt_no || '—'}</p>
                <p className="text-[11px] text-slate-500">Date: {fmtDate(invoice.paid_at || invoice.created_at)}</p>
                <span className={`badge ${invoice.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} inline-block mt-2 px-2.5 py-1 rounded-full text-xs font-semibold`}>
                  {String(invoice.status || '').toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Billed to */}
          <div className="row flex justify-between gap-6 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1">Billed to</p>
              <p className="text-sm font-semibold text-slate-900">{invoice.organization?.name || '—'}</p>
              {invoice.organization?.industry && (
                <p className="text-xs text-slate-600 capitalize">{invoice.organization.industry.replace('_', ' ')}</p>
              )}
              {invoice.organization?.gstin && (
                <p className="text-xs text-slate-600 mt-1">GSTIN: {invoice.organization.gstin}</p>
              )}
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1">Billed by</p>
              <p className="text-sm font-semibold text-slate-900">Leadtrak — Ncriptech Labs</p>
              <p className="text-xs text-slate-600 leading-snug mt-0.5">
                185/35, Rajiv Gandhi Road,<br />
                Konnagar (M), District: Hooghly,<br />
                West Bengal — 712235, India
              </p>
              <p className="text-xs text-slate-600 mt-1">GSTIN: <span className="font-mono font-semibold text-slate-900">19BMZPS3329E1ZD</span></p>
              <p className="text-xs text-slate-600">care@leadtrak.in · +91 98368 07060</p>
            </div>
          </div>

          {/* Item table */}
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-3 py-2 bg-slate-50 text-[11px] uppercase tracking-[0.15em] text-slate-500 font-semibold">Description</th>
                <th className="text-right px-3 py-2 bg-slate-50 text-[11px] uppercase tracking-[0.15em] text-slate-500 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-3 border-b border-slate-100">
                  <p className="font-semibold text-slate-900">{invoice.plan_name} Plan</p>
                  <p className="text-xs text-slate-500 capitalize">{invoice.billing_cycle} billing</p>
                </td>
                <td className="px-3 py-3 text-right border-b border-slate-100" data-testid="invoice-base-amount">{fmtINR(invoice.base_amount)}</td>
              </tr>
            </tbody>
          </table>

          <table className="w-full text-sm totals">
            <tbody>
              <tr>
                <td className="lbl text-right text-slate-500 text-xs px-3 py-1">Subtotal</td>
                <td className="text-right px-3 py-1 w-32">{fmtINR(invoice.base_amount)}</td>
              </tr>
              <tr>
                <td className="lbl text-right text-slate-500 text-xs px-3 py-1">GST ({((invoice.gst_rate || 0.18) * 100).toFixed(0)}%)</td>
                <td className="text-right px-3 py-1">{fmtINR(invoice.gst_amount)}</td>
              </tr>
              <tr className="grand">
                <td className="lbl text-right text-slate-900 font-bold px-3 py-2 border-t-2 border-slate-900">Total Paid</td>
                <td className="text-right font-bold text-slate-900 px-3 py-2 border-t-2 border-slate-900" data-testid="invoice-total">{fmtINR(invoice.amount)}</td>
              </tr>
            </tbody>
          </table>

          {/* Payment metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 pt-4 border-t border-slate-100">
            {invoice.razorpay_payment_id && (
              <div><span className="text-slate-500">Payment ID:</span> <span className="font-mono text-slate-900" data-testid="invoice-payment-id">{invoice.razorpay_payment_id}</span></div>
            )}
            {invoice.payment_method && (
              <div><span className="text-slate-500">Method:</span> <span className="capitalize">{invoice.payment_method.replace(/_/g, ' ')}</span></div>
            )}
            {invoice.subscription_end_date && (
              <div><span className="text-slate-500">Valid until:</span> <strong>{fmtDate(invoice.subscription_end_date).split(',')[0]}</strong></div>
            )}
            {invoice.paid_at && (
              <div><span className="text-slate-500">Paid on:</span> {fmtDate(invoice.paid_at)}</div>
            )}
          </div>

          <p className="text-[10px] text-slate-400 text-center pt-2">
            This is a system-generated invoice. No physical signature required.
          </p>
        </div>

        <DialogFooter className="flex sm:justify-between gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose} data-testid="invoice-close-btn">Close</Button>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" disabled title="Coming soon — email integration in progress" data-testid="invoice-email-btn">
              <Mail className="w-4 h-4 mr-2" />
              Email me a copy
            </Button>
            <Button onClick={handlePrint} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="invoice-print-btn">
              <Download className="w-4 h-4 mr-2" />
              Download / Print
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
