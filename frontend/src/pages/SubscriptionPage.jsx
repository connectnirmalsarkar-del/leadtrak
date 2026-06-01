import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { API } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';
import { CheckCircle2, CreditCard, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import InvoiceDialog from '@/components/InvoiceDialog';

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const s = document.createElement('script');
    s.src = RAZORPAY_SCRIPT;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const fmtINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch (_) { return iso; }
};

export default function SubscriptionPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [processing, setProcessing] = useState(false);
  const [rzpConfig, setRzpConfig] = useState({ configured: false, key_id: '' });

  // Invoice modal state
  const [invoice, setInvoice] = useState(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [justPaid, setJustPaid] = useState(false);

  // Invoice history
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('plans');

  useEffect(() => {
    fetchPlans();
    fetchRzpConfig();
    fetchOrders();
  }, []);

  // Auto-open the invoice modal when the URL has ?invoice=<orderId>
  // (used when redirecting back from the direct-pay signup flow).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const invId = searchParams.get('invoice');
    if (invId) {
      openInvoice(invId, { justPaid: true });
      // Clean the URL so a refresh doesn't keep reopening it
      const next = new URLSearchParams(searchParams);
      next.delete('invoice');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPlans = async () => {
    try {
      const { data } = await axios.get(`${API}/subscription-plans`);
      setPlans(data);
    } catch (e) {
      toast.error('Failed to load plans');
    }
  };

  const fetchRzpConfig = async () => {
    try {
      const { data } = await axios.get(`${API}/razorpay/config`);
      setRzpConfig(data);
    } catch (e) {
      setRzpConfig({ configured: false, key_id: '' });
    }
  };

  const fetchOrders = async () => {
    try {
      const { data } = await axios.get(`${API}/subscriptions/my-orders`);
      setOrders(Array.isArray(data) ? data : []);
    } catch (_) {
      setOrders([]);
    }
  };

  const openInvoice = async (orderId, opts = {}) => {
    try {
      const { data } = await axios.get(`${API}/subscriptions/orders/${orderId}`);
      setInvoice(data);
      setJustPaid(!!opts.justPaid);
      setInvoiceOpen(true);
    } catch (e) {
      toast.error('Could not load invoice');
    }
  };

  const closeInvoice = () => {
    setInvoiceOpen(false);
    if (justPaid) {
      // Refresh subscription badge in header after a successful payment
      setTimeout(() => window.location.reload(), 250);
    } else {
      setJustPaid(false);
    }
  };

  const handleSubscribe = async (planId) => {
    if (!rzpConfig.configured) {
      toast.error('Online payments are temporarily unavailable. Please contact your account manager.');
      return;
    }
    setProcessing(true);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) {
        toast.error('Could not load Razorpay. Check your internet connection.');
        return;
      }
      const { data: order } = await axios.post(`${API}/subscriptions/create-order`, {
        plan_id: planId,
        billing_cycle: billingCycle,
      });
      const options = {
        key: rzpConfig.key_id,
        amount: order.amount,
        currency: order.currency || 'INR',
        order_id: order.order_id,
        name: 'Leadtrak',
        description: `Subscription · ${billingCycle === 'annual' ? 'Annual' : 'Monthly'} · incl. 18% GST`,
        image: '/icon-512.png',
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.mobile || '',
        },
        theme: { color: '#7C3AED' },
        handler: async (response) => {
          try {
            const { data: verifyResp } = await axios.post(`${API}/subscriptions/verify`, {
              payment_id: response.razorpay_payment_id,
              order_id: response.razorpay_order_id,
              signature: response.razorpay_signature,
            });
            toast.success('Payment successful — subscription activated!');
            // Open the invoice modal so the user sees their bill immediately
            if (verifyResp?.order_id) {
              await openInvoice(verifyResp.order_id, { justPaid: true });
              fetchOrders();
            } else {
              setTimeout(() => window.location.reload(), 1200);
            }
          } catch (e) {
            toast.error(e.response?.data?.detail || 'Payment verification failed. Please contact support.');
          }
        },
        modal: { ondismiss: () => setProcessing(false) },
      };
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        toast.error(resp?.error?.description || 'Payment failed');
        setProcessing(false);
      });
      rzp.open();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to initiate payment');
    } finally {
      setTimeout(() => setProcessing(false), 3000);
    }
  };

  return (
    <div className="space-y-6" data-testid="subscription-page">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Billing</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>Subscription</h1>
        <p className="text-sm text-slate-600 mt-1">Choose a plan or download past invoices.</p>
      </div>

      {!rzpConfig.configured && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900" data-testid="rzp-not-configured-banner">
          Online payments are temporarily unavailable. Your account manager will share a payment link directly. You can also continue on your trial.
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="plans" data-testid="tab-plans">Plans</TabsTrigger>
          <TabsTrigger value="invoices" data-testid="tab-invoices">
            Invoices {orders.length > 0 && <span className="ml-1.5 text-[10px] text-slate-500">({orders.length})</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-6 space-y-6">
          <div className="flex items-center justify-center gap-2 bg-slate-100 p-1 rounded-md w-fit mx-auto">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${billingCycle === 'monthly' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`}
              data-testid="billing-monthly-btn"
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${billingCycle === 'annual' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`}
              data-testid="billing-annual-btn"
            >
              Annual <span className="text-xs text-emerald-600 ml-1">Save 17%</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan) => {
              const isMonthly = billingCycle === 'monthly';
              const basePrice = isMonthly ? plan.price_monthly : Math.round(plan.price_annual / 12);
              const gstPerMonth = isMonthly
                ? (plan.gst_monthly ?? Math.round(plan.price_monthly * 0.18 * 100) / 100)
                : Math.round((plan.gst_annual ?? plan.price_annual * 0.18) / 12 * 100) / 100;
              const totalPerMonth = Math.round((basePrice + gstPerMonth) * 100) / 100;
              const isPopular = plan.name === 'Growth';
              const planId = plan.id || plan._id;
              return (
                <div
                  key={plan.name}
                  className={`relative p-8 bg-white rounded-xl ${isPopular ? 'border-2 border-violet-600 shadow-xl shadow-violet-100' : 'border border-slate-200'}`}
                  data-testid={`plan-card-${plan.name.toLowerCase()}`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-700 text-white text-xs font-medium px-3 py-1 rounded-full">
                      Most popular
                    </div>
                  )}
                  <h3 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Sora' }}>{plan.name}</h3>
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-slate-900" style={{ fontFamily: 'Sora' }}>₹{basePrice.toLocaleString('en-IN')}</span>
                    <span className="text-sm text-slate-500">/month</span>
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      + 18% GST (₹{gstPerMonth.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                      · <span className="font-semibold text-slate-700">₹{totalPerMonth.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo incl. tax</span>
                    </p>
                    {billingCycle === 'annual' && (
                      <p className="text-[11px] text-slate-500 mt-0.5">Billed annually: ₹{plan.price_annual.toLocaleString('en-IN')} + GST ₹{(plan.gst_annual ?? Math.round(plan.price_annual * 0.18)).toLocaleString('en-IN')} = <strong>₹{(plan.total_annual ?? Math.round(plan.price_annual * 1.18)).toLocaleString('en-IN')}</strong></p>
                    )}
                  </div>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feat, j) => (
                      <li key={j} className="flex items-center gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={`w-full ${isPopular ? 'bg-violet-700 hover:bg-violet-800 text-white' : ''}`}
                    variant={isPopular ? 'default' : 'outline'}
                    onClick={() => handleSubscribe(planId)}
                    disabled={processing || !rzpConfig.configured}
                    data-testid={`subscribe-${plan.name.toLowerCase()}-btn`}
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {processing ? 'Processing…' : (rzpConfig.configured ? 'Subscribe' : 'Coming soon')}
                  </Button>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="mt-6">
          {orders.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-500" data-testid="invoices-empty">
              <FileText className="w-8 h-8 mx-auto mb-3 text-slate-300" />
              No invoices yet — once you subscribe, your invoices will appear here.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto" data-testid="invoices-list">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-[11px] uppercase tracking-[0.15em] text-slate-500 font-semibold">Receipt</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-[0.15em] text-slate-500 font-semibold">Plan</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-[0.15em] text-slate-500 font-semibold">Date</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-[0.15em] text-slate-500 font-semibold text-right">Amount</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-[0.15em] text-slate-500 font-semibold">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`invoice-row-${o.id}`}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{o.receipt_no || '—'}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{o.plan_name}</p>
                        <p className="text-xs text-slate-500 capitalize">{o.billing_cycle}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(o.paid_at || o.created_at)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{fmtINR(o.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          o.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {String(o.status || '').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => openInvoice(o.id)} data-testid={`view-invoice-${o.id}`}>
                          <Download className="w-3.5 h-3.5 mr-1.5" /> View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <InvoiceDialog invoice={invoice} open={invoiceOpen} onClose={closeInvoice} justPaid={justPaid} />
    </div>
  );
}
