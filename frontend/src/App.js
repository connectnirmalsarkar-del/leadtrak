import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Toaster } from '@/components/ui/sonner';

import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import DashboardPage from '@/pages/DashboardPage';
import LeadsPage from '@/pages/LeadsPage';
import FollowupsPage from '@/pages/FollowupsPage';
import AdmissionsPage from '@/pages/AdmissionsPage';
import TasksPage from '@/pages/TasksPage';
import ReportsPage from '@/pages/ReportsPage';
import UsersPage from '@/pages/UsersPage';
import SettingsPage from '@/pages/SettingsPage';
import SubscriptionPage from '@/pages/SubscriptionPage';
import WhatsAppTemplatesPage from '@/pages/WhatsAppTemplatesPage';
import ActivityLogsPage from '@/pages/ActivityLogsPage';
import LeadWidgetPage from '@/pages/LeadWidgetPage';
import PlatformOrgsPage from '@/pages/PlatformOrgsPage';
import SupportTicketsPage from '@/pages/SupportTicketsPage';
import ServicesPage from '@/pages/ServicesPage';
import IntegrationsPage from '@/pages/IntegrationsPage';
import DemosPage from '@/pages/DemosPage';
import DashboardLayout from '@/components/layout/DashboardLayout';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading || user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading || user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/leads" element={<ProtectedRoute><LeadsPage /></ProtectedRoute>} />
          <Route path="/followups" element={<ProtectedRoute><FollowupsPage /></ProtectedRoute>} />
          <Route path="/admissions" element={<ProtectedRoute><AdmissionsPage /></ProtectedRoute>} />
          <Route path="/tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/subscription" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
          <Route path="/whatsapp-templates" element={<ProtectedRoute><WhatsAppTemplatesPage /></ProtectedRoute>} />
          <Route path="/activity-logs" element={<ProtectedRoute><ActivityLogsPage /></ProtectedRoute>} />
          <Route path="/lead-widget" element={<ProtectedRoute><LeadWidgetPage /></ProtectedRoute>} />
          <Route path="/platform/organizations" element={<ProtectedRoute><PlatformOrgsPage /></ProtectedRoute>} />
          <Route path="/support" element={<ProtectedRoute><SupportTicketsPage /></ProtectedRoute>} />
          <Route path="/services" element={<ProtectedRoute><ServicesPage /></ProtectedRoute>} />
          <Route path="/integrations" element={<ProtectedRoute><IntegrationsPage /></ProtectedRoute>} />
          <Route path="/demos" element={<ProtectedRoute><DemosPage /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
