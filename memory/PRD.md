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

### Phase 8 — Demo Management + Rich Follow-up Completion (2026-05-31) ✅ COMPLETE

**Use case:** Enterprise sales (IT, agencies, real estate, healthcare) show **DEMOS** before closing. Caller and demo presenter are usually different people. Now fully supported.

**Backend additions:**
- ✅ `demos` collection + models (`DemoCreate`, `DemoComplete`)
- ✅ `POST /api/demos` — schedule with demo_owner_id, scheduled_date/time, demo_mode (Online/Onsite), demo_link, agenda. Logs `demo_scheduled` event. Notifies demo owner. **Returns `share` object with pre-built `whatsapp` (wa.me) + `mailto` URLs** so caller clicks once to send the pre-filled invite — no Twilio/SendGrid creds needed.
- ✅ `GET /api/demos?scope=mine|upcoming|completed|all` — caller visibility enforced (counselor/telecaller see only demos they own or scheduled)
- ✅ `GET /api/demos/{id}` — single demo + share links
- ✅ `POST /api/demos/{id}/complete` — demo presenter (or manager+) marks done with outcome (interested/not_interested/reschedule/no_show), feedback, recording URL. Logs `demo_completed` event. Auto-updates lead status: "interested" → Interested, "not_interested" → Lost.
- ✅ `POST /api/followups/{id}/complete` — **rich follow-up completion** capturing summary, voice recording, status change, AND next action (next_followup / book_demo / convert / lost / none) in ONE call. Generates all timeline events.
- ✅ `safe_object_id()` defensive wrapping continued in transfer / demo / followup endpoints.

**Frontend additions:**
- ✅ `BookDemoDialog` reusable component — 2-step UX: (1) form with demo presenter dropdown / date / time / mode / link / agenda → (2) **post-book share screen** with pre-filled invite + "Send WhatsApp" / "Send Email" buttons opening native apps with the message already typed
- ✅ "Book Demo" button on Lead Detail Sheet (next to WhatsApp & Follow-up)
- ✅ New `/demos` page with tabs (My Demos / Upcoming / Completed / All), card list showing lead, schedule, mode, demo presenter, scheduler, outcome
- ✅ "Mark Done" dialog: outcome dropdown, feedback notes, optional recording URL
- ✅ Sidebar "Demos" nav item between Follow-ups and Admissions
- ✅ `LeadTimeline` extended with `demo_scheduled` (fuchsia icon, shows presenter + link) + `demo_completed` (teal icon, shows outcome badge + feedback)

**Smoke-tested end-to-end:** Demo booked → pre-filled WhatsApp message generated ("Hi Demo — Ananya Banerjee, your demo is scheduled on 2026-05-31 at 11:00 (Online). Join here: https://meet.google.com/abc-defg-hij. Looking forward!") with one-click Send WhatsApp / Send Email buttons. Demos page shows the scheduled demo with Open + Mark Done actions.

### Phase 7 — Lead Distribution, Strict Visibility, Integrations Setup, Demo Timeline (2026-05-31) ✅ COMPLETE

**Bug fixes:**
- ✅ Add Lead form: "Service Interested In" now a **service dropdown** from the org's services catalog
- ✅ Record Deal form: replaced fresh student/mobile inputs with a **Lead picker dropdown** — selecting an existing lead from the pipeline auto-fills name/mobile and pre-selects matching service
- ✅ Route ordering bug: `/api/leads/csv-sample` was shadowed by `/api/leads/{lead_id}` → moved declaration earlier and applied `safe_object_id()` defensive wrapping to all `/leads/{id}/*` endpoints (get/update/delete/assign/transfer/timeline). Malformed IDs now return 400 instead of 500.

**New features:**
- ✅ **Strict caller-level lead visibility** — counselor & telecaller now see ONLY leads assigned to them (list, detail, timeline, today-followups). Managers/admins still see everything. Tenant isolation continues to apply on top.
- ✅ **Round-robin auto-distribute** — POST `/api/leads`, `/api/leads/import-csv`, `/api/widget/lead/{token}` all auto-assign across active counselor + telecaller using `organizations.last_assigned_user_id` rotation. 100 leads ÷ 5 callers → 20 each over time.
- ✅ **`auto_assign_enabled`** org-level toggle (ON by default). When OFF, unassigned leads stay unassigned.
- ✅ **CSV improvements** — duplicate skip by mobile/email, timeline event logged per row, notification to assignee, response now returns `{imported, skipped_duplicates, errors, distribution}`. UI shows distribution count in toast.
- ✅ **Sample CSV download** — `GET /api/leads/csv-sample` with header + 3 example rows. New "Sample CSV" button on LeadsPage.
- ✅ **Public widget endpoint** — round-robin assign + duplicate skip + synthetic timeline event (actor = "Website Widget · system").
- ✅ **Integrations storage** — `GET/PUT /api/organization/integrations` with Razorpay / Twilio WhatsApp / Facebook Lead Ads / Google Ads providers. Secrets masked on GET (`••••XXXX` + `_set: true` flag). Partial updates preserve other providers. Masked-echo (`••••`) silently dropped server-side.
- ✅ **Integrations UI** — new `/integrations` page (org_admin/super_admin only) with provider cards, connection status badges, setup dialogs per provider, "Where to find keys" docs links, Auto-assign toggle at top.
- ✅ **Notification polling** — DashboardLayout bell now polls every **15 sec**, shows **toast popup** for new notifications since last poll (near real-time for callers).
- ✅ **Demo timeline lead** — `seed_demo_timeline_lead()` auto-creates "Demo — Ananya Banerjee" on startup with 10 chronological events (lead_created · status_changed × 4 · followup_added × 3 · transferred · admission_recorded) so users can immediately see what a rich timeline looks like.

**Testing:** Backend **97/98 tests passed** initially, then route-ordering bug fix verified with curl (HTTP 200 on csv-sample, HTTP 400 on malformed lead_id). All Phase 6/5/4/3 regression green.

### Phase 6 — Services Catalog & Discount Workflow (2026-05-31) ✅ COMPLETE
- ✅ **`services` collection** + full CRUD endpoints (`GET/POST/PUT/DELETE /api/services`)
  - Fields: name, category, base_price, **min_price** (discount floor), description, duration, active toggle
  - RBAC: only manager/org_admin/super_admin can create/edit/delete
  - Validation: `min_price ≤ base_price` enforced on create + update
- ✅ **Industry-wise default services** auto-seeded at signup (5 per major industry)
  - Education: MBA/BBA/PGDM/MCA/BTech CSE
  - Real Estate: 1/2/3 BHK Apartment, Villa, Commercial
  - IT/Software: Website, Mobile App, Custom SaaS, DevOps, AMC
  - Healthcare, Insurance, Travel, Retail, Fitness all seeded
- ✅ **Existing orgs backfilled** via `seed_services_for_existing_orgs()` migration on startup
- ✅ **AdmissionCreate** model extended: `service_id`, `base_price`, `discount_amount` (Pydantic `Field(ge=0)`), `discount_reason`
- ✅ **Server-side authoritative pricing** — when `service_id` provided, backend recomputes `fees = base_price − discount` (ignores client-sent fees to prevent tampering)
- ✅ **Min-price floor hard-enforced** — POST `/api/admissions` returns 400 if `final_price < service.min_price`
- ✅ Timeline `admission_recorded` event now carries `base_price`, `discount_amount`, `discount_reason`, `offering` (service name)
- ✅ **Voice upload limits raised to 5 MB / 5 min** — better suited to "counselor records on phone → uploads from desktop" workflow
- ✅ **`safe_object_id()` helper** — malformed `ObjectId` strings now return 400 instead of 500 (hardening from code review)
- ✅ **Frontend `ServicesPage`** at `/services` — full CRUD UI with Add/Edit/Delete dialogs, base/min price columns, active toggle
- ✅ **Frontend `VoiceRecorder` rewritten** with tabbed UI — **Upload from phone (primary)** + **Record live (secondary)**
- ✅ **Frontend `AdmissionsPage` rewritten** — service dropdown from catalog, base-price auto-fill, discount input + reason field, live final-price preview (green/red below-floor warning), submit disabled when below floor
- ✅ Sidebar nav has new "Services & Pricing" item under Admin section
- ✅ Backend testing: **79/79 tests passed** (19 new + 60 prior regression) — iteration_5.json
- ✅ Post-test hardening: malformed-ObjectId 400, negative-discount 422, server-side fees recompute — all verified manually

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

### Completed 2026-05-31 — SaaS Billing & Subscription Management
- ✅ 14-day trial auto-activated on every org signup (register + platform-create)
- ✅ `subscription_orders` collection tracks every order (pending/paid/abandoned) with payment_method, receipt_no, recorded_by
- ✅ `GET /api/subscription/status` — tenant's plan, status, days_remaining for header badge
- ✅ Super Admin **Trial Report** — orgs in trial + days left + admin contact (`GET /api/platform/trial-report`)
- ✅ Super Admin **Abandoned Carts** — pending/abandoned orders with contact details (`GET /api/platform/abandoned-carts`)
- ✅ Super Admin **Manual Offline Payment** — cash/cheque/bank/UPI/other, extends subscription, generates receipt (`POST /api/platform/manual-payment`)
- ✅ Super Admin **Extend Trial** — grants additional trial days (`POST /api/platform/organizations/{id}/extend-trial`)
- ✅ PlatformOrgsPage rewritten with 4 tabs (Organizations / Trials / Abandoned / Orders) + dialogs
- ✅ Header **Subscription Badge** (days remaining, color-coded: violet=trial / amber=≤7d / red=expired)
- ✅ Dashboard Subscription Banner (top of page for trial/expiring/expired)
- ✅ Industry-specific Lead Status dropdowns (e.g. "Counseling Done", "Application Sent" for Education; "Proposal Sent", "Negotiation" for IT) — dynamic via `user.lead_statuses` from `/api/auth/me`
- ✅ 24/24 backend pytest pass (`/app/backend/tests/test_saas_billing.py`)

### Completed 2026-05-31 — Locations (State / City)
- ✅ Seeded `locations` collection with 36 Indian states/UTs and ~430+ default cities (`india_locations.py`, West Bengal alone has 186 cities)
- ✅ Public endpoints: `GET /api/locations/states`, `GET /api/locations/cities?state=…` — used by lead capture forms
- ✅ Super Admin CRUD: `GET /api/platform/locations`, `POST /api/platform/locations/cities`, `PUT /api/platform/locations/cities/{id}`, `DELETE /api/platform/locations/cities/{id}` with case-insensitive dedupe
- ✅ `seed_locations()` is **additive** — runs on every boot and only inserts new (state, city) pairs without touching existing entries
- ✅ Lead Add form: **State** and **City** are now cascading Select dropdowns (city options re-populate when state changes)
- ✅ New page **/platform/locations** for Super Admin — search, state filter, toggle active/inactive, edit, delete, custom vs default badges

### Completed 2026-05-31 — Reports: Caller / Manager / Total
- ✅ Reports page redesigned with **3 tabs** — Overview · By Caller · By Manager
- ✅ **Overview tab**: 8 KPI cards (Total leads, Conv rate, Revenue, Avg deal size, Today, This month, Team count, Lost) + Source pie chart + Status bar chart
- ✅ **By Caller tab**: Sortable table (10 columns: Total, Hot, Warm, Cold, Converted, Conv%, Revenue, Demos), search box, role filter (counselor/telecaller/manager), 5 sort options. Top 3 get medal badges. CSV export.
- ✅ **By Manager tab**: Manager cards showing team_size + team members + total leads + conversions + revenue (rolls up the manager's own + all direct reports). "Unassigned" bucket auto-created for users without `reports_to`. CSV export.
- ✅ Added `reports_to` field on users → schema + backend update + frontend "Reports To" Select dropdown in Users page (both Add dialog AND inline edit in row). Self-referencing prevention. Counselors/telecallers/managers can have a manager; org_admin cannot.
- ✅ Backend endpoints (manager + admin only, counselor 403): `GET /api/reports/total-summary`, `GET /api/reports/by-caller`, `GET /api/reports/by-manager`
- ✅ Conversion detection uses union of all industry-specific "won" statuses (Won, Admitted, Booked, Confirmed, Issued, Member, Renewed, Admission Done)
- ✅ All lint clean, all 3 tabs render

### Completed 2026-05-31 — Onboarding Wizard
- ✅ 5-step guided setup wizard for new org admins (Welcome → Services → Team → Lead Source → First Lead)
- ✅ Smart auto-detection — pre-marks steps as complete if data already exists (services in catalog, additional users, leads imported)
- ✅ Per-step inline forms — add a service (with floor price), invite a team member (auto temp password Welcome@123), pick lead source (Widget/FB/Google → deep-link), add first lead
- ✅ Endpoints (org_admin only, counselor gets 403): `GET /api/onboarding/state`, `POST /api/onboarding/advance`, `POST /api/onboarding/skip`, `POST /api/onboarding/reset`
- ✅ Auto-mounted globally in `DashboardLayout` — dismissable with "Skip" or X; "Re-show wizard" button in Settings
- ✅ Gradient violet→fuchsia header with progress dots, step counter, completion percentage
- ✅ Persists to `organizations.onboarding.{completed_steps, completed_at, skipped, skipped_at}`

### Completed 2026-05-31 — Final QA Pass + 3 LOW-priority polish
- ✅ **Iteration 9 final QA — 100% pass:** 83/83 backend tests (25 new + 58 regression) + 14/14 frontend flows + RBAC + tenant isolation + mobile responsiveness
- ✅ Verified end-to-end: Auth (3 roles), Dashboard, Leads CRUD with cascading State/City + industry extras, Follow-ups, Demos, Admissions, Tasks, Reports, Services, Users, Integrations, Webhook Health (NEW), Lead Widget (services-connected dropdown + state/city + Powered by Leadtrak), Subscription, Support, Activity Logs, Platform Orgs (4 tabs), Platform Locations (36 states / 386 cities incl. WB 186)
- ✅ Polish fixes: Suppressed 403 toast flash on Webhook Health for counselor; Recharts ResponsiveContainer min-width/min-height to silence console warnings; Google Ads integration card "Connected" badge now reads `webhook_secret` presence + added webhook_secret config field

### Completed 2026-05-31 — Webhook Health Dashboard (Org Admin, tenant-isolated)
- ✅ New `webhook_logs` collection — every FB / Google Ads inbound event logged with status, leads_imported, duplicates, error, payload, response, ip
- ✅ Instrumented endpoints: FB verify, FB leadgen (signature pass/fail, Graph API error captured), Google Ads (auth pass/fail, validation errors, duplicates)
- ✅ Endpoints (Org Admin + Super Admin only, scoped to `organization_id`):
  - `GET /api/webhook-logs/stats` — total / success / failed / duplicates / today / last_24h / last_7d / by_source breakdown
  - `GET /api/webhook-logs` — list with source / status / since filters
  - `GET /api/webhook-logs/{id}` — full payload + response (tenant-scoped)
  - `POST /api/webhook-logs/{id}/retry` — re-ingest a failed lead from stored payload (FB + Google Ads)
- ✅ Counselor / Telecaller get **403** (verified)
- ✅ New page **/integrations/webhooks** — 4 headline cards (Total / Success Rate / Failed / Last 24h), per-source breakdown cards, filterable log table with relative timestamps, click-to-view payload dialog with "Retry Ingestion" button
- ✅ Sidebar link "Webhook Health" added under admin nav (visible only to admins/managers; counselors don't see it)
- ✅ Indexes: `(organization_id, created_at desc)` + `(organization_id, source, status)`

### Completed 2026-05-31 — Unified Lead Capture (Manual + CSV + Widget + FB + Google)
- ✅ **Schema parity** — `LeadCreate` / `LeadUpdate` now accept `company_name`, `budget_range`, `preferred_date`, `travellers`, `remarks` (all sources persist same fields)
- ✅ **Manual Entry industry-aware** — `GET /api/leads/form-config` returns the same field list as the widget; LeadsPage Add dialog renders Industry-specific extras dynamically
- ✅ **CSV importer** — sample CSV is now 12 columns; parser recognizes `company_name`, `budget_range`, `preferred_date`, `travellers`, `temperature` (case-insensitive header variants supported)
- ✅ **Facebook Lead Ads webhook** — `GET /api/integrations/facebook-leads` for hub.challenge verify; `POST` with full HMAC-SHA256 signature verification (constant-time compare), tenant resolution by page_id, Graph API leadgen fetch with per-tenant page_access_token, FB → CRM field mapping
- ✅ **Google Ads webhook** — `POST /api/integrations/google-ads/{tenant_id}` accepts both Google's native `user_column_data` array and flat JSON (Zapier-style); auth via per-tenant `webhook_secret`
- ✅ **Cross-channel idempotency** — partial unique index on `(organization_id, source_external_id)` prevents duplicate webhook ingestion; helper `_ingest_external_lead()` shared by FB + Google
- ✅ **17/17 new backend tests + 41/41 regression pass** (iteration_8 report)
- ✅ **Industry-aware** fields — config endpoint `GET /api/widget/config/{token}` returns the right field list for tenant's industry (Education → Course; IT → Company + Service; Real Estate → Property Type + Budget; Healthcare → Treatment + Date; Insurance → Type + Premium; Travel → Destination + Date + Travellers; Retail → Product; Fitness → Plan; Generic → Inquiry)
- ✅ **Services Catalog connection** — primary Service/Course/Plan/Product field is `service-select` type, dropdown auto-populated from the org's active services collection (Education shows actual courses; IT shows actual services etc.). Falls back to text input if catalog is empty.
- ✅ Cascading **State + City** dropdown — public endpoint `GET /api/widget/cities/{token}?state=…` powers it; no auth required
- ✅ Embed snippet is now **self-configuring** — fetches latest field config + services + state list at runtime, so changing industry, adding services, or adding cities never requires re-pasting the script
- ✅ Professional UI redesign — gradient brand badge, larger card with `0 8px 30px` shadow, Sora heading, focus rings, helper labels, animated submit state
- ✅ **Powered by Leadtrak** footer below submit button (links to leadtrak.com)
- ✅ Status pill on LeadWidgetPage shows whether services catalog is connected
- ✅ Brand color & logo respected from organization branding settings
- ✅ Backend stores `state`, `city`, `company_name`, `budget_range`, `preferred_date`, `travellers` from public submissions

### P2 — Future
- ⏳ Workflow automation (drip campaigns)
- ⏳ Custom report builder
- ⏳ Google Calendar sync
- ⏳ Mobile app
- ⏳ SMS notifications
- ⏳ Cohort analysis & attribution

---

## Next Tasks (in order)
1. **Razorpay live integration** — keys are collected in DB but the verify flow still uses test client. Plug in user-provided keys.
2. **Email service (Resend or SendGrid)** — demo invites, password reset, team invites, trial-expiry reminders.
3. **Enforce read-only mode on expiry** — backend middleware that blocks writes when `subscription_status=='expired'`.
4. **Twilio WhatsApp** — lead reply, demo reminders.
5. **Facebook Lead Ads + Google Ads** — auto lead capture.
6. Pagination & profile/logo uploads.
7. Refactor `server.py` (now ~3650 lines) into routers.

## Areas Needing Refactor
- `/app/backend/server.py` (1888 lines) — split into routers (auth, tickets, leads, etc.) when bandwidth permits.
- `ticket_no` generation via `count_documents` — switch to atomic counter to avoid race-condition duplicates.
- `PUT /api/support-tickets/{tid}/status` — add enum validation for status field.


---

## 2026-06-01 — PWA Service Worker Cache-Busting Fix
**Issue:** After deploying mobile-responsive CSS fixes (landing logo, leads dialog grids, reports tabs, settings grids) to production (https://leadtrak.in), users on phones did not see the new layout. Root cause: the existing PWA service worker (`leadtrak-v4-ios-pwa`) was cache-first for ALL non-navigation requests, so cached old JS/CSS chunks were served and the registered SW never refreshed because its file URL was unchanged across deploys.

**Files changed:**
- `/app/frontend/public/service-worker.js` — bumped `CACHE_NAME` to `leadtrak-v6-mobile-fix`; added network-first strategy for `.js`/`.css` and `script`/`style` destinations; activate handler now posts `SW_UPDATED` to every open client.
- `/app/frontend/public/index.html` — registration script now calls `reg.update()` on every load, listens for `updatefound`, sends `SKIP_WAITING`, and triggers a one-shot `window.location.reload()` on `controllerchange` / `SW_UPDATED` so the new bundle is picked up automatically without manual cache clearing.

**Verified in preview (390×844 mobile viewport):** landing, leads, reports, settings — all have `documentElement.scrollWidth === 390`, no horizontal scroll, no overlapping grids.

**Deploy note:** Going forward, any production deploy that touches CSS/JS only needs the CACHE_NAME bumped to invalidate stale bundles for already-installed PWAs.


---

## 2026-06-01 — Razorpay Integration (Super Admin Payment Links + Org Checkout)

**Scope:** Real Razorpay payments for subscription activation. Two flows:
1. **Super Admin → Payment Link** (NEW): Super Admin opens any org, picks plan + cycle, system creates a Razorpay Payment Link (with prefill, GST-inclusive amount, internal ref_id, configurable expiry & notify SMS/email), returns `short_url`. UI provides Copy, Open, and "Share on WhatsApp" buttons. Auto-activates subscription via webhook.
2. **Org Admin → Direct Checkout** (UPGRADED): SubscriptionPage now loads `checkout.razorpay.com/v1/checkout.js`, creates an order via `/api/subscriptions/create-order`, opens the Razorpay modal with branded theme + prefill, and verifies signature on success via `/api/subscriptions/verify`.

**Backend additions (`/app/backend/server.py`):**
- `GET /api/razorpay/config` — returns `{configured, key_id}` (secret never exposed)
- `POST /api/platform/organizations/{org_id}/payment-link` — Super Admin only, uses `razorpay_client.payment_link.create()` with `reference_id`, `customer` prefill, `notify`, `expire_by`, GST-inclusive amount, structured `notes`. Rolls back the pending `subscription_orders` doc on Razorpay error.
- `GET /api/platform/organizations/{org_id}/payment-links` — recent links sent to an org
- `POST /api/webhooks/razorpay` — public webhook. Manual HMAC-SHA256 verification via `RAZORPAY_WEBHOOK_SECRET`, handles `payment_link.paid` and `payment.captured`, idempotent activation.
- `_activate_subscription_from_paid_order()` — shared helper used by webhook AND `/subscriptions/verify`. Extends `subscription_end_date` (30/365 days), sets `subscription_status=active`, marks order paid with auto-generated `receipt_no`.
- `POST /api/subscriptions/verify` refactored to accept JSON body (was query params) and uses the shared helper.
- 503 guard on all payment endpoints when keys are empty (`_razorpay_configured()`).
- Webhook events also logged to `webhook_logs` so Org Admin's Webhook Health Dashboard shows Razorpay deliveries.

**Frontend additions:**
- `PlatformOrgsPage.jsx`: new `Link2` icon button per org row (both Organizations + Trials tabs); opens `PaymentLinkDialog` with plan select (shows GST-inclusive prices), billing cycle, expiry days (1-30), email/SMS toggles. After creation: copy URL, WhatsApp share (pre-filled message), open link.
- `SubscriptionPage.jsx`: real Razorpay checkout integration. Gracefully shows an "Online payments unavailable" banner + disables Subscribe buttons when keys aren't configured.

**.env:**
- `RAZORPAY_KEY_ID=""`, `RAZORPAY_KEY_SECRET=""`, `RAZORPAY_WEBHOOK_SECRET=""` — user fills with live keys.

**Verified:**
- `/api/razorpay/config` returns `configured:false` when empty ✓
- Payment Link creation returns 503 with clear message when not configured ✓
- Webhook with bad signature → 400 ✓
- Webhook with valid signature + unknown event → 200, `handled:false` (graceful) ✓
- Webhook with valid signature + `payment_link.paid` for unknown link → 200, `handled:false` (no crash) ✓
- UI: Send Payment Link dialog renders correctly with "not configured" warning when keys empty ✓

**To go live:** User adds live `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` from Razorpay Dashboard, creates a Webhook in Dashboard pointing to `https://leadtrak.in/api/webhooks/razorpay` with events `payment_link.paid` + `payment.captured`, copies the Webhook Secret into `RAZORPAY_WEBHOOK_SECRET`, restarts backend.


---

## 2026-06-01 — Voice Upload: WhatsApp `.mp4` Audio Fix

**Issue:** User tried to upload a WhatsApp voice note (`.mp4` extension, browser-reported MIME `video/mp4`) from desktop. Frontend `VoiceRecorder` rejected with "Please choose an audio file (.mp3, .m4a, .wav, .ogg, .webm)" because validation was strictly `f.type.startsWith('audio/')`.

**Root cause:** WhatsApp on macOS/iOS exports voice messages as `.mp4` containers (AAC inside ISO BMFF). The browser sniffs the extension and reports `video/mp4` even though the payload is audio-only.

**Fix:**
- `frontend/src/components/VoiceRecorder.jsx`:
  - Validation now ALSO accepts by file extension: `.mp3 .m4a .wav .ogg .webm .mp4 .aac .opus`
  - Explicitly allows `video/mp4` and `video/webm` MIME types
  - `<input accept>` extended + helper text updated to mention "MP4 (WhatsApp voice)"
- `backend/server.py`:
  - `ALLOWED_VOICE_MIME` expanded with `video/mp4`, `audio/opus`, `audio/3gpp`, `audio/amr`, `application/octet-stream`
  - Added `ALLOWED_VOICE_EXTS` fallback — if MIME isn't recognized, accept based on filename extension
  - Cloudinary upload uses `resource_type="video"` which correctly handles MP4 audio (Cloudinary internally re-encodes to 3gp for playback)

**Verified:**
- Downloaded the actual user file (`WhatsApp Audio 2026-05-28 at 1.41.54 PM.mp4`, 1 MB, `video/mp4`)
- POST `/api/uploads/voice-recording` → 200, Cloudinary URL returned, duration 66.15 sec detected ✓

**Deploy note:** SW cache bumped to `leadtrak-v9-audio-mp4` so production users get the updated validator immediately on next visit.

---

## 2026-06-01 — Security Hardening + Impersonate Tenant Admin

### 🔒 Security Hardening (Critical + High + Medium fixes)

**1. CORS — wildcard removed**
- `.env`: `CORS_ORIGINS="*"` → explicit list `https://leadtrak.in,https://www.leadtrak.in,<preview>,http://localhost:3000`
- `server.py`: strips empty/wildcard origins, refuses to start with wildcard + `allow_credentials=True`, restricts methods to `GET/POST/PUT/PATCH/DELETE/OPTIONS`, sets 10-min preflight cache.

**2. JWT_SECRET rotated**
- Old key was sequential `a1b2c3...` (predictable pattern) → replaced with 96-char cryptographically random hex from `openssl rand -hex 48`. All existing tokens invalidated (one-time forced re-login).

**3. Rate limiting (slowapi)**
- `Limiter` keyed by leftmost X-Forwarded-For (k8s ingress / Cloudflare aware).
- `POST /api/auth/login` — 10/min
- `POST /api/auth/register` — 5/hour
- `POST /api/auth/forgot-password` — 3/min
- `POST /api/auth/reset-password` — 5/min
- `POST /api/widget/lead/{token}` — 30/min
- `POST /api/webhooks/razorpay` — 120/min

**4. Brute-force lockout bug fixed**
- `check_brute_force()` was crashing with `TypeError: can't compare offset-naive and offset-aware datetimes` (Mongo strips tzinfo). Fixed to coerce naive → UTC before comparison. Now returns clean 429 after 5 failed login attempts.

**5. `assign_lead` IDOR + authorization fix**
- Was: any logged-in user could re-assign any lead in their org to any string `assigned_to`.
- Now: role check (only `super_admin / org_admin / manager`), `assigned_to` validated as ObjectId, target user MUST exist in same org and be active. Cross-tenant assignment blocked.

**6. Password-reset info disclosure**
- Was: full reset URL logged in plaintext (`logger.info(f"Password reset link: ...")`).
- Now: only masked email is logged (`r***@domain`). The token never appears in logs/responses. Endpoint always returns identical message (prevents user enumeration).

**7. Razorpay webhook**
- HMAC-SHA256 signature verification with `hmac.compare_digest` (constant-time) — verified bad signature → 400.

### 🎭 Impersonate Tenant Admin (Super Admin feature)

**Backend:** `POST /api/platform/organizations/{org_id}/impersonate`
- Super Admin only (403 for others)
- Picks the org's active `org_admin` (falls back to any active user)
- Issues a 30-min access token tagged with `impersonator_id` (set in cookie, refresh token cleared)
- Inserts audit row in `impersonation_audit_log` collection: `{impersonator_id, impersonator_email, target_user_id, target_email, target_org_id, target_org_name, started_at}`
- Logs at WARNING level for security review

**`/api/auth/me`** now returns `impersonating: true` + `impersonator_id` when acting as impersonated user.

**Frontend:**
- `PlatformOrgsPage.jsx` — new `UserCog` icon per org row → confirm dialog → redirects to `/dashboard` as the tenant user
- `DashboardLayout.jsx` — sticky amber banner across the top of every page while impersonating, with "Exit Impersonation" button that hits `/api/auth/logout`

**Audit trail:** every impersonation start is logged; ending happens on logout or 30-min token expiry (no silent extension since refresh token is cleared).

### Tests
- `iteration_11.json` — found 1 backend bug (slowapi needs `response: Response` parameter on rate-limited endpoints to inject headers).
- `iteration_12.json` — fix verified, **100% pass rate** (4/4 pytest + 3/3 curl smoke). Cross-tenant `assign_lead` test still skipped — needs a second-org user in seed (low priority).

### Known follow-ups (non-blocking)
- Add `ended_at` field to `impersonation_audit_log` (currently inferred by token expiry / logout)
- CI / pre-commit check that any `@limiter.limit` handler also has `response: Response`
- Server.py is now 5357 lines — refactor into `routes/auth.py`, `routes/billing.py`, `routes/leads.py`, `routes/platform.py`, `routes/webhooks.py`
- Seed a second-organization user to enable cross-tenant tests



---

## 2026-06-01 — Pagination + User Avatar Upload (P1) ✅

### Backend (`/app/backend/server.py`)
- `GET /api/leads` now returns paginated shape `{items, total, page, limit, total_pages}` — params `page` (default 1), `limit` (default 50, max 500). Still honors `status`, `source`, `assigned_to`, `search`, RBAC.
- `GET /api/followups` same paginated shape — params `filter_type`, `page`, `limit` (default 25, max 500). Defensive `try/except` around lead lookup to avoid crash on malformed `lead_id`.
- `POST /api/uploads/avatar` (any role) — Cloudinary upload to `leadtrak/user-avatar/{org_id}/u_{user_id}`. JPG/PNG/WEBP only, ≤ 800 KB. 400×400 face-crop transformation + `quality=auto`. Persists `avatar_url` on the user doc.
- `DELETE /api/uploads/avatar` — clears `avatar_url`.
- `PUT /api/users/me` — logged-in user updates `name`, `mobile`, `avatar_url`. Validates non-empty name + length ≤ 100. **Route registered BEFORE `PUT /api/users/{user_id}`** so `/users/me` doesn't fall through to the admin route.

### Frontend
- `LeadsPage.jsx` — `page` / `totalLeads` / `totalPages` state; fetch sends `page`+`limit=50`; pagination footer (Prev / Page X of Y / Next) under the table. Header "leads total" now reads `totalLeads` from the response.
- `FollowupsPage.jsx` — per-tab `pages` / `totals` / `totalPages` state; new `PaginationFooter` rendered inside each tab; tab counters now use server `totals`.
- `AdmissionsPage.jsx` — `/api/leads` call now passes `limit:500` and reads `.items` (with array fallback).
- `ProfilePage.jsx` — rewritten: avatar circle with camera button + Remove link, editable name + mobile + Save profile button. Calls `checkAuth()` after every successful change so DashboardLayout topbar avatar/name refresh instantly.
- `DashboardLayout.jsx` — `Avatar` now renders `<AvatarImage src={user.avatar_url} />` with initials fallback.
- `service-worker.js` — `CACHE_NAME` bumped to `leadtrak-v27-pagination-avatar`.

### Verification
- Backend: iteration_13 — 18/18 pytest pass (pagination shape, filters, RBAC, avatar mime/size validation, route ordering, `auth/me` reflects avatar).
- Frontend: manual Playwright trace — `PUT /api/users/me` save updates topbar AND profile heading in the same session without reload (testing agent had flagged this as MEDIUM but the live trace proved it works).
- `curl` end-to-end: 55 seeded leads paginated correctly across 3 pages of 20 (page 1: 20, page 2: 20, page 3: 15, page 4: 0). All test data cleaned up.

### Known follow-ups (non-blocking)
- Email service (Resend) integration — user deferred.
- Twilio WhatsApp real send — user deferred.
- Splitting `server.py` (now 5963 lines) into routers — deferred.

---

## 2026-06-01 — Call-Flow Statuses Added Across All Industries ✅

Added 3 telecaller-friendly statuses to every industry's `default_lead_statuses` so the counselor/telecaller can mark a lead without going through the full Log Call dialog:

- `Phone Not Received`
- `Not Reachable`
- `Wrong Number`

**Files changed:**
- `/app/backend/industry_config.py` — 10 industries updated (Education, IT/Software, Real Estate, Healthcare, Insurance, Travel, Retail, Fitness, Admission Consultancy, Generic). Inserted right after "Contacted" (or after "New" for Travel/Fitness/Admission Consultancy which don't have a "Contacted" stage) so they appear at the top of the dropdown for fast access.
- `/app/frontend/src/pages/LeadsPage.jsx` — `statusBadgeClass` map extended:
  - `Phone Not Received` → amber (status-followup)
  - `Not Reachable` → muted red (status-notinterested)
  - `Wrong Number` → red (status-lost)
- `/app/frontend/public/service-worker.js` — `CACHE_NAME` bumped to `leadtrak-v28-call-statuses`.

**Migration:** No DB migration needed — `lead_statuses` is read live from `INDUSTRY_CONFIG` via `get_lead_statuses(industry_key)` inside `/api/auth/me`, so every existing org automatically gets the new dropdown options after backend reload.

**Verified:** `/api/auth/me` for the Education-industry Super Admin now returns the 3 new statuses in `lead_statuses[]`. Status dropdown on `/leads` shows them positioned right after Contacted with proper badge colors.

---

## 2026-06-01 — Direct-Pay Signup Flow (Landing → Razorpay) ✅

Built a friction-less paid-signup path so visitors who already want to buy can skip the trial flow and pay immediately right after creating their account.

**Flow:**
1. Landing page pricing section now has Monthly/Annual toggle + each plan card shows **"Buy {Name} now"** primary CTA and **"Or start a 14-day free trial"** secondary link.
2. "Buy" CTA navigates to `/register?plan=<name>&cycle=<monthly|annual>&pay=1`.
3. Register page reads query params, fetches plan details via the public `/api/subscription-plans` endpoint, and shows a violet "Selected Plan" banner with price + GST + total. Hero badge flips to "ACTIVATE PLAN".
4. CTA button changes to **"Create account & pay ₹{total}"** (with credit-card icon). Secondary "Or start a 14-day free trial instead" link.
5. On submit: account is created → user gets logged in (cookies set) → Razorpay checkout opens automatically → on success, calls `/api/subscriptions/verify` which flips org from `trial` to `active` with proper `subscription_end_date`.
6. If user dismisses or payment fails → graceful fallback to `/dashboard` with 14-day trial still active OR `/subscription` page to retry. Toast informs the user.

**Backend changes:**
- New endpoint `GET /api/razorpay/public-config` — unauthenticated version of `/razorpay/config` so the Register page can pre-fetch the Razorpay Key ID before login. Key ID is a public identifier; safe to expose. Secret never sent.

**Frontend changes:**
- `LandingPage.jsx` — added `billingCycle` state, Monthly/Annual toggle, dynamic price computation, dual CTA buttons per plan card.
- `RegisterPage.jsx` — rewritten with `useSearchParams`, dynamic plan banner, two-mode CTA, Razorpay script loader, full checkout handler (success → /dashboard, dismiss → /dashboard with trial, failure → /subscription).
- `service-worker.js` — `CACHE_NAME` bumped to `leadtrak-v29-direct-pay`.

**Verified:** Smoke screenshots confirm both flows render correctly:
- `?plan=growth&cycle=monthly&pay=1` → "Activate Growth today" + Plan banner + "Create account & pay ₹3,538.82" button
- Bare `/register` → unchanged "Start your free 14-day trial" flow
- Landing pricing now shows toggle + dual CTAs per plan

---

## 2026-06-01 — Industry-Aware Sidebar Features ✅

Each industry now controls which sidebar nav items appear + their localized labels through a new `features` block in `INDUSTRY_CONFIG`.

**Industry → Demo nav mapping:**

| Industry | Demos? | Sidebar label |
|----------|--------|----------------|
| Education | ✅ | Counselling |
| Admission Consultancy | ✅ | Counselling |
| IT/Software | ✅ | Demos |
| Real Estate | ✅ | Site Visits |
| Healthcare | ✅ | Consultations |
| Fitness | ✅ | Trial Sessions |
| Generic | ✅ | Demos |
| Insurance | ❌ Hidden | — |
| Travel | ❌ Hidden | — |
| Retail | ❌ Hidden | — |

**Files changed:**
- `/app/backend/industry_config.py` — added `features` dict per industry (`demos`, `demo_label`, `admissions`). Added `get_features(industry)` helper with sensible defaults.
- `/app/backend/server.py` — `get_current_user` now sets `user["features"]`; imports `get_features`.
- `/app/frontend/src/components/layout/DashboardLayout.jsx` — `navItems` filtered by `user.features[item.feature]`. Demos label dynamically replaced with `user.features.demo_label` when present.
- `/app/frontend/src/pages/DemosPage.jsx` — page heading, tabs, empty state, subtitle all use `demoLabel` from `user.features`.
- `/app/frontend/public/service-worker.js` — `CACHE_NAME` bumped to `leadtrak-v30-industry-features`.

**Verified:**
- `/api/auth/me` (Education industry): `features={demos:True, demo_label:"Counselling", admissions:True}` ✅
- Playwright trace: Sidebar shows "Counselling" instead of "Demos" for Education; page heading + tab + empty state all reflect the localized label.
- All 10 industries verified via python REPL with the correct config (Insurance/Travel/Retail → demos:False).
- Backend lint clean, frontend lint clean.

---

## 2026-06-01 — PWA Home-Screen Icon Badge (Badging API) ✅

When the LeadTrak PWA is installed on Android / Desktop, the home-screen icon now shows a live numeric badge with the user's pending actions count — same UX as native apps (WhatsApp, Gmail, etc.).

**What counts toward the badge:**
- New (untouched) leads visible to the user (RBAC-filtered)
- Unread in-app notifications (`notifications.read != true`)

**Files:**
- `/app/backend/server.py` — new `GET /api/badge/count` returns `{new_leads, unread_notifications, count}`.
- `/app/frontend/src/hooks/usePWABadge.js` — custom hook that polls every 30 s + on `visibilitychange`, calls `navigator.setAppBadge(count)` / `clearAppBadge()`. Feature-detects support — silently no-ops on iOS Safari + Firefox.
- `/app/frontend/src/components/layout/DashboardLayout.jsx` — mounts `usePWABadge(30000, !!user)` so the badge is active whenever a user is logged in.
- `/app/frontend/src/context/AuthContext.jsx` — clears the app badge on logout so stale numbers don't persist.
- `/app/frontend/public/service-worker.js` — `CACHE_NAME` bumped to `leadtrak-v31-pwa-badge`.

**Platform behavior:**
| Platform | Behavior |
|----------|----------|
| Android Chrome (PWA) | ✅ Full numeric badge on home screen icon |
| Desktop Chrome / Edge | ✅ Full numeric badge on taskbar/dock |
| iOS Safari (PWA) | ⚠️ No badge (Apple hasn't shipped the API yet) |
| Firefox | ❌ Silent no-op |

**Verified:** `/api/badge/count` returns `{new_leads:1, unread_notifications:1, count:2}` for the Super Admin. The hook is feature-detected and bails gracefully on unsupported browsers, so there's no console noise or errors anywhere.

---

## 2026-06-01 — Password Eye Toggle (Show/Hide) ✅

Added a reusable `<PasswordInput />` component that wraps the standard `<Input>` with a show/hide eye toggle. Drop-in replacement — keeps all existing props (value, onChange, required, minLength, autoComplete, data-testid). The toggle button gets a derived test id of `${testId}-toggle`.

**Files:**
- `/app/frontend/src/components/ui/password-input.jsx` — new component
- Replaced in all 5 password fields across the app:
  - `LoginPage.jsx` — Sign in form
  - `RegisterPage.jsx` — Sign up form
  - `ProfilePage.jsx` — Current / New / Confirm passwords (3 fields)
  - `PlatformOrgsPage.jsx` — Super-admin "Create Org Admin" dialog
- `/app/frontend/public/service-worker.js` — `CACHE_NAME` bumped to `leadtrak-v32-password-eye`

**Verified:** Playwright trace on Login page — typed `TestPwd123`, clicked eye → input type flipped from `password` → `text`, password text became visible. Eye-off icon shows in revealed state. Lint clean on all 5 modified files.

---

## 2026-06-01 — Invoice / Tax Bill on Payment Success ✅

Earlier the only feedback after a successful subscription payment was a toast notification + page reload. The user (Pritam) flagged that no actual bill/invoice was shown. Now built a full GST-compliant Tax Invoice experience.

**Backend:**
- `POST /api/subscriptions/verify` now returns the freshly-paid `order_id` alongside the existing receipt details.
- New `GET /api/subscriptions/my-orders` — tenant's full order/invoice history (newest first, 50 max).
- New `GET /api/subscriptions/orders/{order_id}` — full invoice payload for the tenant's own order. Super admin can fetch any.
- Shared `_serialize_invoice(order, org)` helper builds the JSON payload (org details, plan, GST breakdown, payment metadata).

**Frontend:**
- New `/app/frontend/src/components/InvoiceDialog.jsx` — professional Tax Invoice modal with:
  - Leadtrak branded header, receipt number, date, PAID badge
  - Billed to (org name, industry, GSTIN if present) + Billed by (Leadtrak / Emergent Labs)
  - Item table → Subtotal + GST 18% + Total Paid (bold underline)
  - Payment metadata (Razorpay payment ID, method, valid-until, paid-at)
  - **Download / Print** button uses `window.open()` with scoped print CSS so the user gets a clean PDF via the browser's native print dialog (works on mobile + desktop)
  - "Email me a copy" button (disabled with tooltip — Resend integration deferred)
- `/app/frontend/src/pages/SubscriptionPage.jsx` — rewritten with **Plans / Invoices tabs**:
  - Plans tab: Monthly/Annual toggle + 3 plan cards (existing flow, now opens invoice dialog after payment success instead of just reloading)
  - Invoices tab: tabular list of past orders with View button per row that re-opens the invoice modal
  - Auto-opens invoice modal when URL has `?invoice=<orderId>` (used by the direct-pay signup flow)
- `/app/frontend/src/pages/RegisterPage.jsx` — direct-pay signup now redirects to `/subscription?invoice=<orderId>` after a successful payment so the user lands on their invoice immediately.
- `/app/frontend/public/service-worker.js` — `CACHE_NAME` bumped to `leadtrak-v33-invoice`.

**Verified:** Created a fake paid order via Mongo script → Playwright opened Invoice modal → all fields rendered correctly (RCP-20260601-A1B2C3 / Growth Plan / ₹2,999 + ₹539.82 GST = ₹3,538.82 / pay_test_invoice_001 / Online Razorpay / Valid until 01 Jul 2026). Test data cleaned up. Backend + frontend lint clean.

---

## 2026-06-01 — Invoice "Billed by" Details + Super Admin View ✅

**Billing entity details** updated on the Tax Invoice using user's real Ncriptech Labs registration:

- **Legal name:** Leadtrak — Ncriptech Labs
- **Address:** 185/35, Rajiv Gandhi Road, Konnagar (M), District: Hooghly, West Bengal — 712235, India
- **GSTIN:** 19BMZPS3329E1ZD (highlighted monospace)
- **Contact:** care@leadtrak.in · +91 98368 07060
- Header support line updated to `leadtrak.in · care@leadtrak.in · +91 98368 07060`

**Super Admin Subscription Report — Invoice view + print added:**
- `PlatformOrgsPage.jsx` (`/platform/organizations` → Orders tab) — new "Invoice" column with a "View" button per paid row that opens the same `InvoiceDialog` as the tenant side. Button only shown for `status=paid` orders.
- Reused the tenant-side `GET /api/subscriptions/orders/{id}` endpoint (super-admin can fetch any tenant's invoice).

**Files:**
- `/app/frontend/src/components/InvoiceDialog.jsx` — replaced "Emergent Labs" with full Ncriptech Labs details + GSTIN.
- `/app/frontend/src/pages/PlatformOrgsPage.jsx` — imported `InvoiceDialog`, added invoice state + `openInvoice()` helper, added "Invoice" column with View button, mounted dialog.
- `/app/frontend/public/service-worker.js` — `CACHE_NAME` bumped to `leadtrak-v37-superadmin-invoice`.

**Verified via Playwright:** Created fake paid order → Super Admin → Platform → Orders tab → View → Tax Invoice modal with full Ncriptech billing details renders correctly. Lint clean.


---

## Hide Reports from Caller & Counselor sidebar (Feb 2026)

**Request:** Caller and Counsellor er dashboard sidebar theke Reports menu sorano.

**Root cause:** `navItems` array-e `rolesHidden: ['counselor', 'telecaller']` declared chilo, kintu render-side filter logic seta consume korchhilo na — only `feature` flag check hocchilo.

**Fix:**
- `/app/frontend/src/components/layout/DashboardLayout.jsx` — added second `.filter()` chain: `!item.rolesHidden || !item.rolesHidden.includes(user?.role)` before `.map()`.
- `/app/frontend/public/service-worker.js` — `CACHE_NAME` bumped to `leadtrak-v57-hide-reports-caller-counselor`.

**Verified via Playwright:** Telecaller (Rohan Verma) login → sidebar shows Dashboard, Leads, Follow-ups, Counselling, Admissions, Tasks, WhatsApp, Support — **no Reports**. ✅

---

## Exclude already-converted leads from Deal Closing dropdown (Feb 2026)

**Request:** "Je Won lead ekbar deal record hoye geche sai lead ar deal close form e dekhabe na — ota to deal record hoye close hoye geche."

**Fix:** `/app/frontend/src/pages/AdmissionsPage.jsx`
- In `fetchData()`, built a `Set` of `admittedLeadIds` from `/api/admissions` response.
- Eligible leads now require BOTH `status === wonStatus` AND `!admittedLeadIds.has(_id)`.
- Helper text updated: "Only leads marked **{wonStatus}** that don't yet have a recorded conversion appear here."

**SW cache:** bumped to `leadtrak-v58-exclude-already-converted-leads`.

**Verified via Playwright (Counselor login):**
1. Before record → dropdown shows "Demo — Ananya Banerjee · Admission Done" ✅
2. Record admission for that lead → submit succeeds, Total Admissions = 1.
3. Re-open Record dialog → dropdown is empty with "No leads at 'Admission Done' status…" message ✅
