import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  Users,
  BarChart3,
  Calendar,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  Target,
  Zap,
  Shield,
  MessageSquare,
  CreditCard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-200 sticky top-0 bg-white/95 backdrop-blur-sm z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-blue-600 rounded-md flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold tracking-tight text-slate-900" style={{fontFamily: 'Outfit'}}>
              EduCRM
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-slate-600">
            <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-slate-900 transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-slate-900 transition-colors">Customers</a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate('/login')} data-testid="landing-login-btn">
              Sign in
            </Button>
            <Button onClick={() => navigate('/register')} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="landing-register-btn">
              Start free
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 pt-20 pb-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8 animate-fade-up">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-full">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                Built for Education
              </span>
            </div>
            <h1 className="text-5xl lg:text-6xl font-semibold tracking-tight text-slate-900 leading-[1.05]" style={{fontFamily: 'Outfit'}}>
              The Education CRM<br />
              <span className="text-blue-600">that converts.</span>
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed max-w-xl">
              Stop losing leads to spreadsheets. EduCRM helps schools, colleges, and coaching institutes capture every inquiry, automate follow-ups, and convert prospects into admissions.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                onClick={() => navigate('/register')}
                className="bg-blue-600 hover:bg-blue-700 text-white text-base px-8"
                data-testid="hero-cta-btn"
              >
                Start 14-day free trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/login')}
                className="text-base px-8 border-slate-300"
                data-testid="hero-demo-btn"
              >
                Sign in
              </Button>
            </div>
            <div className="flex items-center gap-6 pt-4 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                No credit card required
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Cancel anytime
              </div>
            </div>
          </div>

          {/* Hero Visual */}
          <div className="relative animate-fade-up stagger-2">
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 shadow-2xl">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-xs text-slate-400 ml-3 font-mono">educrm.app/dashboard</span>
              </div>
              <div className="bg-slate-50 rounded-md p-6 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Total Leads', value: '2,847', trend: '+18%' },
                    { label: 'Conversion', value: '34.2%', trend: '+5%' },
                    { label: 'Admissions', value: '973', trend: '+22%' },
                  ].map((stat, i) => (
                    <div key={i} className="bg-white rounded-md p-3 border border-slate-200">
                      <p className="text-xs text-slate-500 uppercase tracking-wider">{stat.label}</p>
                      <p className="text-xl font-semibold text-slate-900 mt-1 font-mono">{stat.value}</p>
                      <p className="text-xs text-emerald-600 mt-1">{stat.trend}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-md p-4 border border-slate-200">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Monthly Lead Trend</p>
                  <div className="flex items-end gap-2 h-20">
                    {[40, 65, 45, 80, 55, 90, 70, 95, 60, 100, 85, 75].map((h, i) => (
                      <div key={i} className="flex-1 bg-blue-500 rounded-sm" style={{ height: `${h}%` }}></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-6 -right-6 bg-white rounded-md p-4 border border-slate-200 shadow-lg w-56 hidden md:block">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-md flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">New Admission</p>
                  <p className="text-xs text-slate-500">+₹45,000 revenue</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="border-y border-slate-200 bg-slate-50 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-8">
            Trusted by educational institutions across India
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center justify-items-center text-slate-400">
            <div className="text-2xl font-semibold tracking-tight" style={{fontFamily: 'Outfit'}}>Apex Coaching</div>
            <div className="text-2xl font-semibold tracking-tight" style={{fontFamily: 'Outfit'}}>Bright Future</div>
            <div className="text-2xl font-semibold tracking-tight" style={{fontFamily: 'Outfit'}}>EduPath Univ.</div>
            <div className="text-2xl font-semibold tracking-tight" style={{fontFamily: 'Outfit'}}>SkillForge</div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 mb-3">Features</p>
          <h2 className="text-4xl font-semibold tracking-tight text-slate-900 mb-4" style={{fontFamily: 'Outfit'}}>
            Everything you need to run admissions
          </h2>
          <p className="text-base text-slate-600">
            From lead capture to enrollment, one platform that ties your entire admissions team together.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: Users, title: 'Multi-tenant SaaS', desc: 'Each organization gets its own isolated workspace with custom branding and user permissions.' },
            { icon: Target, title: 'Lead Management', desc: 'Capture, assign, and track leads through every stage of your admissions funnel.' },
            { icon: Calendar, title: 'Follow-up Automation', desc: 'Never miss a follow-up. Schedule reminders, send WhatsApp, and track every interaction.' },
            { icon: BarChart3, title: 'Real-time Reports', desc: 'Lead source analytics, conversion funnels, counselor performance—export to Excel or PDF.' },
            { icon: MessageSquare, title: 'WhatsApp Integration', desc: 'Click-to-WhatsApp, template messages, and follow-up automation built right in.' },
            { icon: Shield, title: 'Role-based Access', desc: 'Super admin, org admin, manager, counselor, telecaller—everyone sees what they need.' },
          ].map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div
                key={i}
                className="p-6 border border-slate-200 rounded-md bg-white hover:border-blue-300 hover:-translate-y-1 hover:shadow-sm transition-all duration-200"
              >
                <div className="w-10 h-10 bg-blue-50 rounded-md flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2" style={{fontFamily: 'Outfit'}}>{feature.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{feature.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="bg-slate-50 py-24 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 mb-3">Pricing</p>
            <h2 className="text-4xl font-semibold tracking-tight text-slate-900 mb-4" style={{fontFamily: 'Outfit'}}>
              Simple plans that scale with you
            </h2>
            <p className="text-base text-slate-600">No hidden fees. Switch plans anytime.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                name: 'Starter',
                price: '₹999',
                desc: 'Perfect for small coaching institutes',
                features: ['5 Users', '1,000 Leads', 'Basic Reports', 'Email Support'],
                cta: 'Start free trial',
                popular: false,
              },
              {
                name: 'Growth',
                price: '₹2,999',
                desc: 'For growing colleges and consultancies',
                features: ['20 Users', '5,000 Leads', 'Advanced Reports', 'WhatsApp Integration', 'Priority Support'],
                cta: 'Start free trial',
                popular: true,
              },
              {
                name: 'Enterprise',
                price: '₹9,999',
                desc: 'For universities and large institutions',
                features: ['Unlimited Users', 'Unlimited Leads', 'Custom Reports', 'All Integrations', '24/7 Support'],
                cta: 'Contact sales',
                popular: false,
              },
            ].map((plan, i) => (
              <div
                key={i}
                className={`relative p-8 bg-white rounded-md ${plan.popular ? 'border-2 border-blue-600 shadow-lg' : 'border border-slate-200'}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                    Most popular
                  </div>
                )}
                <h3 className="text-2xl font-semibold text-slate-900 mb-2" style={{fontFamily: 'Outfit'}}>{plan.name}</h3>
                <p className="text-sm text-slate-600 mb-6">{plan.desc}</p>
                <div className="mb-6">
                  <span className="text-4xl font-semibold text-slate-900" style={{fontFamily: 'Outfit'}}>{plan.price}</span>
                  <span className="text-sm text-slate-500">/month</span>
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
                  className={`w-full ${plan.popular ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                  variant={plan.popular ? 'default' : 'outline'}
                  onClick={() => navigate('/register')}
                  data-testid={`plan-${plan.name.toLowerCase()}-cta`}
                >
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="bg-slate-900 rounded-lg p-12 lg:p-16 text-center relative overflow-hidden">
          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="text-4xl font-semibold tracking-tight text-white mb-4" style={{fontFamily: 'Outfit'}}>
              Ready to transform your admissions?
            </h2>
            <p className="text-base text-slate-300 mb-8">
              Join hundreds of educational institutions using EduCRM to convert more leads into students.
            </p>
            <Button
              size="lg"
              onClick={() => navigate('/register')}
              className="bg-blue-600 hover:bg-blue-700 text-white text-base px-8"
              data-testid="bottom-cta-btn"
            >
              Get started free
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-semibold text-slate-900" style={{fontFamily: 'Outfit'}}>EduCRM</span>
          </div>
          <p className="text-sm text-slate-500">© 2026 EduCRM. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
