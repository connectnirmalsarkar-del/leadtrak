import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, formatApiErrorDetail } from '@/context/AuthContext';
import { GraduationCap, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    organization_name: '',
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.email, form.password, form.name, form.organization_name);
      toast.success('Account created successfully!');
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
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md space-y-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-blue-600 rounded-md flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold text-slate-900" style={{fontFamily: 'Outfit'}}>EduCRM</span>
          </Link>

          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{fontFamily: 'Outfit'}}>
              Create your account
            </h1>
            <p className="text-sm text-slate-600 mt-2">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium" data-testid="link-to-login">
                Sign in
              </Link>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium text-slate-700">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="h-11"
                data-testid="register-name-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="organization" className="text-sm font-medium text-slate-700">Organization Name</Label>
              <Input
                id="organization"
                type="text"
                placeholder="Bright Future Coaching Institute"
                value={form.organization_name}
                onChange={(e) => setForm({ ...form, organization_name: e.target.value })}
                required
                className="h-11"
                data-testid="register-org-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-slate-700">Work Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                className="h-11"
                data-testid="register-email-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-slate-700">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min. 8 characters"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
                className="h-11"
                data-testid="register-password-input"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700" data-testid="register-error">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white"
              disabled={loading}
              data-testid="register-submit-btn"
            >
              {loading ? 'Creating account...' : 'Create account'}
              {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </form>

          <p className="text-xs text-slate-500 text-center">
            By signing up, you agree to our Terms and Privacy Policy.
          </p>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 bg-slate-900 items-center justify-center p-12 relative overflow-hidden">
        <div className="relative z-10 max-w-md text-white">
          <h2 className="text-4xl font-semibold tracking-tight mb-6" style={{fontFamily: 'Outfit'}}>
            Start your 14-day free trial.
          </h2>
          <p className="text-base text-slate-300 leading-relaxed mb-8">
            Everything you need to manage admissions in one platform. No credit card required.
          </p>
          <ul className="space-y-3">
            {[
              'Capture and manage unlimited leads',
              'Automate follow-up reminders',
              'Track admissions and revenue',
              'Get real-time team performance',
              'Integrate WhatsApp and Facebook Ads',
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-20 w-72 h-72 bg-blue-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-72 h-72 bg-indigo-500 rounded-full blur-3xl"></div>
        </div>
      </div>
    </div>
  );
}
