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
