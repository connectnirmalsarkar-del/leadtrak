# Education CRM SaaS - Product Requirements Document

## Original Problem Statement
Build a modern SaaS-based Education CRM and Lead Management System similar to LeadSquared, specifically designed for Schools, Colleges, Universities, Coaching Institutes, Educational Consultancies, and Admission Agencies. Multi-tenant SaaS architecture where multiple organizations can register and use their own isolated workspace.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + ShadCN UI + Recharts
- **Backend**: FastAPI + Motor (async MongoDB)
- **Database**: MongoDB (multi-tenant data isolation via `organization_id`)
- **Auth**: JWT with httpOnly cookies (Secure + SameSite=None for cross-origin)
- **Design**: Swiss & High-Contrast (Outfit + IBM Plex Sans fonts, professional blue palette)

## User Personas
1. **Super Admin** - Platform owner managing organizations, plans, payments
2. **Org Admin** - Institution owner managing their workspace (team, leads, billing)
3. **Manager** - Team lead assigning leads, monitoring performance
4. **Counselor** - Front-line staff updating leads, follow-ups, admissions
5. **Telecaller** - Calling team logging remarks, scheduling callbacks

## Core Requirements (Static)
- Multi-tenant SaaS isolation (each org = separate workspace)
- 5 user roles with RBAC
- Lead lifecycle: New → Contacted → Interested → Follow-up → Admission/Lost
- Follow-up management (today, upcoming, missed)
- Admission tracking with revenue reports
- Subscription plans: Starter, Growth, Enterprise
- 1000+ organization scale support

## What's Been Implemented (2026-02-15)

### Backend (server.py)
- ✅ JWT authentication with httpOnly cookies (Secure+SameSite=None for HTTPS)
- ✅ Multi-tenant data isolation via `organization_id` on all collections
- ✅ Brute force protection (5 attempts/15min, email-based key)
- ✅ Admin seeding (admin@educationcrm.com / Admin@123)
- ✅ Auth endpoints: register, login, logout, me, refresh, forgot/reset password
- ✅ Dashboard endpoints: stats, lead-sources chart, monthly-trend chart
- ✅ Lead CRUD with filters (status, source, search) + assign
- ✅ Followups: create, list (today/upcoming/missed), mark complete
- ✅ Admissions: create, list, auto-update lead status
- ✅ Tasks: create, list, update (kanban-style status)
- ✅ Lead Sources: custom source management
- ✅ Users: create with temp password, list, update, delete (admin only)
- ✅ Organization: get, update profile
- ✅ Subscription plans (Starter/Growth/Enterprise) seeded
- ✅ Razorpay order creation endpoint (placeholder keys, requires real keys)
- ✅ Reports: lead-summary, revenue
- ✅ Notifications: list, mark as read
- ✅ Facebook Lead Ads webhook endpoint (structure ready)
- ✅ Twilio WhatsApp send endpoint (placeholder, requires real credentials)

### Frontend
- ✅ Landing Page (hero, features, pricing, testimonials, CTA)
- ✅ Login/Register pages (split-screen design)
- ✅ Dashboard Layout (dark sidebar, topbar with user menu)
- ✅ Dashboard with stat cards, line/pie charts (Recharts)
- ✅ Leads page with table + right-drawer detail (Shadcn Sheet)
- ✅ Followups page with tabs (today/upcoming/missed)
- ✅ Admissions page with revenue cards
- ✅ Tasks page with kanban-style columns
- ✅ Reports page with charts + export buttons (placeholder)
- ✅ Users (Team Members) page with role-based table
- ✅ Settings page (organization, lead sources, integrations tabs)
- ✅ Subscription page with plan cards + billing toggle
- ✅ AuthContext + ProtectedRoute
- ✅ data-testid on all interactive elements

### Testing Results (Iteration 1)
- Backend: 24/25 tests passing (96%)
- Critical bug fixed: `current_user['id']` KeyError
- Critical bug fixed: Brute force protection now keyed by email (was IP behind ingress)

## Prioritized Backlog

### P0 (Required for production)
- ⏳ Real Razorpay API keys + webhook signature verification
- ⏳ Real Twilio credentials for WhatsApp
- ⏳ Facebook App credentials + Meta Lead Ads webhook signature verification
- ⏳ Email service (SendGrid/Resend) for password reset emails

### P1 (Important enhancements)
- ⏳ Excel/PDF export for reports
- ⏳ Pagination for leads/followups (currently capped at 1000)
- ⏳ User profile/avatar uploads
- ⏳ Organization logo upload
- ⏳ Activity logs and login history
- ⏳ WhatsApp message templates
- ⏳ Bulk lead import (CSV)

### P2 (Future enhancements)
- ⏳ Mobile app
- ⏳ Advanced analytics (cohort analysis, attribution)
- ⏳ Custom report builder
- ⏳ Workflow automation (drip campaigns)
- ⏳ SMS notifications
- ⏳ Calendar sync (Google Calendar)

## Next Tasks
1. Get real Razorpay keys and complete payment flow with verification
2. Configure Twilio for WhatsApp messaging
3. Add Excel/PDF export functionality to reports
4. Implement organization logo upload using object storage
5. Add lead bulk import via CSV
