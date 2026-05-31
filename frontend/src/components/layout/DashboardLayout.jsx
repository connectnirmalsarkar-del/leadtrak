import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Calendar,
  GraduationCap,
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  { path: '/leads', label: 'Leads', icon: UserPlus, testId: 'nav-leads' },
  { path: '/followups', label: 'Follow-ups', icon: Calendar, testId: 'nav-followups' },
  { path: '/admissions', label: 'Admissions', icon: GraduationCap, testId: 'nav-admissions' },
  { path: '/tasks', label: 'Tasks', icon: CheckSquare, testId: 'nav-tasks' },
  { path: '/whatsapp-templates', label: 'WhatsApp', icon: MessageSquare, testId: 'nav-whatsapp' },
  { path: '/reports', label: 'Reports', icon: BarChart3, testId: 'nav-reports' },
];

const adminNavItems = [
  { path: '/users', label: 'Team Members', icon: Users, testId: 'nav-users' },
  { path: '/lead-widget', label: 'Lead Widget', icon: Globe, testId: 'nav-widget' },
  { path: '/activity-logs', label: 'Activity Logs', icon: History, testId: 'nav-activity' },
  { path: '/subscription', label: 'Subscription', icon: CreditCard, testId: 'nav-subscription' },
  { path: '/settings', label: 'Settings', icon: Settings, testId: 'nav-settings' },
];

const platformNavItems = [
  { path: '/platform/organizations', label: 'Organizations', icon: Layers, testId: 'nav-platform-orgs' },
];

const supportNavItem = { path: '/support', label: 'Support', icon: LifeBuoy, testId: 'nav-support' };

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        className={`fixed left-0 top-0 z-40 h-screen w-64 bg-slate-900 text-white transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        data-testid="dashboard-sidebar"
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-violet-600 to-violet-800 rounded-lg flex items-center justify-center shadow-lg shadow-violet-900/50">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight" style={{fontFamily: 'Sora'}}>EduCRM</span>
          </div>
          <button
            className="lg:hidden text-slate-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
            data-testid="sidebar-close-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="px-4 py-6 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 px-4 mb-2">Main</p>
          {navItems.map((item) => {
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
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Building2 className="w-4 h-4" />
              <span data-testid="org-name">Organization</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" data-testid="notifications-btn">
              <Bell className="w-5 h-5 text-slate-600" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 hover:bg-slate-50 rounded-md p-1.5 transition-colors" data-testid="user-menu-btn">
                  <Avatar className="w-8 h-8">
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
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
