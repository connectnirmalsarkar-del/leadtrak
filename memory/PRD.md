# SaaS CRM Platform — Product Requirements Document

## Original Problem Statement
Build a modern SaaS-based Education CRM and Lead Management System similar to LeadSquared, originally targeting Schools/Colleges/Coaching Institutes. **As of 2026-05-31 the product is evolving into a multi-industry CRM** capable of serving Education, IT/Software, Real Estate, Healthcare, Insurance, Travel, Retail, Fitness, and Generic Sales businesses — all via configurable industry templates while keeping the same multi-tenant core.

## Architecture
- **Frontend**: React 19 + Tailwind + ShadCN UI + Framer Motion + Recharts + PWA
- **Backend**: FastAPI + Motor (async MongoDB) — currently monolithic `server.py` (~1888 lines)
- **Database**: MongoDB (multi-tenant data isolation via `organization_id`)
- **Auth**: JWT with httpOnly cookies (Secure + SameSite=None)
- **Object Storage**: Cloudinary (ticket attachments, ready to extend to org logo/avatars)
- **Design**: LeadSquared-inspired dark purple theme + Sora font, dense enterprise layout

## User Personas
1. **Super Admin** — Platform owner managing organizations, plans, payments
2. **Org Admin** — Tenant owner managing their workspace (team, leads, billing)
3. **Manager** — Team lead assigning leads, monitoring performance
4. **Counselor / Sales Rep** — Front-line staff updating leads, follow-ups, conversions
5. **Telecaller** — Calling team logging remarks, scheduling callbacks

## Core Requirements (Static)
- Multi-tenant SaaS isolation (each org = separate workspace)
- 5 user roles with RBAC
- Lead lifecycle: New → Contacted → Interested → Follow-up → Won/Lost
- Follow-up management (today, upcoming, missed)
- Conversion tracking with revenue reports (Admissions in Education, Deals in IT, Bookings in Real Estate, etc.)
- Subscription plans: Starter, Growth, Enterprise
- 1000+ organization scale support

---

## What's Been Implemented

### Phase 1 — Core CRM (2026-02-15)
- ✅ JWT auth (httpOnly cookies, brute-force protection 5/15min, email-keyed)
- ✅ Multi-tenant isolation enforced on every read/write via `organization_id`
- ✅ Admin seed (`admin@educationcrm.com` / `Admin@123`)
- ✅ Auth: register, login, logout, me, refresh, forgot/reset password
- ✅ Dashboard: stats, lead-source chart, monthly-trend chart
- ✅ Leads CRUD + filters + assign
- ✅ Followups: create, list (today/upcoming/missed), mark complete
- ✅ Admissions: create, list, auto-update lead status
- ✅ Tasks: kanban-style CRUD
- ✅ Lead Sources, Campaigns, Users, Organization management
- ✅ Subscription plans seeded (Starter/Growth/Enterprise)
- ✅ Razorpay order creation (placeholder keys)
- ✅ Twilio WhatsApp endpoint (placeholder)
- ✅ Facebook Lead Ads webhook structure
- ✅ Reports: lead-summary, revenue
- ✅ Notifications: list, mark as read
- ✅ React UI: Landing, Auth, Dashboard, Leads, Followups, Admissions, Tasks, Reports, Users, Settings, Subscription
- ✅ Backend test pass rate 96% (24/25)

### Phase 2 — Enterprise Polish (2026-04-xx)
- ✅ UI redesign to "LeadSquared" enterprise standard (dark purple + Sora font, dense layouts)
- ✅ Book Demo + Login pages — mobile-responsive, premium redesign
- ✅ CSV import (openpyxl) + Excel export for Leads
- ✅ PWA setup (manifest.json + service-worker.js)
- ✅ Public Lead Capture Widget (`/api/widget/lead/{token}`)
- ✅ Super Admin Platform Organizations management

### Phase 3 — Support Ticket System with Cloudinary (2026-05-31) ✅ COMPLETE
- ✅ Cloudinary integration (keys configured in `.env`)
- ✅ POST `/api/uploads/ticket-attachment` — Cloudinary upload, validates mime type (JPG/PNG/WebP/PDF/Excel) + 200KB size cap
- ✅ POST `/api/support-tickets` — create with up to 5 attachments
- ✅ GET `/api/support-tickets` — role-based visibility (creator-only for manager/counselor/telecaller; org-wide for org_admin; cross-org for super_admin)
- ✅ POST `/api/support-tickets/{tid}/reply` — generates notification for creator when admin replies
- ✅ PUT `/api/support-tickets/{tid}/status` — sends resolution notification to creator
- ✅ DELETE `/api/support-tickets/{tid}/messages/{msg_id}` — super-admin-only reply deletion (also cleans Cloudinary blobs)
- ✅ Frontend `SupportTicketsPage.jsx` — full UI with file uploader, attachment previews, status dropdown, role-based controls
- ✅ Backend testing: 19/19 pytest tests passed (iteration_2.json)

### Phase 5 — Lead 360° Intelligence (2026-05-31) ✅ COMPLETE
- ✅ **`lead_timeline` collection** — every meaningful event auto-logged with actor, role, timestamp, payload
  - Events: `lead_created`, `status_changed`, `assigned`, `transferred`, `followup_added`, `admission_recorded`, `lead_lost`
  - Helper `log_lead_event()` wired into create/update/transfer/followup/admission flows
- ✅ **GET `/api/leads/{id}/timeline`** — chronological feed, tenant-isolated
- ✅ **Duplicate hard-block** — POST `/api/leads` returns 409 on mobile OR email match with existing_lead payload
- ✅ **GET `/api/leads/check-duplicate`** — live check used on Add Lead form blur
- ✅ **POST `/api/leads/{id}/transfer`** — RBAC enforced (only manager/org_admin/super_admin), logs `transferred` event with from/to/reason, notifies new assignee
- ✅ **Voice recording upload** — POST `/api/uploads/voice-recording` to Cloudinary (3 MB / 180 sec max, mime whitelist, role-gated)
- ✅ **Followup** model + endpoint extended with `voice_recording_url`, `voice_recording_public_id`, `voice_recording_duration`
- ✅ **Frontend `VoiceRecorder` component** (`/app/frontend/src/components/VoiceRecorder.jsx`) — MediaRecorder API, 3-min timer auto-stop, preview before upload, inline playback after upload
- ✅ **Frontend `LeadTimeline` component** (`/app/frontend/src/components/LeadTimeline.jsx`) — vertical event feed with color-coded icons per event type, audio playback inline
- ✅ **LeadsPage refactored** — Detail Sheet now has Details + Timeline tabs, Transfer dialog with reason field, Assigned-To row shows current owner + transfer button (manager+admin only), Add Lead form does live duplicate check on mobile/email blur with inline red warning and disabled submit
- ✅ **FollowupsPage cards** show inline voice playback when a voice note is attached
- ✅ Mongo indexes added: `leads(org_id, mobile)`, `leads(org_id, email)`, `lead_timeline(lead_id, created_at)`, `lead_timeline(org_id, created_at desc)`
- ✅ Backend testing: **60/60 tests passed** (24 new + 36 regression) — iteration_4.json

### Phase 4 — Multi-Industry Foundation + Rebrand (2026-05-31) ✅ COMPLETE
- ✅ 9 industry templates: Education, IT/Software, Real Estate, Healthcare, Insurance, Travel, Retail, Fitness, Generic
- ✅ `industry_config.py` central registry (terms, default sources/statuses/pipeline stages, icons, taglines)
- ✅ Organization schema extended with `industry` field; backfill migration runs on startup
- ✅ Registration flow accepts industry, validates, seeds default lead sources for the chosen industry
- ✅ `GET /api/industries` + `GET /api/industries/{key}` public catalog endpoints
- ✅ `PUT /api/organization/industry` (org_admin/super_admin) to switch templates later
- ✅ `/auth/login`, `/auth/register`, `/auth/me` now return `industry`, `terminology`, `organization_name`
- ✅ `GET /api/dashboard/funnel` last-stage label is industry-aware (Enrolled/Won/Booked/Issued/etc.)
- ✅ Frontend `useTerminology` hook (in `/app/frontend/src/lib/terminology.js`)
- ✅ Industry dropdown on Register page with tagline per option
- ✅ Sidebar nav (DashboardLayout) renders dynamic labels (Admissions → Deals/Bookings/Appointments)
- ✅ Dashboard, Leads, Admissions pages use dynamic terminology
- ✅ Topbar shows real organization name
- ✅ **Brand rename**: `EduCRM` → `LeadTrak` (Zap lightning icon, positioned as multi-industry CRM)
- ✅ **Landing page** fully rewritten: hero rotates through 6 industry personas (sales teams / admission counselors / real-estate brokers / clinic managers / gym owners / travel agents), 9-industry tabs section with icons, multi-industry testimonials, generic pricing tiers
- ✅ **Login page** repositioned: "Multi-Industry CRM Platform" pill, "Convert leads into customers" hero, 1,200+ teams stat
- ✅ **Register / Book-demo page**: "Hello revenue growth", multi-industry trust logos, multi-industry testimonial
- ✅ Backend testing: 36/36 pytest tests passed (17 new + 19 regression, iteration_3.json)
- ⏳ NOT YET DONE in Phase 4: Settings, FollowupsPage, TasksPage, Reports, WhatsAppTemplatesPage internal label updates

---

## Prioritized Backlog

### P0 — Multi-Industry Phase B & beyond
- ⏳ **Phase B — Custom Fields & Pipeline Builder**
  - Org Admin can add custom fields on leads (text, number, dropdown, date)
  - Drag-and-drop custom pipeline stages
  - Custom lead statuses & sources per org
  - On industry switch, optionally re-seed sources/statuses/pipeline
- ⏳ **Phase C — Module Toggle**
  - Org Admin can turn modules on/off (Admissions/Deals, WhatsApp, Reports, etc.)
- ⏳ **Phase D — Industry Dashboards**
  - Industry-specific KPIs and dashboard widgets
  - Migrate "Admission Done" lead status to a generic "Converted" + industry display label
- ⏳ Apply terminology to remaining pages (Followups, Tasks, Reports, Settings, Landing) + neutral brand

### P0 — External Integrations (need user keys)
- ⏳ Real Razorpay API keys + webhook signature verification
- ⏳ Real Twilio credentials for WhatsApp
- ⏳ Facebook App credentials + Meta Lead Ads webhook verification
- ⏳ Email service (SendGrid/Resend) for password reset + team invites

### P1 — Important Enhancements
- ⏳ Organization logo upload (extend Cloudinary)
- ⏳ User profile/avatar uploads
- ⏳ Pagination on leads/followups tables
- ⏳ Activity logs and login history page
- ⏳ WhatsApp message templates
- ⏳ Super Admin "Impersonate Tenant Admin" feature

### P2 — Future
- ⏳ Workflow automation (drip campaigns)
- ⏳ Custom report builder
- ⏳ Google Calendar sync
- ⏳ Mobile app
- ⏳ SMS notifications
- ⏳ Cohort analysis & attribution

---

## Next Tasks (in order)
1. Multi-industry Phase A — industry selector at signup + terminology mapping + per-industry defaults
2. Multi-industry Phase B — custom fields & pipeline builder
3. Multi-industry Phase C — module toggle
4. Multi-industry Phase D — industry-specific dashboards
5. Real Razorpay / Twilio / Facebook / Email keys integration
6. Pagination & profile/logo uploads

## Areas Needing Refactor
- `/app/backend/server.py` (1888 lines) — split into routers (auth, tickets, leads, etc.) when bandwidth permits.
- `ticket_no` generation via `count_documents` — switch to atomic counter to avoid race-condition duplicates.
- `PUT /api/support-tickets/{tid}/status` — add enum validation for status field.
