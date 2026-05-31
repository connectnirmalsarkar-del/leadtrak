import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { CheckCircle2, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function SubscriptionPage() {
  const [plans, setPlans] = useState([]);
  const [billingCycle, setBillingCycle] = useState('monthly');

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const { data } = await axios.get(`${API}/subscription-plans`);
      setPlans(data);
    } catch (e) {
      toast.error('Failed to load plans');
    }
  };

  const handleSubscribe = async (planId) => {
    try {
      // This would integrate with Razorpay checkout
      toast.info('Razorpay integration will redirect to payment gateway. Configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable live payments.');
    } catch (e) {
      toast.error('Failed to initiate payment');
    }
  };

  return (
    <div className="space-y-6" data-testid="subscription-page">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">Billing</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{fontFamily: 'Outfit'}}>Subscription Plans</h1>
        <p className="text-sm text-slate-600 mt-1">Choose the plan that fits your organization</p>
      </div>

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
          const price = billingCycle === 'monthly' ? plan.price_monthly : Math.round(plan.price_annual / 12);
          const isPopular = plan.name === 'Growth';
          return (
            <div
              key={plan.name}
              className={`relative p-8 bg-white rounded-md ${isPopular ? 'border-2 border-blue-600 shadow-lg' : 'border border-slate-200'}`}
              data-testid={`plan-card-${plan.name.toLowerCase()}`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                  Most popular
                </div>
              )}
              <h3 className="text-2xl font-semibold text-slate-900 mb-2" style={{fontFamily: 'Outfit'}}>{plan.name}</h3>
              <div className="mb-6">
                <span className="text-4xl font-semibold text-slate-900 font-mono">₹{price.toLocaleString('en-IN')}</span>
                <span className="text-sm text-slate-500">/month</span>
                {billingCycle === 'annual' && (
                  <p className="text-xs text-slate-500 mt-1">Billed annually (₹{plan.price_annual.toLocaleString('en-IN')})</p>
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
                className={`w-full ${isPopular ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                variant={isPopular ? 'default' : 'outline'}
                onClick={() => handleSubscribe(plan._id)}
                data-testid={`subscribe-${plan.name.toLowerCase()}-btn`}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Subscribe
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
