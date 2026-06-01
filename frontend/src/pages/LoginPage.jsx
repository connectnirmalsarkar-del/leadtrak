import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, formatApiErrorDetail } from '@/context/AuthContext';
import { Zap, ArrowRight, Shield, Lock, Award, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const TESTIMONIALS = [
  {
    quote: 'We cut manual data entry by 70%. Our counselors now spend time on conversations, not spreadsheets.',
    name: 'Priya Sharma',
    role: 'Director, Bright Future Coaching (Education)',
    logo: 'BRIGHT',
  },
  {
    quote: 'Doubled our site-visit conversion rate in 3 months. Follow-up automations alone paid for the tool.',
    name: 'Rahul Mehta',
    role: 'COO, Skyline Realty (Real Estate)',
    logo: 'SKYLINE',
  },
  {
    quote: 'Finally a CRM that doesn\'t feel like it was built for someone else\'s business. We were live in a week.',
    name: 'Dr. Anjali Verma',
    role: 'Founder, PulseClinic (Healthcare)',
    logo: 'PULSE',
  },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [testimonialIdx, setTestimonialIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTestimonialIdx((i) => (i + 1) % TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      const msg = formatApiErrorDetail(err.response?.data?.detail) || err.message;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const t = TESTIMONIALS[testimonialIdx];

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col lg:w-[55%] bg-gradient-to-br from-slate-950 via-violet-950 to-slate-900 relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 opacity-40">
          <div className="absolute top-32 left-20 w-96 h-96 bg-violet-600 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
          <div className="absolute bottom-32 right-20 w-96 h-96 bg-fuchsia-600 rounded-full mix-blend-multiply filter blur-3xl animate-blob" style={{ animationDelay: '3s' }}></div>
          <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl animate-blob" style={{ animationDelay: '6s' }}></div>
        </div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}></div>

        <div className="relative z-10 flex flex-col h-screen p-12 xl:p-16">
          {/* Top brand */}
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo-dark.png?v=3" alt="Leadtrak" className="h-14 w-auto" data-testid="login-logo" />
          </Link>

          {/* Middle content */}
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 border border-violet-400/20 rounded-full mb-6 backdrop-blur-sm w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"></span>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">
                Multi-Industry CRM Platform
              </span>
            </div>

            <h2 className="text-4xl xl:text-5xl font-bold text-white tracking-tight leading-[1.1] mb-6" style={{ fontFamily: 'Sora' }}>
              Convert more leads into <span className="bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">customers</span>.
            </h2>

            <p className="text-base text-slate-300 leading-relaxed mb-12">
              The all-in-one platform for Education, IT, Real Estate, Healthcare, Insurance, Travel, Retail, and Fitness teams — capture every lead, automate follow-ups, and know what to do next.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-12">
              {[
                { v: '3×', l: 'Faster sales cycles' },
                { v: '60%', l: 'Higher productivity' },
                { v: '1,200+', l: 'Teams worldwide' },
              ].map((s, i) => (
                <div key={i}>
                  <p className="text-3xl xl:text-4xl font-bold bg-gradient-to-br from-violet-300 to-violet-100 bg-clip-text text-transparent" style={{ fontFamily: 'Sora' }}>
                    {s.v}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">{s.l}</p>
                </div>
              ))}
            </div>

            {/* Testimonial carousel */}
            <AnimatePresence mode="wait">
              <motion.div
                key={testimonialIdx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.5 }}
                className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-5"
              >
                <div className="flex gap-0.5 mb-3">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-slate-200 leading-relaxed mb-4">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white font-bold text-xs">
                    {t.name.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-slate-400">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Dots */}
            <div className="flex gap-1.5 mt-4">
              {TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setTestimonialIdx(i)}
                  className={`h-1 rounded-full transition-all ${i === testimonialIdx ? 'w-8 bg-violet-400' : 'w-1.5 bg-slate-600'}`}
                  data-testid={`testimonial-dot-${i}`}
                />
              ))}
            </div>
          </div>

          {/* Bottom trust badges */}
          <div className="flex items-center gap-6 pt-6 border-t border-white/10">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Shield className="w-4 h-4 text-violet-400" />
              ISO 27001
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Lock className="w-4 h-4 text-violet-400" />
              SOC 2 Type II
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Award className="w-4 h-4 text-violet-400" />
              DPDP Ready
            </div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 relative">
        {/* Mobile-only brand */}
        <Link to="/" className="lg:hidden absolute top-6 left-6 flex items-center gap-2">
          <img src="/logo-light.png?v=3" alt="Leadtrak" className="h-12 w-auto" />
        </Link>

        <div className="w-full max-w-sm space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700 mb-3">Sign in</p>
            <h1 className="text-3xl xl:text-4xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>
              Welcome back
            </h1>
            <p className="text-sm text-slate-600 mt-2">
              New here?{' '}
              <Link to="/register" className="text-violet-700 hover:text-violet-800 font-semibold" data-testid="link-to-register">
                Book a demo
              </Link>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-slate-700">Work email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 border-slate-300 focus-visible:ring-violet-300"
                data-testid="login-email-input"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</Label>
                <button type="button" className="text-xs text-violet-700 hover:text-violet-800 font-medium" data-testid="forgot-password-link">
                  Forgot?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 border-slate-300 focus-visible:ring-violet-300"
                data-testid="login-password-input"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" data-testid="login-error">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 bg-violet-700 hover:bg-violet-800 text-white shadow-lg shadow-violet-200 font-semibold"
              disabled={loading}
              data-testid="login-submit-btn"
            >
              {loading ? 'Signing in...' : 'Sign in to Leadtrak'}
              {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </form>

          <div className="pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-500 text-center mb-2">Default Super Admin</p>
            <div className="bg-slate-50 rounded-lg p-3 font-mono text-xs text-slate-700 text-center">
              admin@educationcrm.com / Admin@123
            </div>
          </div>

          <p className="text-xs text-slate-500 text-center">
            By signing in, you agree to our{' '}
            <a href="#" className="text-slate-700 underline">Terms</a> and{' '}
            <a href="#" className="text-slate-700 underline">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
