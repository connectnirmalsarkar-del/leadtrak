import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Users,
  BarChart3,
  Calendar,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  Target,
  Shield,
  MessageSquare,
  Sparkles,
  Lock,
  Award,
  Globe,
  Star,
  ChevronRight,
  GraduationCap,
  Home,
  Code2,
  Stethoscope,
  ShieldCheck,
  Plane,
  ShoppingBag,
  Dumbbell,
  Briefcase,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const ROTATING_WORDS = ['sales teams', 'admission counselors', 'real-estate brokers', 'clinic managers', 'gym owners', 'travel agents'];

const INDUSTRIES = [
  { id: 'education', icon: GraduationCap, label: 'Education', desc: 'Capture inquiries, schedule counseling, and convert prospects into enrolled students.', stats: ['3× faster admissions', 'Counselor leaderboards', 'Fee tracking & batches'] },
  { id: 'it_software', icon: Code2, label: 'IT / Software', desc: 'Manage SaaS pipelines from demo-request to closed-won with proposal tracking.', stats: ['Deal velocity insights', 'Quote & proposal stages', 'Demo scheduling'] },
  { id: 'real_estate', icon: Home, label: 'Real Estate', desc: 'Track buyers from inquiry to booking with site-visit calendars and property pipelines.', stats: ['Site-visit follow-ups', 'Property-wise pipelines', 'Token & booking tracking'] },
  { id: 'healthcare', icon: Stethoscope, label: 'Healthcare', desc: 'Convert patient inquiries to appointments and treatments with care coordination.', stats: ['Appointment funnel', 'Treatment plan tracker', 'Insurance network leads'] },
  { id: 'insurance', icon: ShieldCheck, label: 'Insurance', desc: 'From quote to policy issuance, manage every renewal and KYC step in one place.', stats: ['Quote-to-issue pipeline', 'Renewal reminders', 'Agent network'] },
  { id: 'travel', icon: Plane, label: 'Travel & Tour', desc: 'Manage itinerary quotes, negotiations, and bookings across packages and DMCs.', stats: ['Quote-to-travel funnel', 'Multi-package tracker', 'Trip value reports'] },
  { id: 'retail', icon: ShoppingBag, label: 'Retail / D2C', desc: 'Capture online & walk-in leads, convert to orders, and re-engage repeat customers.', stats: ['Order pipeline', 'Customer segments', 'Marketplace leads'] },
  { id: 'fitness', icon: Dumbbell, label: 'Fitness & Wellness', desc: 'Track trials, memberships, and renewals for gyms, yoga, and wellness studios.', stats: ['Trial-to-member funnel', 'Membership renewals', 'Class enrollment'] },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [wordIndex, setWordIndex] = useState(0);
  const [activeIndustry, setActiveIndustry] = useState('education');

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((i) => (i + 1) % ROTATING_WORDS.length);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  const currentIndustry = INDUSTRIES.find((i) => i.id === activeIndustry);
  const CurrentIcon = currentIndustry.icon;

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur-xl z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-violet-600 to-violet-800 rounded-lg flex items-center justify-center shadow-lg shadow-violet-200">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>
              LeadTrak
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-violet-700 transition-colors">Features</a>
            <a href="#industries" className="hover:text-violet-700 transition-colors">Industries</a>
            <a href="#pricing" className="hover:text-violet-700 transition-colors">Pricing</a>
            <a href="#customers" className="hover:text-violet-700 transition-colors">Customers</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate('/login')} data-testid="landing-login-btn">
              Sign in
            </Button>
            <Button
              onClick={() => navigate('/register')}
              className="bg-violet-700 hover:bg-violet-800 text-white shadow-lg shadow-violet-200"
              data-testid="landing-register-btn"
            >
              Book a demo
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-32 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-violet-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
          <div className="absolute top-40 right-1/4 w-96 h-96 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob" style={{ animationDelay: '2s' }}></div>
          <div className="absolute bottom-20 left-1/3 w-96 h-96 bg-fuchsia-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob" style={{ animationDelay: '4s' }}></div>
        </div>

        <div className="max-w-7xl mx-auto px-6 text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 bg-violet-50 border border-violet-200 rounded-full mb-8"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-600" />
            <span className="text-xs font-semibold tracking-wide text-violet-700">
              ONE CRM FOR EVERY INDUSTRY
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 max-w-5xl mx-auto leading-[1.05]"
            style={{ fontFamily: 'Sora' }}
          >
            The CRM built for{' '}
            <span className="relative inline-block">
              <AnimatePresence mode="wait">
                <motion.span
                  key={wordIndex}
                  initial={{ opacity: 0, y: 20, rotateX: -90 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  exit={{ opacity: 0, y: -20, rotateX: 90 }}
                  transition={{ duration: 0.5 }}
                  className="inline-block gradient-text animate-gradient-x bg-gradient-to-r from-violet-600 via-fuchsia-500 to-indigo-600"
                  style={{
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {ROTATING_WORDS[wordIndex]}
                </motion.span>
              </AnimatePresence>
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-lg sm:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto mt-8"
          >
            Capture every lead, automate follow-ups, and convert prospects into customers — across Education, IT, Real Estate, Healthcare, Insurance, Travel, Retail, Fitness, and beyond.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-3 justify-center mt-10"
          >
            <Button
              size="lg"
              onClick={() => navigate('/register')}
              className="bg-violet-700 hover:bg-violet-800 text-white text-base px-8 h-12 shadow-xl shadow-violet-300/40"
              data-testid="hero-cta-btn"
            >
              Start free trial
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate('/login')}
              className="text-base px-8 h-12 border-slate-300"
              data-testid="hero-demo-btn"
            >
              Book a demo
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex items-center justify-center gap-8 mt-8 text-sm text-slate-500"
          >
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              14-day free trial
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              No credit card
            </div>
            <div className="hidden sm:flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Setup in 5 minutes
            </div>
          </motion.div>

          {/* Dashboard Preview Mockup */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mt-20 relative max-w-5xl mx-auto"
          >
            <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-violet-200/50 border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-3">
              <div className="flex items-center gap-2 mb-3 px-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
                <span className="text-xs text-slate-400 ml-2 font-mono">leadtrak.app/dashboard</span>
              </div>
              <div className="bg-slate-50 rounded-lg p-6 grid grid-cols-12 gap-4">
                <div className="col-span-3 bg-slate-900 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-violet-600 rounded-md flex items-center justify-center">
                      <Zap className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-xs text-white font-medium">LeadTrak</span>
                  </div>
                  {['Dashboard', 'Leads', 'Follow-ups', 'Conversions', 'Reports'].map((item, i) => (
                    <div key={item} className={`text-xs px-2 py-1.5 rounded-md ${i === 0 ? 'bg-violet-600 text-white' : 'text-slate-400'}`}>
                      {item}
                    </div>
                  ))}
                </div>
                <div className="col-span-9 space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { l: 'Total Leads', v: '2,847', t: '+18%' },
                      { l: 'Today', v: '142', t: '+24%' },
                      { l: 'Follow-ups', v: '38', t: '-5%' },
                      { l: 'Conversions', v: '973', t: '+22%' },
                    ].map((s) => (
                      <div key={s.l} className="bg-white rounded-md p-2.5 border border-slate-200">
                        <p className="text-[9px] text-slate-500 uppercase">{s.l}</p>
                        <p className="text-base font-bold text-slate-900 mt-0.5 font-mono">{s.v}</p>
                        <p className="text-[10px] text-emerald-600">{s.t}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded-md p-3 border border-slate-200">
                    <p className="text-[10px] text-slate-500 uppercase mb-2">Lead Trend</p>
                    <div className="flex items-end gap-1 h-16">
                      {[40, 55, 45, 70, 60, 80, 65, 90, 75, 100, 85, 95].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-gradient-to-t from-violet-600 to-violet-400 rounded-sm"
                          style={{ height: `${h}%` }}
                        ></div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Floating cards */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
              className="absolute -left-6 top-1/3 bg-white rounded-xl p-3 border border-slate-200 shadow-xl hidden md:flex items-center gap-2.5"
            >
              <div className="w-9 h-9 bg-emerald-100 rounded-md flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900">New Conversion</p>
                <p className="text-[10px] text-slate-500">+₹45,000</p>
              </div>
            </motion.div>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 4, repeat: Infinity, delay: 1 }}
              className="absolute -right-6 bottom-1/3 bg-white rounded-xl p-3 border border-slate-200 shadow-xl hidden md:flex items-center gap-2.5"
            >
              <div className="w-9 h-9 bg-violet-100 rounded-md flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900">AI Lead Score</p>
                <p className="text-[10px] text-slate-500">87% likely to convert</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="border-y border-slate-100 bg-slate-50/50 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-10">
            Trusted by 1,200+ teams across 9 industries
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8 items-center justify-items-center">
            {['Apex Sales', 'Bright Future', 'TechFlow', 'Skyline Realty', 'PulseClinic', 'GoFit'].map((logo) => (
              <div
                key={logo}
                className="text-base lg:text-lg font-semibold tracking-tight text-slate-400 hover:text-slate-700 transition-colors"
                style={{ fontFamily: 'Sora' }}
              >
                {logo}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Outcomes / Stats */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700 mb-3">Outcomes</p>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>
            Outcomes you can measure
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { num: '3×', label: 'Faster sales cycles', sub: 'Reported across 9 industries on LeadTrak' },
            { num: '60%', label: 'Lift in rep productivity', sub: 'Time freed from manual data entry' },
            { num: '₹2.4Cr', label: 'Additional revenue tracked', sub: 'In the first 6 months of going live' },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              viewport={{ once: true }}
              className="bg-gradient-to-br from-violet-50 to-white border border-violet-100 rounded-2xl p-8"
            >
              <p className="text-6xl font-bold text-violet-700 mb-3" style={{ fontFamily: 'Sora' }}>
                {stat.num}
              </p>
              <p className="text-base font-semibold text-slate-900 mb-2">{stat.label}</p>
              <p className="text-sm text-slate-500">{stat.sub}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features Bento Grid */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700 mb-3">Platform</p>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mb-4" style={{ fontFamily: 'Sora' }}>
            Everything your sales team needs
          </h2>
          <p className="text-lg text-slate-600">
            From first inquiry to closed deal, one platform that ties your entire team together — no matter your industry.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: Target, title: 'Smart Lead Pipeline', desc: 'Drag-and-drop pipeline with status-based automation. Never lose a lead again.', big: true },
            { icon: Sparkles, title: 'AI Lead Scoring', desc: 'Identify high-intent prospects automatically using behavioral signals.' },
            { icon: Calendar, title: 'Follow-up Automation', desc: 'Schedule, remind, and track every touchpoint.' },
            { icon: MessageSquare, title: 'WhatsApp Integration', desc: 'Click-to-WhatsApp with templates and bulk messaging.' },
            { icon: BarChart3, title: 'Real-time Reports', desc: 'Lead source ROI, rep performance, revenue analytics.', big: true },
            { icon: Shield, title: 'Role-based Access', desc: 'Granular permissions for every team member.' },
          ].map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                viewport={{ once: true }}
                className={`p-7 border border-slate-200 rounded-2xl bg-white hover:border-violet-300 hover:shadow-xl hover:shadow-violet-100 hover:-translate-y-1 transition-all duration-300 ${
                  feature.big ? 'lg:col-span-2' : ''
                }`}
              >
                <div className="w-12 h-12 bg-gradient-to-br from-violet-600 to-violet-800 rounded-xl flex items-center justify-center mb-5 shadow-lg shadow-violet-200">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Sora' }}>
                  {feature.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">{feature.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Industries Section */}
      <section id="industries" className="bg-gradient-to-br from-slate-50 to-violet-50/30 py-24 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700 mb-3">Industries</p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mb-4" style={{ fontFamily: 'Sora' }}>
              Pre-built for 9 industries
            </h2>
            <p className="text-lg text-slate-600">
              Pick your industry at signup — labels, pipelines, and lead sources are tuned for your business.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {INDUSTRIES.map((ind) => {
              const Icon = ind.icon;
              return (
                <button
                  key={ind.id}
                  onClick={() => setActiveIndustry(ind.id)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
                    activeIndustry === ind.id
                      ? 'bg-violet-700 text-white shadow-lg shadow-violet-200'
                      : 'bg-white text-slate-700 hover:bg-violet-50 border border-slate-200'
                  }`}
                  data-testid={`industry-tab-${ind.id}`}
                >
                  <Icon className="w-4 h-4" />
                  {ind.label}
                </button>
              );
            })}
          </div>

          <motion.div
            key={activeIndustry}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="grid md:grid-cols-2 gap-8 bg-white rounded-3xl p-8 lg:p-12 border border-slate-200 shadow-sm"
          >
            <div>
              <div className="inline-flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-lg bg-violet-100 border border-violet-200 flex items-center justify-center">
                  <CurrentIcon className="w-5 h-5 text-violet-700" />
                </div>
                <h3 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Sora' }}>
                  {currentIndustry.label}
                </h3>
              </div>
              <p className="text-base text-slate-600 leading-relaxed mb-8">
                {currentIndustry.desc}
              </p>
              <ul className="space-y-3 mb-8">
                {currentIndustry.stats.map((s, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center mt-0.5">
                      <CheckCircle2 className="w-3 h-3 text-violet-700" />
                    </div>
                    <span className="text-slate-700">{s}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => navigate('/register')}
                className="bg-slate-900 hover:bg-slate-800 text-white"
                data-testid={`industry-cta-${activeIndustry}`}
              >
                Explore {currentIndustry.label}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-violet-900 p-8 flex flex-col justify-between min-h-[280px] text-white">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                <span className="text-xs uppercase tracking-wider font-semibold">Pre-built workflow</span>
              </div>
              <div>
                <p className="text-4xl font-bold mb-2" style={{ fontFamily: 'Sora' }}>
                  Live in 5 min
                </p>
                <p className="text-violet-200 text-sm">
                  Plug-and-play templates designed for {currentIndustry.label.toLowerCase()}.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* AI Section */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700 mb-3">Artificial Intelligence</p>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mb-4" style={{ fontFamily: 'Sora' }}>
            AI built in. Not bolted on.
          </h2>
          <p className="text-lg text-slate-600">
            Predict intent, automate action, and capture every signal — automatically.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { icon: Sparkles, title: 'Smart Lead Scoring', desc: 'AI ranks every lead by conversion probability in real-time.' },
            { icon: Zap, title: 'Next Best Action', desc: 'Tells reps exactly what to do next on every lead.' },
            { icon: MessageSquare, title: 'Conversational AI', desc: 'Chatbots that qualify leads 24/7 on WhatsApp and web.' },
            { icon: TrendingUp, title: 'Predictive Forecasting', desc: 'Know your pipeline 30 days in advance.' },
          ].map((ai, i) => {
            const Icon = ai.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                viewport={{ once: true }}
                className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-7 text-white hover:scale-[1.02] transition-transform"
              >
                <div className="w-11 h-11 bg-violet-500/20 border border-violet-400/30 rounded-lg flex items-center justify-center mb-5 backdrop-blur">
                  <Icon className="w-5 h-5 text-violet-300" />
                </div>
                <h3 className="text-lg font-bold mb-2" style={{ fontFamily: 'Sora' }}>{ai.title}</h3>
                <p className="text-sm text-slate-300 leading-relaxed">{ai.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Testimonials */}
      <section id="customers" className="bg-slate-50 py-24 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700 mb-3">Customers</p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>
              Loved by teams everywhere
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { quote: 'We cut manual data entry by 70%. Our counselors now spend time on conversations, not spreadsheets.', name: 'Priya Sharma', role: 'Director, Bright Future Coaching (Education)' },
              { quote: 'Doubled our site-visit conversion rate in 3 months. The follow-up automations alone paid for the tool.', name: 'Rahul Mehta', role: 'COO, Skyline Realty (Real Estate)' },
              { quote: 'Finally a CRM that doesn\'t feel like it was built for someone else\'s business. We were live in a week.', name: 'Dr. Anjali Verma', role: 'Founder, PulseClinic (Healthcare)' },
            ].map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="bg-white rounded-2xl p-7 border border-slate-200 shadow-sm"
              >
                <div className="flex gap-0.5 mb-4">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-base text-slate-700 mb-6 leading-relaxed">"{t.quote}"</p>
                <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white font-bold text-sm">
                    {t.name.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="bg-gradient-to-br from-slate-900 via-violet-900 to-slate-900 rounded-3xl p-12 lg:p-16 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-10 right-10 w-72 h-72 bg-violet-500 rounded-full blur-3xl"></div>
          </div>
          <div className="relative grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300 mb-3">Security</p>
              <h2 className="text-4xl font-bold tracking-tight mb-4" style={{ fontFamily: 'Sora' }}>
                Enterprise-grade security
              </h2>
              <p className="text-violet-200 leading-relaxed">
                Your data is protected with AES-256 encryption, role-based access controls, and full audit trails. Compliant with global data privacy standards.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Lock, title: 'ISO 27001', desc: 'Certified' },
                { icon: Shield, title: 'DPDP Ready', desc: 'India compliant' },
                { icon: Award, title: 'SOC 2 Type II', desc: 'Audited' },
                { icon: Globe, title: 'GDPR', desc: 'EU compliant' },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={i} className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-5">
                    <Icon className="w-6 h-6 text-violet-300 mb-3" />
                    <p className="text-white font-bold text-sm">{s.title}</p>
                    <p className="text-violet-200 text-xs mt-0.5">{s.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700 mb-3">Pricing</p>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mb-4" style={{ fontFamily: 'Sora' }}>
            Plans that scale with you
          </h2>
          <p className="text-lg text-slate-600">No hidden fees. Switch plans anytime.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            { name: 'Starter', price: '₹999', desc: 'Small teams getting started', features: ['5 Users', '1,000 Leads', 'Basic Reports', 'Email Support'], popular: false },
            { name: 'Growth', price: '₹2,999', desc: 'Growing companies & SMBs', features: ['20 Users', '5,000 Leads', 'Advanced Reports', 'WhatsApp', 'Priority Support'], popular: true },
            { name: 'Enterprise', price: '₹9,999', desc: 'Large orgs & multi-branch', features: ['Unlimited Users', 'Unlimited Leads', 'Custom Reports', 'All Integrations', '24/7 Support'], popular: false },
          ].map((plan, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              viewport={{ once: true }}
              className={`relative p-8 rounded-2xl ${
                plan.popular
                  ? 'bg-gradient-to-br from-violet-700 to-violet-900 text-white shadow-2xl shadow-violet-300/40 scale-105'
                  : 'bg-white border border-slate-200'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-violet-700 text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                  Most popular
                </div>
              )}
              <h3 className={`text-2xl font-bold mb-2 ${plan.popular ? 'text-white' : 'text-slate-900'}`} style={{ fontFamily: 'Sora' }}>
                {plan.name}
              </h3>
              <p className={`text-sm mb-6 ${plan.popular ? 'text-violet-200' : 'text-slate-600'}`}>{plan.desc}</p>
              <div className="mb-6">
                <span className={`text-5xl font-bold ${plan.popular ? 'text-white' : 'text-slate-900'}`} style={{ fontFamily: 'Sora' }}>
                  {plan.price}
                </span>
                <span className={`text-sm ml-1 ${plan.popular ? 'text-violet-200' : 'text-slate-500'}`}>/mo</span>
              </div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((feat, j) => (
                  <li key={j} className={`flex items-center gap-2 text-sm ${plan.popular ? 'text-violet-100' : 'text-slate-700'}`}>
                    <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${plan.popular ? 'text-emerald-300' : 'text-emerald-500'}`} />
                    {feat}
                  </li>
                ))}
              </ul>
              <Button
                className={`w-full h-11 ${plan.popular ? 'bg-white text-violet-700 hover:bg-violet-50' : 'bg-violet-700 hover:bg-violet-800 text-white'}`}
                onClick={() => navigate('/register')}
                data-testid={`plan-${plan.name.toLowerCase()}-cta`}
              >
                Start free trial
              </Button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="bg-slate-900 rounded-3xl p-12 lg:p-20 text-center relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600 rounded-full mix-blend-multiply filter blur-3xl opacity-30"></div>
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-fuchsia-600 rounded-full mix-blend-multiply filter blur-3xl opacity-30"></div>
          </div>
          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-4" style={{ fontFamily: 'Sora' }}>
              Ready to convert more leads?
            </h2>
            <p className="text-lg text-slate-300 mb-8">
              Join 1,200+ teams across 9 industries using LeadTrak to grow faster.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                onClick={() => navigate('/register')}
                className="bg-white text-violet-700 hover:bg-violet-50 text-base px-8 h-12"
                data-testid="bottom-cta-btn"
              >
                Start free trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/login')}
                className="text-base px-8 h-12 border-white/30 text-white hover:bg-white/10"
              >
                Book a demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-violet-800 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white" style={{ fontFamily: 'Sora' }}>LeadTrak</span>
          </div>
          <p className="text-sm">© 2026 LeadTrak. The CRM for every industry.</p>
        </div>
      </footer>
    </div>
  );
}
