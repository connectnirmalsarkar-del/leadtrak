import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';
import { CheckCircle2, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

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

export default function SubscriptionPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [processing, setProcessing] = useState(false);
  const [rzpConfig, setRzpConfig] = useState({ configured: false, key_id: '' });

  useEffect(() => {
    fetchPlans();
    fetchRzpConfig();
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
      // 1) Create order on backend
      const { data: order } = await axios.post(`${API}/subscriptions/create-order`, {
        plan_id: planId,
        billing_cycle: billingCycle,
      });

      // 2) Open Razorpay checkout
      const options = {
        key: rzpConfig.key_id,
        amount: order.amount, // in paise, already incl. GST
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
            await axios.post(`${API}/subscriptions/verify`, {
              payment_id: response.razorpay_payment_id,
              order_id: response.razorpay_order_id,
              signature: response.razorpay_signature,
            });
            toast.success('Payment successful — subscription activated!');
            // Reload to refresh subscription badge in header
            setTimeout(() => window.location.reload(), 1200);
          } catch (e) {
            toast.error(e.response?.data?.detail || 'Payment verification failed. Please contact support.');
          }
        },
        modal: {
          ondismiss: () => setProcessing(false),
        },
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
      // Don't unblock immediately — the modal will close via ondismiss
      setTimeout(() => setProcessing(false), 3000);
    }
  };

  return (
    <div className="space-y-6" data-testid="subscription-page">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Billing</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily: 'Sora'}}>Subscription Plans</h1>
        <p className="text-sm text-slate-600 mt-1">Choose the plan that fits your organization</p>
      </div>

      {!rzpConfig.configured && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900" data-testid="rzp-not-configured-banner">
          Online payments are temporarily unavailable. Your account manager will share a payment link directly. You can also continue on your trial.
        </div>
      )}

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
        {plans.map((plan, i) => {
          const isMonthly = billingCycle === 'monthly';
          const basePrice = isMonthly ? plan.price_monthly : Math.round(plan.price_annual / 12);
          const gstPerMonth = isMonthly
            ? (plan.gst_monthly ?? Math.round(plan.price_monthly * 0.18 * 100) / 100)
            : Math.round((plan.gst_annual ?? plan.price_annual * 0.18) / 12 * 100) / 100;
          const totalPerMonth = Math.round((basePrice + gstPerMonth) * 100) / 100;
          const isPopular = plan.name === 'Growth';
          // Plans returned use `id` (not `_id`) per /api/subscription-plans serializer
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
              <h3 className="text-2xl font-bold text-slate-900 mb-2" style={{fontFamily: 'Sora'}}>{plan.name}</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-slate-900" style={{fontFamily: 'Sora'}}>₹{basePrice.toLocaleString('en-IN')}</span>
                <span className="text-sm text-slate-500">/month</span>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  + 18% GST (₹{gstPerMonth.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})})
                  · <span className="font-semibold text-slate-700">₹{totalPerMonth.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}/mo incl. tax</span>
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
    </div>
  );
}
