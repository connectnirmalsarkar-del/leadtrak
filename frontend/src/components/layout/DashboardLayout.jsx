import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth, API } from '@/context/AuthContext';
import { usePWABadge } from '@/hooks/usePWABadge';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Calendar,
  CheckSquare,
  BarChart3,
  Settings,
  CreditCard,
  LogOut,
  Bell,
  Menu,
  X,
  Building2,
  MessageSquare,
  History,
  Globe,
  LifeBuoy,
  Layers,
  Trophy,
  Zap,
  Tag,
  Video,
  MapPin,
  Activity,
  Sparkles,
  AlertTriangle,
  UserCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTerminology } from '@/lib/terminology';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';
import InstallPWAPrompt from '@/components/pwa/InstallPWAPrompt';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, testId: 'nav-dashboard' },
  { path: '/leads', labelKey: 'leads', fallback: 'Leads', icon: UserPlus, testId: 'nav-leads' },
  { path: '/followups', label: 'Follow-ups', icon: Calendar, testId: 'nav-followups' },
  { path: '/demos', label: 'Demos', icon: Video, testId: 'nav-demos', feature: 'demos' },
  { path: '/admissions', labelKey: 'conversions', fallback: 'Conversions', icon: Trophy, testId: 'nav-admissions', feature: 'admissions' },
  { path: '/tasks', label: 'Tasks', icon: CheckSquare, testId: 'nav-tasks' },
  { path: '/whatsapp-templates', label: 'WhatsApp', icon: MessageSquare, testId: 'nav-whatsapp' },
  { path: '/reports', label: 'Reports', icon: BarChart3, testId: 'nav-reports', rolesHidden: ['counselor', 'telecaller'] },
];

const adminNavItems = [
  { path: '/users', label: 'Team Members', icon: Users, testId: 'nav-users' },
  { path: '/services', label: 'Services & Pricing', icon: Tag, testId: 'nav-services' },
  { path: '/integrations', label: 'Integrations', icon: Layers, testId: 'nav-integrations' },
  { path: '/integrations/webhooks', label: 'Webhook Health', icon: Activity, testId: 'nav-webhook-health' },
  { path: '/lead-widget', label: 'Lead Widget', icon: Globe, testId: 'nav-widget' },
  { path: '/activity-logs', label: 'Activity Logs', icon: History, testId: 'nav-activity' },
  { path: '/subscription', label: 'Subscription', icon: CreditCard, testId: 'nav-subscription' },
  { path: '/settings', label: 'Settings', icon: Settings, testId: 'nav-settings' },
];

const platformNavItems = [
  { path: '/platform/organizations', label: 'Organizations', icon: Layers, testId: 'nav-platform-orgs' },
  { path: '/platform/locations', label: 'Locations', icon: MapPin, testId: 'nav-platform-locations' },
];

const supportNavItem = { path: '/support', label: 'Support', icon: LifeBuoy, testId: 'nav-support' };

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const t = useTerminology();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [newLeadsCount, setNewLeadsCount] = useState(0);
  const knownNotifIdsRef = useRef(new Set());
  const isFirstLoadRef = useRef(true);

  // Keep the PWA home-screen icon badge in sync (Android Chrome / Desktop Chrome / Edge)
  usePWABadge(30000, !!user);

  useEffect(() => {
    if (!user) return;
    const fetchSub = async () => {
      try {
        const { data } = await axios.get(`${API}/subscription/status`);
        setSubscription(data);
      } catch (e) {
        // silent
      }
    };
    fetchSub();
    const id = setInterval(fetchSub, 5 * 60 * 1000); // every 5 minutes
    return () => clearInterval(id);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchNotifs = async () => {
      try {
        const { data } = await axios.get(`${API}/notifications`);
        // Detect newly arrived notifications since last poll → toast popup
        if (!isFirstLoadRef.current) {
          const fresh = data.filter((n) => !knownNotifIdsRef.current.has(n._id) && !n.read);
          fresh.slice(0, 3).forEach((n) => {
            const description = {
              lead_assigned: 'New lead assigned',
              lead_transferred: 'Lead transferred to you',
              lead_comment: 'New comment on your lead',
              task_assigned: 'New task assigned',
            }[n.type] || 'New notification';
            toast(n.message, { description, icon: '🔔' });
          });
        }
        knownNotifIdsRef.current = new Set(data.map((n) => n._id));
        isFirstLoadRef.current = false;
        setNotifications(data);
      } catch (e) {
        // silent
      }
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 15000); // 15-sec near-real-time polling
    return () => clearInterval(interval);
  }, [user]);

  // Poll "new leads to call" count (assigned + status==New) every 30 sec
  useEffect(() => {
    if (!user) return;
    const fetchNewLeads = async () => {
      try {
        const { data } = await axios.get(`${API}/leads/my/new-count`);
        setNewLeadsCount(data.count || 0);
      } catch (e) {
        // silent
      }
    };
    fetchNewLeads();
    const id = setInterval(fetchNewLeads, 30000);
    return () => clearInterval(id);
  }, [user, location.pathname]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(unread.map((n) => axios.put(`${API}/notifications/${n._id}/read`).catch(() => {})));
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
  };

  const openNotif = async (notif) => {
    if (!notif.read) {
      await axios.put(`${API}/notifications/${notif._id}/read`).catch(() => {});
    }
    setShowNotifPanel(false);
    if (notif.type === 'ticket_status' || notif.type === 'ticket_reply') {
      navigate('/support');
    } else if (notif.type === 'lead_assigned' || notif.type === 'lead_transferred') {
      // Deep-link to specific lead if backend included lead_id, else open Leads list
      navigate(notif.lead_id ? `/leads?leadId=${notif.lead_id}` : '/leads');
    } else if (notif.type === 'task_assigned') {
      navigate('/tasks');
    } else if (notif.type === 'lead_comment') {
      navigate(notif.lead_id ? `/leads?leadId=${notif.lead_id}` : '/leads');
    }
  };

  const isAdmin = user && ['super_admin', 'org_admin', 'manager'].includes(user.role);
  const isSuperAdmin = user && user.role === 'super_admin';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userInitials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          data-testid="sidebar-overlay"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 h-screen w-64 bg-slate-900 text-white transition-transform duration-200 lg:translate-x-0 pt-safe pb-safe ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        data-testid="dashboard-sidebar"
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <img src="/logo-dark.png?v=3" alt="Leadtrak" className="h-[38px] w-auto" data-testid="header-logo" />
          </div>
          <button
            className="lg:hidden text-slate-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
            data-testid="sidebar-close-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="px-4 py-6 space-y-1 overflow-y-auto h-[calc(100vh-4rem)] custom-scrollbar">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 px-4 mb-2">Main</p>
          {navItems
            .filter((item) => !item.feature || user?.features?.[item.feature] !== false)
            .filter((item) => !item.rolesHidden || !item.rolesHidden.includes(user?.role))
            .map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            let labelText = item.labelKey ? (t[item.labelKey] || item.fallback) : item.label;
            // Industry-specific override for the Demos nav (Counselling / Site Visits / etc.)
            if (item.path === '/demos' && user?.features?.demo_label) {
              labelText = user.features.demo_label;
            }
            const showBadge = item.path === '/leads' && newLeadsCount > 0;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
                data-testid={item.testId}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm flex-1">{labelText}</span>
                {showBadge && (
                  <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center" data-testid="new-leads-badge">
                    {newLeadsCount > 99 ? '99+' : newLeadsCount}
                  </span>
                )}
              </NavLink>
            );
          })}

          {isAdmin && (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 px-4 mb-2 mt-6">Admin</p>
              {adminNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => setSidebarOpen(false)}
                    data-testid={item.testId}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm">{item.label}</span>
                  </NavLink>
                );
              })}
            </>
          )}

          {/* Platform (super admin only) */}
          {isSuperAdmin && (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400 px-4 mb-2 mt-6">Platform</p>
              {platformNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => setSidebarOpen(false)}
                    data-testid={item.testId}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm">{item.label}</span>
                  </NavLink>
                );
              })}
            </>
          )}

          {/* Support — visible to everyone */}
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 px-4 mb-2 mt-6">Help</p>
          <NavLink
            to={supportNavItem.path}
            className={`sidebar-nav-item ${location.pathname === supportNavItem.path ? 'active' : ''}`}
            onClick={() => setSidebarOpen(false)}
            data-testid={supportNavItem.testId}
          >
            <supportNavItem.icon className="w-4 h-4" />
            <span className="text-sm">{supportNavItem.label}</span>
          </NavLink>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-64">
        {/* Spacer for iOS PWA notch — only visible on mobile (where sticky header sits at very top) */}
        <div className="lg:hidden h-safe-top bg-white sticky top-0 z-30"></div>
        {/* Impersonation banner — Super Admin acting AS a tenant user */}
        {user?.impersonating && (
          <div className="bg-amber-500 text-amber-950 px-4 py-2 text-sm font-medium flex items-center justify-between gap-3 sticky top-0 z-30 lg:pt-0 pt-safe" data-testid="impersonation-banner">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
              <span>Impersonating <strong>{user.email}</strong> · {user.organization_name}</span>
            </div>
            <button
              onClick={async () => {
                await axios.post(`${API}/auth/logout`).catch(() => {});
                window.location.href = '/login';
              }}
              className="bg-amber-950 text-amber-50 hover:bg-amber-900 px-3 py-1 rounded text-xs font-semibold"
              data-testid="exit-impersonation-btn"
            >
              Exit Impersonation
            </button>
          </div>
        )}
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden text-slate-600"
              onClick={() => setSidebarOpen(true)}
              data-testid="sidebar-open-btn"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5 text-base text-slate-700">
              {user?.logo_url ? (
                <img src={user.logo_url} alt="" className="w-8 h-8 rounded object-contain bg-white border border-slate-200" data-testid="topbar-org-logo" />
              ) : (
                <Building2 className="w-5 h-5" />
              )}
              <span className="font-medium" data-testid="org-name">{user?.organization_name || 'Organization'}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Subscription badge — visible to org users (not super admin own-org) */}
            {subscription && user?.role !== 'super_admin' && subscription.days_remaining !== null && subscription.days_remaining !== undefined && (() => {
              const status = subscription.status;
              const days = subscription.days_remaining;
              const isTrial = status === 'trial';
              const isExpired = status === 'expired';
              const isWarning = days !== null && days <= 7 && !isExpired;
              const cls = isExpired
                ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                : isWarning
                  ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                  : isTrial
                    ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
              const Icon = isExpired ? AlertTriangle : isTrial ? Sparkles : CreditCard;
              const label = isExpired
                ? 'Expired — Renew'
                : isTrial
                  ? `Trial · ${days}d left`
                  : `${(subscription.plan || '').toString().charAt(0).toUpperCase() + (subscription.plan || '').toString().slice(1)} · ${days}d`;
              return (
                <button
                  onClick={() => navigate('/subscription')}
                  className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${cls}`}
                  data-testid="header-subscription-badge"
                  title={subscription.end_date ? `Expires ${new Date(subscription.end_date).toLocaleDateString()}` : ''}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span data-testid="subscription-badge-label">{label}</span>
                </button>
              );
            })()}

            <div className="relative">
              <Button variant="ghost" size="icon" onClick={() => setShowNotifPanel(!showNotifPanel)} data-testid="notifications-btn">
                <Bell className="w-5 h-5 text-slate-600" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center" data-testid="notif-badge">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
              {showNotifPanel && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowNotifPanel(false)}></div>
                  <div className="absolute right-0 top-12 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-[480px] overflow-hidden flex flex-col" data-testid="notif-panel">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                      <p className="text-sm font-semibold text-slate-900">Notifications</p>
                      {unreadCount > 0 && (
                        <button onClick={markAllRead} className="text-xs text-violet-700 hover:text-violet-800 font-medium" data-testid="mark-all-read-btn">Mark all read</button>
                      )}
                    </div>
                    <div className="overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="py-8 px-4 text-center text-sm text-slate-400">No notifications</div>
                      ) : (
                        notifications.slice(0, 20).map((n) => (
                          <button
                            key={n._id}
                            onClick={() => openNotif(n)}
                            className={`w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 ${!n.read ? 'bg-violet-50/40' : ''}`}
                            data-testid={`notif-${n._id}`}
                          >
                            <div className="flex items-start gap-2">
                              {!n.read && <span className="w-2 h-2 rounded-full bg-violet-600 mt-1.5 flex-shrink-0"></span>}
                              <p className={`text-xs ${n.read ? 'text-slate-600' : 'text-slate-900 font-medium'} flex-1`}>{n.message}</p>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 hover:bg-slate-50 rounded-md p-1.5 transition-colors" data-testid="user-menu-btn">
                  <Avatar className="w-8 h-8">
                    {user?.avatar_url && <AvatarImage src={user.avatar_url} alt={user?.name || ''} />}
                    <AvatarFallback className="bg-gradient-to-br from-violet-600 to-violet-800 text-white text-xs font-semibold">{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="text-left hidden sm:block">
                    <p className="text-sm font-medium text-slate-900">{user?.name}</p>
                    <p className="text-xs text-slate-500 capitalize">{user?.role?.replace('_', ' ')}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')} data-testid="menu-profile">
                  <UserCircle className="w-4 h-4 mr-2" />
                  My Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings')} data-testid="menu-settings">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-3 sm:p-6 max-w-full overflow-x-hidden">{children}</main>
      </div>
      <OnboardingWizard />
      <InstallPWAPrompt />
    </div>
  );
}
