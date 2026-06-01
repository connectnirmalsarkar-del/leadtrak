import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useAuth, formatApiErrorDetail, API } from '@/context/AuthContext';
import {
  Zap,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  Star,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const BENEFITS = [
  { icon: Zap, title: 'Live in 5 minutes', desc: 'Pre-built templates for Education, Real Estate, IT, Healthcare, Insurance, Travel & more.' },
  { icon: Sparkles, title: 'AI-powered lead scoring', desc: 'Identify high-intent prospects automatically based on behavioral signals.' },
  { icon: TrendingUp, title: '3× faster conversions', desc: 'Automated follow-ups and rep next-best-action recommendations.' },
  { icon: Shield, title: 'Enterprise-grade security', desc: 'ISO 27001, SOC 2 Type II, DPDP Ready. Your data, fully protected.' },
];

const CUSTOMER_LOGOS = ['APEX', 'BRIGHT', 'TECHFLOW', 'SKYLINE', 'PULSE', 'GOFIT'];

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    organization_name: '',
    email: '',
    password: '',
    industry: 'education',
  });
  const [industries, setIndustries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axios
      .get(`${API}/industries`)
      .then(({ data }) => setIndustries(data))
      .catch(() => setIndustries([]));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.email, form.password, form.name, form.organization_name, form.industry);
      toast.success('Welcome! Your workspace is ready.');
      navigate('/dashboard');
    } catch (err) {
      const msg = formatApiErrorDetail(err.response?.data?.detail) || err.message;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/50 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 -z-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-violet-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-fuchsia-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob" style={{ animationDelay: '4s' }}></div>
      </div>

      {/* Top bar */}
      <header className="relative z-10 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 flex-shrink-0">
            <img src="/logo-light.png?v=3" alt="Leadtrak" className="h-7 sm:h-10 w-auto" data-testid="register-logo" />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-slate-600">Already a customer?</span>
            <Link to="/login" className="text-violet-700 hover:text-violet-800 font-semibold" data-testid="link-to-login">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-16">
        {/* Mobile-only compact hero (above the form) */}
        <div className="lg:hidden text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-violet-100 border border-violet-200 rounded-full mb-3">
            <Sparkles className="w-3 h-3 text-violet-700" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-700">
              Book a Free Demo
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-[1.1]" style={{ fontFamily: 'Sora' }}>
            Goodbye spreadsheets.<br />
            <span className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">
              Hello revenue growth.
            </span>
          </h1>
          <p className="text-sm text-slate-600 mt-3 max-w-md mx-auto">
            Join 1,200+ teams across 9 industries converting more leads with Leadtrak.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1.1fr,0.9fr] gap-8 lg:gap-16 items-start">
          {/* Left — marketing (order-2 on mobile, order-1 on desktop) */}
          <div className="space-y-8 lg:space-y-10 order-2 lg:order-1">
            {/* Desktop-only full hero */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="hidden lg:block"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-100 border border-violet-200 rounded-full mb-5">
                <Sparkles className="w-3.5 h-3.5 text-violet-700" />
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
                  Book a Free Demo
                </span>
              </div>
              <h1 className="text-4xl sm:text-5xl xl:text-6xl font-bold tracking-tight text-slate-900 leading-[1.05]" style={{ fontFamily: 'Sora' }}>
                Goodbye spreadsheets.<br />
                <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-700 bg-clip-text text-transparent">
                  Hello revenue growth.
                </span>
              </h1>
              <p className="text-lg text-slate-600 leading-relaxed mt-5 max-w-xl">
                See how 1,200+ teams across Education, IT, Real Estate, Healthcare, Insurance, Travel, Retail, and Fitness use Leadtrak to capture every lead, automate follow-ups, and convert prospects into customers.
              </p>
            </motion.div>

            {/* Benefits */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="grid sm:grid-cols-2 gap-4"
            >
              {BENEFITS.map((b, i) => {
                const Icon = b.icon;
                return (
                  <div key={i} className="flex gap-3">
                    <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-violet-100 to-violet-50 rounded-lg flex items-center justify-center border border-violet-200">
                      <Icon className="w-5 h-5 text-violet-700" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900" style={{ fontFamily: 'Sora' }}>{b.title}</p>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{b.desc}</p>
                    </div>
                  </div>
                );
              })}
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="grid grid-cols-3 gap-4 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm"
            >
              {[
                { v: '3×', l: 'Faster sales cycles' },
                { v: '60%', l: 'More productivity' },
                { v: '70%', l: 'Less manual work' },
              ].map((s, i) => (
                <div key={i} className="text-center">
                  <p className="text-3xl xl:text-4xl font-bold text-violet-700" style={{ fontFamily: 'Sora' }}>
                    {s.v}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{s.l}</p>
                </div>
              ))}
            </motion.div>

            {/* Customer logos */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-4">
                Trusted across 9 industries
              </p>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                {CUSTOMER_LOGOS.map((logo) => (
                  <span
                    key={logo}
                    className="text-base font-bold tracking-tight text-slate-400 hover:text-slate-600 transition-colors"
                    style={{ fontFamily: 'Sora' }}
                  >
                    {logo}
                  </span>
                ))}
              </div>
            </motion.div>

            {/* Testimonial */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="bg-gradient-to-br from-slate-900 to-violet-900 rounded-2xl p-6 lg:p-7 text-white relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-48 h-48 bg-violet-500 rounded-full mix-blend-multiply filter blur-3xl opacity-40"></div>
              <div className="relative">
                <div className="flex gap-0.5 mb-4">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-base leading-relaxed mb-5">
                  "Leadtrak brought structure and efficiency to our sales process. Teams across our 6 branches adapted within a week — and our conversion rate jumped 40% in the first quarter."
                </p>
                <div className="flex items-center gap-3 pt-4 border-t border-white/10">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400 flex items-center justify-center text-white font-bold text-sm">
                    SG
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Sarthak Garg</p>
                    <p className="text-xs text-slate-300">Co-Founder, Skyline Realty</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right — form card (order-1 on mobile, order-2 on desktop) */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="order-1 lg:order-2 lg:sticky lg:top-24"
          >
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-violet-100/50 p-6 sm:p-8 lg:p-10">
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700 mb-2">
                  Get started
                </p>
                <h2 className="text-2xl xl:text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: 'Sora' }}>
                  Start your free 14-day trial
                </h2>
                <p className="text-sm text-slate-600 mt-2">
                  No credit card. Setup in 5 minutes.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-semibold text-slate-700">Full name *</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Priya Sharma"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    className="h-11 border-slate-300 focus-visible:ring-violet-300"
                    data-testid="register-name-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="organization" className="text-sm font-semibold text-slate-700">Organization name *</Label>
                  <Input
                    id="organization"
                    type="text"
                    placeholder="Your business or institution name"
                    value={form.organization_name}
                    onChange={(e) => setForm({ ...form, organization_name: e.target.value })}
                    required
                    className="h-11 border-slate-300 focus-visible:ring-violet-300"
                    data-testid="register-org-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="industry" className="text-sm font-semibold text-slate-700">What industry are you in? *</Label>
                  <Select
                    value={form.industry}
                    onValueChange={(v) => setForm({ ...form, industry: v })}
                  >
                    <SelectTrigger id="industry" className="h-11 border-slate-300 focus:ring-violet-300" data-testid="register-industry-select">
                      <SelectValue placeholder="Select your industry" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {industries.map((ind) => (
                        <SelectItem key={ind.key} value={ind.key} data-testid={`industry-option-${ind.key}`}>
                          <div className="flex flex-col py-0.5">
                            <span className="font-medium text-sm">{ind.label}</span>
                            <span className="text-[11px] text-slate-500">{ind.tagline}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-slate-500">We'll preload defaults (lead sources, pipeline, labels) tuned for your industry.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-semibold text-slate-700">Work email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    className="h-11 border-slate-300 focus-visible:ring-violet-300"
                    data-testid="register-email-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-semibold text-slate-700">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    minLength={8}
                    className="h-11 border-slate-300 focus-visible:ring-violet-300"
                    data-testid="register-password-input"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" data-testid="register-error">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-12 bg-violet-700 hover:bg-violet-800 text-white shadow-lg shadow-violet-200 font-semibold text-base"
                  disabled={loading}
                  data-testid="register-submit-btn"
                >
                  {loading ? 'Creating account...' : 'Create my account'}
                  {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
                </Button>

                <div className="space-y-2 pt-2">
                  {[
                    'Capture and manage unlimited leads',
                    'AI-powered lead scoring & follow-ups',
                    'WhatsApp & Facebook Ads integrations',
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
              </form>

              <p className="text-[11px] text-slate-500 text-center mt-6 leading-relaxed">
                By creating an account, you agree to our{' '}
                <a href="#" className="text-slate-700 underline">Terms of Service</a> and{' '}
                <a href="#" className="text-slate-700 underline">Privacy Policy</a>. We'll never sell your data.
              </p>
            </div>

            {/* Security badge below form */}
            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-emerald-500" />
                ISO 27001 certified
              </div>
              <div className="w-1 h-1 rounded-full bg-slate-300"></div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                DPDP compliant
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
