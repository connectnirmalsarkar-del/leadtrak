import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, formatApiErrorDetail } from '@/context/AuthContext';
import { GraduationCap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md space-y-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-violet-600 to-violet-800 rounded-lg flex items-center justify-center shadow-lg shadow-violet-200">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900" style={{fontFamily: 'Sora'}}>EduCRM</span>
          </Link>

          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{fontFamily: 'Sora'}}>
              Welcome back
            </h1>
            <p className="text-sm text-slate-600 mt-2">
              Don't have an account?{' '}
              <Link to="/register" className="text-violet-700 hover:text-violet-800 font-medium" data-testid="link-to-register">
                Sign up
              </Link>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-slate-700">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
                data-testid="login-email-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-slate-700">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
                data-testid="login-password-input"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700" data-testid="login-error">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 bg-violet-700 hover:bg-violet-800 text-white shadow-lg shadow-violet-200"
              disabled={loading}
              data-testid="login-submit-btn"
            >
              {loading ? 'Signing in...' : 'Sign in'}
              {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </form>

          <div className="border-t border-slate-200 pt-6">
            <p className="text-xs text-slate-500 text-center">
              Default Super Admin: admin@educationcrm.com / Admin@123
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Image/Brand */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-slate-900 via-violet-900 to-slate-900 items-center justify-center p-12 relative overflow-hidden">
        <div className="relative z-10 max-w-md text-white">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-violet-500/20 border border-violet-400/30 rounded-full mb-6 backdrop-blur">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">Trusted by 500+ institutions</span>
          </div>
          <h2 className="text-4xl font-bold tracking-tight mb-4" style={{fontFamily: 'Sora'}}>
            Convert more leads into admissions.
          </h2>
          <p className="text-base text-slate-300 leading-relaxed">
            EduCRM is the all-in-one lead management platform built specifically for schools, colleges, and coaching institutes.
          </p>

          <div className="mt-12 grid grid-cols-2 gap-6">
            <div>
              <p className="text-4xl font-bold" style={{fontFamily: 'Sora'}}>2.5x</p>
              <p className="text-sm text-slate-400 mt-1">Conversion increase</p>
            </div>
            <div>
              <p className="text-4xl font-bold" style={{fontFamily: 'Sora'}}>70%</p>
              <p className="text-sm text-slate-400 mt-1">Time saved on follow-ups</p>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-20 w-72 h-72 bg-blue-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-72 h-72 bg-indigo-500 rounded-full blur-3xl"></div>
        </div>
      </div>
    </div>
  );
}
