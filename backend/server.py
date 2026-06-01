from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Response, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import io
import csv
import re
import json
import hmac
import hashlib
import requests
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import razorpay
import secrets
import cloudinary
import cloudinary.uploader
from openpyxl import Workbook
from india_locations import INDIA_LOCATIONS
from industry_config import INDUSTRY_CONFIG, SUPPORTED_INDUSTRIES, get_industry, get_terms, get_lead_statuses, get_widget_fields, list_industries, get_default_services, get_features

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = "HS256"

# Razorpay Configuration
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


def _razorpay_configured() -> bool:
    """True only when real (non-empty) keys are present."""
    return bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)

# Cloudinary Configuration
cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    secure=True,
)

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# ==================== Rate Limiter ====================
# Trusts the leftmost X-Forwarded-For IP (k8s ingress / Cloudflare). Falls back to remote_addr.
def _client_ip(request: Request) -> str:
    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        return xff.split(",")[0].strip()
    return get_remote_address(request)

limiter = Limiter(key_func=_client_ip, default_limits=[], headers_enabled=True)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== Password Hashing ====================
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

# ==================== JWT Token Management ====================
def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=15), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

# ==================== Auth Helper ====================
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["_id"] = str(user["_id"])
        user["id"] = user["_id"]
        # Impersonation flag (set by Super Admin /impersonate flow)
        impersonator_id = payload.get("impersonator_id")
        if impersonator_id:
            user["impersonating"] = True
            user["impersonator_id"] = impersonator_id
        org_id = user.get("organization_id")
        user["organization_id"] = str(org_id) if org_id else ""
        user.pop("password_hash", None)
        # Attach industry + terminology from the organization
        industry_key = "generic"
        org_name = ""
        if org_id:
            org = await db.organizations.find_one({"_id": org_id}, {"industry": 1, "name": 1, "logo_url": 1})
            if org:
                industry_key = org.get("industry") or "education"
                org_name = org.get("name", "")
                user["logo_url"] = org.get("logo_url", "")
        user["industry"] = industry_key
        user["organization_name"] = org_name
        user["terminology"] = get_terms(industry_key)
        user["lead_statuses"] = get_lead_statuses(industry_key)
        user["features"] = get_features(industry_key)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ==================== Brute Force Protection ====================
async def check_brute_force(identifier: str):
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt:
        if attempt["count"] >= 5:
            # Mongo may return naive datetimes — coerce to UTC for comparison
            last = attempt["last_attempt"]
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            lockout_time = last + timedelta(minutes=15)
            now = datetime.now(timezone.utc)
            if now < lockout_time:
                remaining = max(1, int((lockout_time - now).total_seconds() / 60))
                raise HTTPException(status_code=429, detail=f"Too many failed attempts. Try again in {remaining} minutes")
            else:
                await db.login_attempts.delete_one({"identifier": identifier})

async def record_failed_attempt(identifier: str):
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt:
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"last_attempt": datetime.now(timezone.utc)}}
        )
    else:
        await db.login_attempts.insert_one({
            "identifier": identifier,
            "count": 1,
            "last_attempt": datetime.now(timezone.utc)
        })

async def clear_failed_attempts(identifier: str):
    await db.login_attempts.delete_one({"identifier": identifier})


def safe_object_id(value: str, field: str = "id") -> ObjectId:
    """Convert a string to ObjectId or raise HTTP 400 (instead of bson InvalidId → 500)."""
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid {field}")


# ==================== Round-robin Auto-Assign ====================
async def pick_round_robin_assignee(org_id) -> Optional[str]:
    """Round-robin allocator across active counselors + telecallers in the org.

    Uses `organizations.last_assigned_user_id` to remember the last winner so that
    100 leads ÷ 5 callers = 20 each over time.
    Respects `organizations.auto_assign_enabled` (default True).
    Returns the user_id string of the next assignee, or None if disabled / no callers.
    """
    org = await db.organizations.find_one(
        {"_id": org_id}, {"last_assigned_user_id": 1, "auto_assign_enabled": 1}
    )
    if (org or {}).get("auto_assign_enabled") is False:
        return None
    callers = await db.users.find(
        {"organization_id": org_id, "role": {"$in": ["counselor", "telecaller"]}},
        {"_id": 1, "name": 1, "created_at": 1},
    ).sort("created_at", 1).to_list(500)
    if not callers:
        return None
    last = (org or {}).get("last_assigned_user_id")
    ids = [str(c["_id"]) for c in callers]
    if last in ids:
        next_idx = (ids.index(last) + 1) % len(ids)
    else:
        next_idx = 0
    chosen = ids[next_idx]
    await db.organizations.update_one(
        {"_id": org_id},
        {"$set": {"last_assigned_user_id": chosen}},
    )
    return chosen

# ==================== Lead Timeline Helper ====================
async def log_lead_event(
    lead_id, event_type: str, payload: dict, user: dict, organization_id
):
    """Append an event to the lead_timeline collection.

    event_type ∈ {lead_created, status_changed, assigned, transferred,
                  followup_added, note_added, admission_recorded, lead_lost,
                  lead_updated}
    """
    lead_oid = lead_id if isinstance(lead_id, ObjectId) else ObjectId(lead_id)
    org_oid = organization_id if isinstance(organization_id, ObjectId) else ObjectId(organization_id)
    await db.lead_timeline.insert_one({
        "lead_id": lead_oid,
        "organization_id": org_oid,
        "event_type": event_type,
        "payload": payload,
        "actor_id": user.get("id"),
        "actor_name": user.get("name"),
        "actor_role": user.get("role"),
        "created_at": datetime.now(timezone.utc),
    })

# ==================== Pydantic Models ====================
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    organization_name: str
    industry: Optional[str] = "education"

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    role: str
    mobile: Optional[str] = None
    reports_to: Optional[str] = None  # ObjectId of manager
    password: Optional[str] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    mobile: Optional[str] = None
    reports_to: Optional[str] = None
    active: Optional[bool] = None

def _normalize_whatsapp_number(value: Optional[str]) -> Optional[str]:
    """Strict validator: must be a valid Indian mobile in +91XXXXXXXXXX format.
    Returns the normalized string or raises HTTPException(400)."""
    if value is None:
        return None
    v = str(value).strip()
    if not v:
        return None
    # Strip spaces, hyphens, parentheses
    clean = "".join(ch for ch in v if ch.isdigit() or ch == "+")
    # Auto-prefix +91 if 10 digits
    if clean.startswith("+91") and len(clean) == 13:
        return clean
    if clean.startswith("91") and len(clean) == 12:
        return "+" + clean
    if clean.isdigit() and len(clean) == 10:
        return "+91" + clean
    raise HTTPException(status_code=400, detail="WhatsApp number must be a valid Indian number (+91XXXXXXXXXX)")


class LeadCreate(BaseModel):
    name: str
    mobile: str
    whatsapp_number: Optional[str] = None  # Optional secondary — if blank, fallback to `mobile` for WhatsApp actions
    email: Optional[str] = None
    course_interested: str
    state: Optional[str] = None
    city: Optional[str] = None
    lead_source: str
    assigned_to: Optional[str] = None
    status: str = "New"
    temperature: Optional[str] = "warm"  # hot | warm | cold
    # Industry-specific extras (parity with widget capture)
    company_name: Optional[str] = None
    budget_range: Optional[str] = None
    preferred_date: Optional[str] = None
    travellers: Optional[str] = None
    # Admission consultancy industry extras
    target_college: Optional[str] = None
    target_college_id: Optional[str] = None  # references colleges._id
    course_fee: Optional[float] = None
    admission_year: Optional[str] = None
    commission_pct: Optional[float] = None
    remarks: Optional[str] = None

class LeadUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    whatsapp_number: Optional[str] = None
    email: Optional[str] = None
    course_interested: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    lead_source: Optional[str] = None
    assigned_to: Optional[str] = None
    status: Optional[str] = None
    temperature: Optional[str] = None  # hot | warm | cold
    company_name: Optional[str] = None
    budget_range: Optional[str] = None
    preferred_date: Optional[str] = None
    travellers: Optional[str] = None
    # Admission consultancy industry extras
    target_college: Optional[str] = None
    target_college_id: Optional[str] = None
    course_fee: Optional[float] = None
    admission_year: Optional[str] = None
    commission_pct: Optional[float] = None
    remarks: Optional[str] = None

class FollowupCreate(BaseModel):
    lead_id: str
    followup_date: str
    followup_time: str
    remarks: str
    next_followup: Optional[str] = None
    voice_recording_url: Optional[str] = None
    voice_recording_public_id: Optional[str] = None
    voice_recording_duration: Optional[float] = None

class LeadTransfer(BaseModel):
    new_assignee_id: str
    reason: Optional[str] = ""

class DemoCreate(BaseModel):
    lead_id: str
    demo_owner_id: str
    scheduled_date: str          # YYYY-MM-DD
    scheduled_time: str          # HH:MM
    demo_mode: str = "Online"    # Online | Onsite
    demo_link: Optional[str] = ""
    agenda: Optional[str] = ""

class DemoComplete(BaseModel):
    outcome: str                 # interested | not_interested | reschedule | no_show
    feedback: Optional[str] = ""
    recording_url: Optional[str] = ""

class FollowupComplete(BaseModel):
    summary: str
    voice_recording_url: Optional[str] = None
    voice_recording_public_id: Optional[str] = None
    voice_recording_duration: Optional[float] = None
    new_status: Optional[str] = None
    next_action: Optional[str] = None    # next_followup | book_demo | convert | lost | none
    next_followup_date: Optional[str] = None
    next_followup_time: Optional[str] = None
    # Optional demo booking nested in completion
    demo: Optional[DemoCreate] = None

class AdmissionCreate(BaseModel):
    student_name: str
    mobile: str
    course: str
    fees: float
    admission_date: str
    lead_id: Optional[str] = None
    # New service catalog + discount fields (Phase 6)
    service_id: Optional[str] = None
    base_price: Optional[float] = None
    discount_amount: Optional[float] = Field(0, ge=0)
    discount_reason: Optional[str] = ""

class ServiceCreate(BaseModel):
    name: str
    category: Optional[str] = ""
    base_price: float
    min_price: float
    description: Optional[str] = ""
    duration: Optional[str] = ""
    active: bool = True

class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    base_price: Optional[float] = None
    min_price: Optional[float] = None
    description: Optional[str] = None
    duration: Optional[str] = None
    active: Optional[bool] = None

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_to: str
    due_date: str
    priority: str = "Medium"

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None

class LeadSourceCreate(BaseModel):
    name: str

GST_REGEX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
GST_RATE = 0.18  # 18% GST applied on all subscription invoices (India)


def with_gst(amount: float) -> dict:
    """Return base/gst/total breakdown for a subscription amount."""
    base = round(float(amount or 0), 2)
    gst = round(base * GST_RATE, 2)
    total = round(base + gst, 2)
    return {"base_amount": base, "gst_amount": gst, "gst_rate": GST_RATE, "total_amount": total}

class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None
    address: Optional[str] = None
    gst_number: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    website: Optional[str] = None
    email_settings: Optional[Dict] = None
    whatsapp_settings: Optional[Dict] = None

class SubscriptionCreate(BaseModel):
    plan_id: str
    billing_cycle: str

class WhatsAppMessage(BaseModel):
    to: str
    message: str

# ==================== Admin Seeding ====================
async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@educationcrm.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    
    # Check if super admin exists
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        # Create default organization for super admin
        org_result = await db.organizations.insert_one({
            "name": "Super Admin Organization",
            "industry": "generic",
            "subscription_plan": "enterprise",
            "settings": {},
            "created_at": datetime.now(timezone.utc)
        })
        org_id = org_result.inserted_id
        
        hashed = hash_password(admin_password)
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hashed,
            "name": "Super Admin",
            "role": "super_admin",
            "organization_id": org_id,
            "created_at": datetime.now(timezone.utc)
        })
        logger.info(f"Super admin created: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )
        logger.info("Super admin password updated")
    
    # Write test credentials
    os.makedirs("/app/memory", exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write("# Test Credentials\n\n")
        f.write("## Super Admin\n")
        f.write(f"- Email: {admin_email}\n")
        f.write(f"- Password: {admin_password}\n")
        f.write("- Role: super_admin\n\n")
        f.write("## Auth Endpoints\n")
        f.write("- POST /api/auth/register\n")
        f.write("- POST /api/auth/login\n")
        f.write("- POST /api/auth/logout\n")
        f.write("- GET /api/auth/me\n")

async def seed_demo_org_and_users():
    """Seed a demo organization with one user per role for testing."""
    demo_org_name = "Bright Future Coaching (Demo)"
    existing_org = await db.organizations.find_one({"name": demo_org_name})
    if existing_org:
        demo_org_id = existing_org["_id"]
        # Ensure industry is set for legacy demo orgs
        if not existing_org.get("industry"):
            await db.organizations.update_one(
                {"_id": demo_org_id}, {"$set": {"industry": "education"}}
            )
    else:
        result = await db.organizations.insert_one({
            "name": demo_org_name,
            "industry": "education",
            "subscription_plan": "growth",
            "settings": {},
            "created_at": datetime.now(timezone.utc),
        })
        demo_org_id = result.inserted_id
        logger.info(f"Demo org created: {demo_org_name}")

    demo_users = [
        {"email": "orgadmin@demo.com", "password": "Demo@123", "name": "Riya Kapoor", "role": "org_admin"},
        {"email": "manager@demo.com", "password": "Demo@123", "name": "Arjun Mehta", "role": "manager"},
        {"email": "counselor@demo.com", "password": "Demo@123", "name": "Priya Sharma", "role": "counselor"},
        {"email": "telecaller@demo.com", "password": "Demo@123", "name": "Rohan Verma", "role": "telecaller"},
    ]
    for u in demo_users:
        existing = await db.users.find_one({"email": u["email"]})
        if existing is None:
            await db.users.insert_one({
                "email": u["email"],
                "password_hash": hash_password(u["password"]),
                "name": u["name"],
                "role": u["role"],
                "organization_id": demo_org_id,
                "created_at": datetime.now(timezone.utc),
            })
            logger.info(f"Demo user created: {u['email']} / {u['role']}")
        elif not verify_password(u["password"], existing["password_hash"]):
            await db.users.update_one(
                {"email": u["email"]},
                {"$set": {"password_hash": hash_password(u["password"])}},
            )

    # Update test_credentials.md with all roles
    base_url = os.environ.get("FRONTEND_URL", "https://institute-crm-pro.preview.emergentagent.com")
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write("# Test Credentials\n\n")
        f.write(f"## Login URL\n{base_url}/login\n\n")
        f.write("## Super Admin (own org)\n")
        f.write(f"- Email: {os.environ.get('ADMIN_EMAIL', 'admin@educationcrm.com')}\n")
        f.write(f"- Password: {os.environ.get('ADMIN_PASSWORD', 'Admin@123')}\n")
        f.write("- Role: super_admin\n\n")
        f.write(f"## Demo Organization: {demo_org_name}\n\n")
        for u in demo_users:
            f.write(f"### {u['role'].replace('_', ' ').title()}\n")
            f.write(f"- Email: {u['email']}\n")
            f.write(f"- Password: {u['password']}\n")
            f.write(f"- Name: {u['name']}\n\n")

async def seed_subscription_plans():
    existing = await db.subscription_plans.count_documents({})
    if existing == 0:
        plans = [
            {
                "name": "Starter",
                "user_limit": 5,
                "lead_limit": 1000,
                "price_monthly": 999,
                "price_annual": 9990,
                "features": ["5 Users", "1000 Leads", "Basic Reports", "Email Support"]
            },
            {
                "name": "Growth",
                "user_limit": 20,
                "lead_limit": 5000,
                "price_monthly": 2999,
                "price_annual": 29990,
                "features": ["20 Users", "5000 Leads", "Advanced Reports", "Priority Support", "WhatsApp Integration"]
            },
            {
                "name": "Enterprise",
                "user_limit": -1,
                "lead_limit": -1,
                "price_monthly": 9999,
                "price_annual": 99990,
                "features": ["Unlimited Users", "Unlimited Leads", "Custom Reports", "24/7 Support", "All Integrations", "Dedicated Account Manager"]
            }
        ]
        await db.subscription_plans.insert_many(plans)
        logger.info("Subscription plans seeded")

# ==================== Startup Event ====================
async def migrate_industry_field():
    """Backfill the `industry` field on legacy organizations created before multi-industry support."""
    result = await db.organizations.update_many(
        {"industry": {"$exists": False}},
        {"$set": {"industry": "education"}},
    )
    if result.modified_count:
        logger.info(f"Migrated {result.modified_count} organizations to industry='education'")


async def migrate_subscription_fields():
    """Backfill trial_start_date / trial_end_date / subscription_status for legacy orgs."""
    now = datetime.now(timezone.utc)
    legacy = db.organizations.find({"subscription_status": {"$exists": False}}, {"_id": 1, "created_at": 1, "name": 1})
    count = 0
    async for org in legacy:
        # Super admin org and demo org get long-running grace; others get 14 days from creation
        is_super = org.get("name") == "Super Admin Organization"
        start = org.get("created_at") or now
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if is_super:
            end = now + timedelta(days=3650)  # effectively forever
            status_val = "active"
        else:
            end = start + timedelta(days=14)
            status_val = "trial" if end > now else "expired"
        await db.organizations.update_one(
            {"_id": org["_id"]},
            {"$set": {
                "trial_start_date": start,
                "trial_end_date": end,
                "subscription_end_date": end,
                "subscription_status": status_val,
            }}
        )
        count += 1
    if count:
        logger.info(f"Backfilled subscription fields for {count} organizations")


async def seed_services_for_existing_orgs():
    """Seed default services for orgs that don't have any (Phase 6)."""
    orgs = db.organizations.find({}, {"industry": 1})
    async for org in orgs:
        existing = await db.services.count_documents({"organization_id": org["_id"]})
        if existing == 0:
            industry = org.get("industry") or "education"
            services_seed = [
                {
                    **svc,
                    "active": True,
                    "description": "",
                    "duration": "",
                    "organization_id": org["_id"],
                    "created_at": datetime.now(timezone.utc),
                }
                for svc in get_default_services(industry)
            ]
            if services_seed:
                await db.services.insert_many(services_seed)
                logger.info(f"Seeded {len(services_seed)} default services for org {org['_id']}")

async def seed_locations():
    """Seed/refresh cities from india_locations.py. Inserts only missing (state, city) pairs.
    Existing entries (incl. inactive/edited ones) are left untouched."""
    new_count = 0
    for state, cities in INDIA_LOCATIONS.items():
        for city in cities:
            try:
                result = await db.locations.update_one(
                    {
                        "state": {"$regex": f"^{state}$", "$options": "i"},
                        "city": {"$regex": f"^{city}$", "$options": "i"},
                    },
                    {"$setOnInsert": {
                        "state": state,
                        "city": city,
                        "is_active": True,
                        "is_default": True,
                        "created_at": datetime.now(timezone.utc),
                    }},
                    upsert=True,
                )
                if result.upserted_id is not None:
                    new_count += 1
            except Exception as e:
                logger.warning(f"seed_locations skip {state}/{city}: {e}")
    if new_count:
        logger.info(f"seed_locations: inserted {new_count} new default cities")




async def seed_demo_timeline_lead():
    """Create a fully-progressed demo lead inside the Bright Future Coaching org so users
    can see what a rich timeline looks like (created → contacted → interested →
    followup with voice → transferred → converted)."""
    demo_org = await db.organizations.find_one({"name": "Bright Future Coaching (Demo)"})
    if not demo_org:
        return
    org_id = demo_org["_id"]
    if await db.leads.find_one({"organization_id": org_id, "mobile": "9988123456"}):
        return  # already seeded
    counselor = await db.users.find_one({"organization_id": org_id, "role": "counselor"})
    manager = await db.users.find_one({"organization_id": org_id, "role": "manager"})
    telecaller = await db.users.find_one({"organization_id": org_id, "role": "telecaller"})
    org_admin = await db.users.find_one({"organization_id": org_id, "role": "org_admin"})
    if not (counselor and manager and telecaller and org_admin):
        return
    lead_count = await db.leads.count_documents({"organization_id": org_id})
    lead_id_str = f"LEAD{lead_count + 1:05d}"
    base_time = datetime.now(timezone.utc) - timedelta(days=7)
    lead_doc = {
        "lead_id": lead_id_str,
        "name": "Demo — Ananya Banerjee",
        "mobile": "9988123456",
        "email": "ananya.demo@example.com",
        "course_interested": "MBA Full-time",
        "state": "West Bengal",
        "city": "Kolkata",
        "lead_source": "Facebook Ad",
        "assigned_to": str(counselor["_id"]),
        "status": "Admission Done",
        "organization_id": org_id,
        "created_by": str(org_admin["_id"]),
        "created_at": base_time,
    }
    lead_result = await db.leads.insert_one(lead_doc)
    lead_oid = lead_result.inserted_id

    # Walk it through the journey
    events = [
        (0, "lead_created", {
            "name": "Demo — Ananya Banerjee", "source": "Facebook Ad",
            "status": "New", "assigned_to": str(counselor["_id"]),
        }, telecaller, "telecaller"),
        (1, "status_changed", {"from": "New", "to": "Contacted"}, counselor, "counselor"),
        (1, "followup_added", {
            "remarks": "First call — student interested in MBA Full-time. Asked about placement stats and fee structure. Sounded positive.",
            "followup_date": (base_time + timedelta(days=2)).strftime("%Y-%m-%d"),
            "followup_time": "11:00",
            "next_followup": (base_time + timedelta(days=3)).strftime("%Y-%m-%d"),
        }, counselor, "counselor"),
        (2, "status_changed", {"from": "Contacted", "to": "Interested"}, counselor, "counselor"),
        (3, "followup_added", {
            "remarks": "Second call — discussed fees (₹2,40,000), parents want a sibling discount. Booked campus visit Saturday 11 AM.",
            "followup_date": (base_time + timedelta(days=4)).strftime("%Y-%m-%d"),
            "followup_time": "16:30",
            "next_followup": (base_time + timedelta(days=5)).strftime("%Y-%m-%d"),
        }, counselor, "counselor"),
        (4, "transferred", {
            "from_user_id": str(counselor["_id"]),
            "from_user_name": counselor["name"],
            "to_user_id": str(manager["_id"]),
            "to_user_name": manager["name"],
            "reason": "Escalated for discount approval beyond counselor authority",
        }, manager, "manager"),
        (5, "status_changed", {"from": "Interested", "to": "Follow-up"}, manager, "manager"),
        (5, "followup_added", {
            "remarks": "Manager call — approved ₹15,000 sibling discount. Family confirmed payment within 48 hours.",
            "followup_date": (base_time + timedelta(days=6)).strftime("%Y-%m-%d"),
            "followup_time": "10:00",
        }, manager, "manager"),
        (6, "admission_recorded", {
            "offering": "MBA Full-time",
            "amount": 225000,
            "base_price": 240000,
            "discount_amount": 15000,
            "discount_reason": "Sibling discount approved by manager",
            "date": (base_time + timedelta(days=6)).strftime("%Y-%m-%d"),
        }, manager, "manager"),
        (6, "status_changed", {"from": "Follow-up", "to": "Admission Done"}, manager, "manager"),
    ]
    timeline_docs = []
    for day_offset, etype, payload, actor, role in events:
        timeline_docs.append({
            "lead_id": lead_oid,
            "organization_id": org_id,
            "event_type": etype,
            "payload": payload,
            "actor_id": str(actor["_id"]),
            "actor_name": actor["name"],
            "actor_role": role,
            "created_at": base_time + timedelta(days=day_offset, minutes=len(timeline_docs) * 17),
        })
    if timeline_docs:
        await db.lead_timeline.insert_many(timeline_docs)
    logger.info(f"Seeded demo timeline lead {lead_id_str} with {len(events)} events")


@app.on_event("startup")
async def startup_db():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.leads.create_index([("organization_id", 1), ("created_at", -1)])
    await db.leads.create_index([("organization_id", 1), ("mobile", 1)])
    await db.leads.create_index([("organization_id", 1), ("email", 1)])
    await db.followups.create_index([("organization_id", 1), ("followup_date", 1)])
    await db.lead_timeline.create_index([("lead_id", 1), ("created_at", 1)])
    await db.lead_timeline.create_index([("organization_id", 1), ("created_at", -1)])
    await seed_admin()
    await seed_demo_org_and_users()
    await seed_subscription_plans()
    await migrate_industry_field()
    await migrate_subscription_fields()
    await seed_services_for_existing_orgs()
    await seed_demo_timeline_lead()
    # Subscription orders index
    await db.subscription_orders.create_index([("organization_id", 1), ("created_at", -1)])
    await db.subscription_orders.create_index("status")
    # Locations
    await seed_locations()
    await db.locations.create_index([("state", 1), ("city", 1)], unique=True)
    # Lead idempotency on inbound channels (FB Lead Ads, Google Ads)
    await db.leads.create_index(
        [("organization_id", 1), ("source_external_id", 1)],
        unique=True,
        partialFilterExpression={"source_external_id": {"$type": "string"}},
    )
    # Webhook logs
    await db.webhook_logs.create_index([("organization_id", 1), ("created_at", -1)])
    await db.webhook_logs.create_index([("organization_id", 1), ("source", 1), ("status", 1)])
    logger.info("Database initialized and indexes created")

# ==================== Auth Routes ====================
@api_router.post("/auth/register")
@limiter.limit("5/hour")
async def register(data: RegisterRequest, request: Request, response: Response):
    email = data.email.lower()
    
    # Check if user already exists
    existing_user = await db.users.find_one({"email": email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate industry
    industry = (data.industry or "education").lower()
    if industry not in SUPPORTED_INDUSTRIES:
        industry = "generic"
    industry_cfg = get_industry(industry)

    # Start 14-day trial automatically on signup
    trial_start = datetime.now(timezone.utc)
    trial_end = trial_start + timedelta(days=14)

    # Create organization
    org_result = await db.organizations.insert_one({
        "name": data.organization_name,
        "industry": industry,
        "subscription_plan": "starter",
        "subscription_status": "trial",
        "trial_start_date": trial_start,
        "trial_end_date": trial_end,
        "subscription_end_date": trial_end,
        "settings": {},
        "created_at": datetime.now(timezone.utc)
    })
    org_id = org_result.inserted_id

    # Seed industry-specific default lead sources
    default_sources = [
        {
            "name": src,
            "organization_id": org_id,
            "created_at": datetime.now(timezone.utc),
        }
        for src in industry_cfg["default_sources"]
    ]
    if default_sources:
        await db.lead_sources.insert_many(default_sources)

    # Seed industry-specific default services (Phase 6)
    default_services_seed = [
        {
            **svc,
            "active": True,
            "description": "",
            "duration": "",
            "organization_id": org_id,
            "created_at": datetime.now(timezone.utc),
        }
        for svc in get_default_services(industry)
    ]
    if default_services_seed:
        await db.services.insert_many(default_services_seed)
    
    # Create user
    hashed = hash_password(data.password)
    user_result = await db.users.insert_one({
        "email": email,
        "password_hash": hashed,
        "name": data.name,
        "role": "org_admin",
        "organization_id": org_id,
        "created_at": datetime.now(timezone.utc)
    })
    user_id = str(user_result.inserted_id)
    
    # Create tokens
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    
    # Set cookies
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    
    return {
        "id": user_id,
        "email": email,
        "name": data.name,
        "role": "org_admin",
        "organization_id": str(org_id),
        "organization_name": data.organization_name,
        "industry": industry,
        "terminology": industry_cfg["terms"],
    }

@api_router.post("/auth/login")
@limiter.limit("10/minute")
async def login(data: LoginRequest, request: Request, response: Response):
    email = data.email.lower()
    # Use email-based identifier - k8s ingress shows different upstream IPs per request
    identifier = email
    
    await check_brute_force(identifier)
    
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        await record_failed_attempt(identifier)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    await clear_failed_attempts(identifier)
    
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    
    # Fetch industry + org name from org for the response
    org_id = user.get("organization_id")
    industry = "generic"
    org_name = ""
    if org_id:
        org = await db.organizations.find_one({"_id": org_id}, {"industry": 1, "name": 1})
        if org:
            industry = org.get("industry") or "education"
            org_name = org.get("name", "")
    return {
        "id": user_id,
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "organization_id": str(user.get("organization_id", "")),
        "organization_name": org_name,
        "industry": industry,
        "terminology": get_terms(industry),
    }

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out successfully"}

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

# ==================== Industries (multi-industry support) ====================
@api_router.get("/industries")
async def get_industries():
    """Public list of supported industries (used on signup dropdown)."""
    return list_industries()


@api_router.get("/industries/{key}")
async def get_industry_detail(key: str):
    """Full config for one industry (terms + defaults)."""
    if key not in SUPPORTED_INDUSTRIES:
        raise HTTPException(status_code=404, detail="Industry not found")
    cfg = INDUSTRY_CONFIG[key]
    return {"key": key, **cfg}


class IndustryUpdate(BaseModel):
    industry: str


@api_router.put("/organization/industry")
async def update_organization_industry(
    data: IndustryUpdate, current_user: dict = Depends(get_current_user)
):
    """Allow org_admin or super_admin to change their organization's industry template."""
    if current_user["role"] not in ("super_admin", "org_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    if data.industry not in SUPPORTED_INDUSTRIES:
        raise HTTPException(status_code=400, detail="Unsupported industry")
    await db.organizations.update_one(
        {"_id": ObjectId(current_user["organization_id"])},
        {"$set": {"industry": data.industry}},
    )
    return {"industry": data.industry, "terminology": get_terms(data.industry)}


# ==================== Services Catalog (Phase 6) ====================
def _serialize_service(s: dict) -> dict:
    s["_id"] = str(s["_id"])
    s.pop("organization_id", None)
    if isinstance(s.get("created_at"), datetime):
        s["created_at"] = s["created_at"].isoformat()
    return s


@api_router.get("/services")
async def list_services(
    current_user: dict = Depends(get_current_user),
    include_inactive: bool = False,
):
    org_id = ObjectId(current_user["organization_id"])
    query = {"organization_id": org_id}
    if not include_inactive:
        query["active"] = {"$ne": False}
    services = await db.services.find(query).sort("name", 1).to_list(500)
    return [_serialize_service(s) for s in services]


@api_router.post("/services")
async def create_service(data: ServiceCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("super_admin", "org_admin", "manager"):
        raise HTTPException(status_code=403, detail="Only managers and admins can manage services")
    if data.min_price > data.base_price:
        raise HTTPException(status_code=400, detail="Min price cannot exceed base price")
    org_id = ObjectId(current_user["organization_id"])
    doc = {
        "name": data.name,
        "category": data.category,
        "base_price": data.base_price,
        "min_price": data.min_price,
        "description": data.description,
        "duration": data.duration,
        "active": data.active,
        "organization_id": org_id,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.services.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize_service(doc)


@api_router.put("/services/{service_id}")
async def update_service(service_id: str, data: ServiceUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("super_admin", "org_admin", "manager"):
        raise HTTPException(status_code=403, detail="Only managers and admins can manage services")
    sid = safe_object_id(service_id, "service_id")
    org_id = ObjectId(current_user["organization_id"])
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    # Validate min_price ≤ base_price if both being modified, else against existing
    if "min_price" in update_data or "base_price" in update_data:
        existing = await db.services.find_one({"_id": sid, "organization_id": org_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Service not found")
        base = update_data.get("base_price", existing.get("base_price", 0))
        mn = update_data.get("min_price", existing.get("min_price", 0))
        if mn > base:
            raise HTTPException(status_code=400, detail="Min price cannot exceed base price")
    result = await db.services.update_one(
        {"_id": sid, "organization_id": org_id},
        {"$set": update_data},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Service not found")
    return {"message": "Service updated"}


@api_router.delete("/services/{service_id}")
async def delete_service(service_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("super_admin", "org_admin", "manager"):
        raise HTTPException(status_code=403, detail="Only managers and admins can manage services")
    sid = safe_object_id(service_id, "service_id")
    org_id = ObjectId(current_user["organization_id"])
    result = await db.services.delete_one({"_id": sid, "organization_id": org_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Service not found")
    return {"message": "Service deleted"}



@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        user_id = str(user["_id"])
        access_token = create_access_token(user_id, user["email"])
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=900, path="/")
        
        return {"message": "Token refreshed"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

@api_router.post("/auth/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(data: ForgotPasswordRequest, request: Request, response: Response):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    
    if not user:
        return {"message": "If email exists, reset link has been sent"}
    
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "email": email,
        "token": token,
        "used": False,
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
        "created_at": datetime.now(timezone.utc)
    })
    
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    # SECURITY: never log the full reset link in plaintext — it grants password reset.
    logger.info(f"Password reset requested for {email[:3]}***@{email.split('@')[1] if '@' in email else ''}")
    _ = frontend_url  # kept for future email delivery
    
    return {"message": "If email exists, reset link has been sent"}

@api_router.post("/auth/reset-password")
@limiter.limit("5/minute")
async def reset_password(data: ResetPasswordRequest, request: Request, response: Response):
    reset_token = await db.password_reset_tokens.find_one({"token": data.token, "used": False})
    
    if not reset_token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    if datetime.now(timezone.utc) > reset_token["expires_at"]:
        raise HTTPException(status_code=400, detail="Reset token has expired")
    
    hashed = hash_password(data.new_password)
    await db.users.update_one(
        {"email": reset_token["email"]},
        {"$set": {"password_hash": hashed}}
    )
    
    await db.password_reset_tokens.update_one(
        {"token": data.token},
        {"$set": {"used": True}}
    )
    
    return {"message": "Password reset successfully"}

# ==================== Dashboard Routes ====================
@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    
    total_leads = await db.leads.count_documents({"organization_id": org_id})
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    todays_leads = await db.leads.count_documents({"organization_id": org_id, "created_at": {"$gte": today_start}})
    pending_followups = await db.followups.count_documents({"organization_id": org_id, "followup_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "completed": False})
    admissions_done = await db.admissions.count_documents({"organization_id": org_id})
    
    interested_leads = await db.leads.count_documents({"organization_id": org_id, "status": {"$in": ["Interested", "Admission Done"]}})
    conversion_rate = round((interested_leads / total_leads * 100), 2) if total_leads > 0 else 0
    
    return {
        "total_leads": total_leads,
        "todays_leads": todays_leads,
        "pending_followups": pending_followups,
        "admissions_done": admissions_done,
        "conversion_rate": conversion_rate
    }

@api_router.get("/dashboard/lead-sources")
async def get_lead_source_chart(current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    
    pipeline = [
        {"$match": {"organization_id": org_id}},
        {"$group": {"_id": "$lead_source", "count": {"$sum": 1}}}
    ]
    
    result = await db.leads.aggregate(pipeline).to_list(100)
    return [{"source": item["_id"], "count": item["count"]} for item in result]

@api_router.get("/dashboard/monthly-trend")
async def get_monthly_trend(current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    
    pipeline = [
        {"$match": {"organization_id": org_id}},
        {"$group": {
            "_id": {
                "year": {"$year": "$created_at"},
                "month": {"$month": "$created_at"}
            },
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id.year": 1, "_id.month": 1}},
        {"$limit": 12}
    ]
    
    result = await db.leads.aggregate(pipeline).to_list(100)
    return [{"month": f"{item['_id']['year']}-{item['_id']['month']:02d}", "count": item["count"]} for item in result]

# ==================== Lead Routes ====================
@api_router.get("/leads/check-duplicate")
async def check_duplicate_lead(
    mobile: Optional[str] = None,
    email: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Check if a lead with the given mobile or email already exists.

    Returns the existing lead summary if duplicate found, else `{duplicate: False}`.
    """
    if not mobile and not email:
        return {"duplicate": False}
    org_id = ObjectId(current_user["organization_id"])
    or_clauses = []
    if mobile:
        or_clauses.append({"mobile": mobile})
    if email:
        or_clauses.append({"email": email})
    existing = await db.leads.find_one(
        {"organization_id": org_id, "$or": or_clauses},
        {"name": 1, "mobile": 1, "email": 1, "lead_id": 1, "status": 1, "assigned_to": 1, "created_at": 1},
    )
    if not existing:
        return {"duplicate": False}
    existing["_id"] = str(existing["_id"])
    matched_on = "mobile" if mobile and existing.get("mobile") == mobile else "email"
    return {"duplicate": True, "matched_on": matched_on, "existing_lead": existing}


@api_router.post("/leads")
async def create_lead(data: LeadCreate, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])

    # Validate WhatsApp number (strict +91XXXXXXXXXX) — falls back to mobile if blank
    wa_number = _normalize_whatsapp_number(data.whatsapp_number) if data.whatsapp_number else None

    # Normalize the mobile field for matching against existing leads' whatsapp_number
    # (which is always stored in +91 format). The original mobile is preserved as-is.
    try:
        norm_mobile = _normalize_whatsapp_number(data.mobile)
    except HTTPException:
        norm_mobile = None  # Not Indian format — skip cross-check on mobile

    # Hard-block duplicates on mobile (raw + normalized) OR whatsapp_number OR email
    phone_values = {data.mobile}
    if norm_mobile:
        phone_values.add(norm_mobile)
    if wa_number:
        phone_values.add(wa_number)
    phone_list = [v for v in phone_values if v]
    or_clauses = [{"mobile": {"$in": phone_list}}, {"whatsapp_number": {"$in": phone_list}}]
    if data.email:
        or_clauses.append({"email": data.email})
    duplicate = await db.leads.find_one(
        {"organization_id": org_id, "$or": or_clauses},
        {"name": 1, "mobile": 1, "whatsapp_number": 1, "email": 1, "lead_id": 1},
    )
    if duplicate:
        duplicate["_id"] = str(duplicate["_id"])
        match_on = (
            "mobile" if duplicate.get("mobile") in phone_list
            else "whatsapp_number" if duplicate.get("whatsapp_number") in phone_list
            else "email"
        )
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"Lead already exists with this {match_on}",
                "existing_lead": duplicate,
            },
        )

    # Generate lead_id
    lead_count = await db.leads.count_documents({"organization_id": org_id})
    lead_id = f"LEAD{lead_count + 1:05d}"

    # Auto round-robin if no assignee specified
    assignee = data.assigned_to
    if not assignee:
        assignee = await pick_round_robin_assignee(org_id)

    lead_doc = {
        "lead_id": lead_id,
        "name": data.name,
        "mobile": data.mobile,
        "whatsapp_number": wa_number,
        "email": data.email,
        "course_interested": data.course_interested,
        "state": data.state,
        "city": data.city,
        "lead_source": data.lead_source,
        "assigned_to": assignee,
        "status": data.status,
        "temperature": (data.temperature or "warm").lower(),
        "company_name": data.company_name,
        "budget_range": data.budget_range,
        "preferred_date": data.preferred_date,
        "travellers": data.travellers,
        # Admission consultancy fields
        "target_college": data.target_college,
        "target_college_id": data.target_college_id,
        "course_fee": data.course_fee,
        "admission_year": data.admission_year,
        "commission_pct": data.commission_pct,
        "remarks": data.remarks or "",
        "organization_id": org_id,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await db.leads.insert_one(lead_doc)
    lead_doc["_id"] = str(result.inserted_id)

    # Log timeline event
    await log_lead_event(
        result.inserted_id,
        "lead_created",
        {
            "name": data.name,
            "source": data.lead_source,
            "status": data.status,
            "assigned_to": assignee,
        },
        current_user,
        org_id,
    )

    lead_doc["organization_id"] = str(org_id)
    
    # Create notification for assigned user
    if assignee:
        await db.notifications.insert_one({
            "user_id": assignee,
            "message": f"New lead '{data.name}' has been assigned to you",
            "type": "lead_assigned",
            "lead_id": str(result.inserted_id),
            "read": False,
            "organization_id": org_id,
            "created_at": datetime.now(timezone.utc)
        })

    return lead_doc

@api_router.get("/leads/my/new-count")
async def my_new_leads_count(current_user: dict = Depends(get_current_user)):
    """How many leads are currently assigned to me but still in 'New' status (never touched).
    Used by the sidebar Leads badge so the counselor immediately knows new work has arrived.
    """
    org_id = ObjectId(current_user["organization_id"])
    if current_user["role"] in ("counselor", "telecaller"):
        # Counselor / telecaller — only their own assigned leads
        query = {"organization_id": org_id, "assigned_to": current_user["id"], "status": "New"}
    elif current_user["role"] == "manager":
        # Manager sees New + Unassigned in the whole org
        query = {"organization_id": org_id, "status": "New"}
    elif current_user["role"] in ("org_admin", "super_admin"):
        query = {"organization_id": org_id, "status": "New"}
    else:
        return {"count": 0}
    count = await db.leads.count_documents(query)
    return {"count": count}


@api_router.get("/badge/count")
async def app_badge_count(current_user: dict = Depends(get_current_user)):
    """Unified badge count for the PWA App Badging API.

    Returns the total number of pending actions for the logged-in user:
      new_leads_count + unread_notifications_count
    The mobile/desktop home-screen icon shows this as a numeric badge.
    """
    org_id = ObjectId(current_user["organization_id"])
    # New (untouched) leads visible to the user
    if current_user["role"] in ("counselor", "telecaller"):
        lead_q = {"organization_id": org_id, "assigned_to": current_user["id"], "status": "New"}
    elif current_user["role"] in ("manager", "org_admin", "super_admin"):
        lead_q = {"organization_id": org_id, "status": "New"}
    else:
        lead_q = None

    new_leads = (await db.leads.count_documents(lead_q)) if lead_q else 0
    unread_notifs = await db.notifications.count_documents(
        {"user_id": current_user["id"], "read": {"$ne": True}}
    )
    return {
        "new_leads": new_leads,
        "unread_notifications": unread_notifs,
        "count": new_leads + unread_notifs,
    }


@api_router.get("/leads")
async def get_leads(
    current_user: dict = Depends(get_current_user),
    status: Optional[str] = None,
    source: Optional[str] = None,
    assigned_to: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
):
    org_id = ObjectId(current_user["organization_id"])
    query = {"organization_id": org_id}

    # Strict caller-level visibility: counselor/telecaller see ONLY their own leads
    if current_user["role"] in ("counselor", "telecaller"):
        query["assigned_to"] = current_user["id"]
    elif assigned_to:
        query["assigned_to"] = assigned_to

    if status:
        query["status"] = status
    if source:
        query["lead_source"] = source
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"mobile": {"$regex": search, "$options": "i"}},
            {"whatsapp_number": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]

    # Pagination guardrails
    page = max(1, int(page or 1))
    limit = max(1, min(int(limit or 50), 500))
    skip = (page - 1) * limit

    total = await db.leads.count_documents(query)
    cursor = (
        db.leads.find(query, {"organization_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    leads = await cursor.to_list(limit)
    for lead in leads:
        lead["_id"] = str(lead["_id"])

    total_pages = (total + limit - 1) // limit if limit else 1
    return {
        "items": leads,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
    }


@api_router.get("/leads/form-config")
async def lead_form_config(current_user: dict = Depends(get_current_user)):
    """Industry-specific extra fields + services list for the Manual Add-Lead form.

    Mirrors the public widget config so every capture surface stays in sync.
    NOTE: declared BEFORE /leads/{lead_id} so FastAPI matches the static path first.
    """
    org_id = ObjectId(current_user["organization_id"])
    industry = current_user.get("industry") or "generic"
    fields = get_widget_fields(industry)
    services_cursor = db.services.find(
        {"organization_id": org_id, "active": {"$ne": False}},
        {"name": 1}
    ).sort("name", 1)
    services = [s["name"] async for s in services_cursor]
    return {"industry": industry, "fields": fields, "services": services}


@api_router.get("/leads/csv-sample")
async def download_csv_sample(current_user: dict = Depends(get_current_user)):
    """Download a sample CSV file with headers + 3 example rows.

    NOTE: declared BEFORE /leads/{lead_id} so FastAPI matches the static path first.
    """
    csv_text = (
        "name,mobile,email,course,source,state,city,company_name,budget_range,preferred_date,travellers,temperature\n"
        "Aisha Khan,9876500101,aisha@example.com,MBA Full-time,Facebook Ad,Maharashtra,Mumbai,,,,,hot\n"
        "Rohit Sharma,9876500102,rohit@example.com,2 BHK,Website,Karnataka,Bengaluru,,₹50L - ₹1Cr,,,warm\n"
        "Sneha Patel,9876500103,sneha@example.com,Goa Package,Google Ad,Gujarat,Ahmedabad,,,2026-06-15,3,warm\n"
    )
    return StreamingResponse(
        io.BytesIO(csv_text.encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leadtrak_sample_leads.csv"},
    )


@api_router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    lid = safe_object_id(lead_id, "lead_id")
    lead = await db.leads.find_one({"_id": lid, "organization_id": org_id}, {"organization_id": 0})
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Strict caller-level visibility
    if current_user["role"] in ("counselor", "telecaller") and lead.get("assigned_to") != current_user["id"]:
        raise HTTPException(status_code=404, detail="Lead not found")

    lead["_id"] = str(lead["_id"])
    return lead

@api_router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, data: LeadUpdate, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    lid = safe_object_id(lead_id, "lead_id")
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}

    # Validate WhatsApp number if being changed (strict +91 format) or clear it if blank string
    if "whatsapp_number" in update_data:
        wn = update_data["whatsapp_number"]
        if wn == "" or wn is None:
            update_data["whatsapp_number"] = None
        else:
            update_data["whatsapp_number"] = _normalize_whatsapp_number(wn)

    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    # Read current lead so we can log diffs
    current = await db.leads.find_one({"_id": lid, "organization_id": org_id})
    if not current:
        raise HTTPException(status_code=404, detail="Lead not found")

    result = await db.leads.update_one(
        {"_id": lid, "organization_id": org_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Log meaningful changes
    if "status" in update_data and current.get("status") != update_data["status"]:
        new_status = update_data["status"]
        event_type = (
            "lead_lost" if new_status == "Lost"
            else "admission_recorded" if new_status == "Admission Done"
            else "status_changed"
        )
        await log_lead_event(
            lead_id,
            event_type,
            {"from": current.get("status"), "to": new_status},
            current_user,
            org_id,
        )
    if "assigned_to" in update_data and current.get("assigned_to") != update_data["assigned_to"]:
        await log_lead_event(
            lead_id,
            "assigned",
            {"from": current.get("assigned_to"), "to": update_data["assigned_to"]},
            current_user,
            org_id,
        )
    if "temperature" in update_data and current.get("temperature") != update_data["temperature"]:
        await log_lead_event(
            lead_id,
            "temperature_changed",
            {"from": current.get("temperature") or "warm", "to": update_data["temperature"]},
            current_user,
            org_id,
        )
    return {"message": "Lead updated successfully"}

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    lid = safe_object_id(lead_id, "lead_id")
    
    if current_user["role"] not in ["super_admin", "org_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete leads")
    
    result = await db.leads.delete_one({"_id": lid, "organization_id": org_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    return {"message": "Lead deleted successfully"}

@api_router.post("/leads/{lead_id}/assign")
async def assign_lead(lead_id: str, assigned_to: str, current_user: dict = Depends(get_current_user)):
    # SECURITY: only managers / admins / super admins can re-assign leads
    if current_user["role"] not in ("super_admin", "org_admin", "manager"):
        raise HTTPException(status_code=403, detail="Not authorized to assign leads")

    org_id = ObjectId(current_user["organization_id"])
    lid = safe_object_id(lead_id, "lead_id")
    aid = safe_object_id(assigned_to, "assigned_to")

    # SECURITY: target user MUST belong to the same organization (prevent IDOR / cross-tenant assignment)
    assignee = await db.users.find_one({"_id": aid, "organization_id": org_id}, {"name": 1, "active": 1})
    if not assignee:
        raise HTTPException(status_code=400, detail="Assignee not found in your organization")
    if assignee.get("active") is False:
        raise HTTPException(status_code=400, detail="Cannot assign to a deactivated user")

    result = await db.leads.update_one(
        {"_id": lid, "organization_id": org_id},
        {"$set": {"assigned_to": assigned_to}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Create notification
    lead = await db.leads.find_one({"_id": lid}, {"name": 1})
    await db.notifications.insert_one({
        "user_id": assigned_to,
        "message": f"Lead '{(lead or {}).get('name', '')}' has been assigned to you",
        "type": "lead_assigned",
        "lead_id": lead_id,
        "read": False,
        "organization_id": org_id,
        "created_at": datetime.now(timezone.utc)
    })

    return {"message": "Lead assigned successfully"}


@api_router.post("/leads/{lead_id}/transfer")
async def transfer_lead(lead_id: str, data: LeadTransfer, current_user: dict = Depends(get_current_user)):
    """Transfer a lead to another team member. Only manager / org_admin / super_admin can transfer."""
    if current_user["role"] not in ("super_admin", "org_admin", "manager"):
        raise HTTPException(status_code=403, detail="Only managers and admins can transfer leads")

    org_id = ObjectId(current_user["organization_id"])
    lid = safe_object_id(lead_id, "lead_id")
    lead = await db.leads.find_one({"_id": lid, "organization_id": org_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Validate new assignee belongs to same org
    new_aid = safe_object_id(data.new_assignee_id, "new_assignee_id")
    new_assignee = await db.users.find_one({"_id": new_aid, "organization_id": org_id})
    if not new_assignee:
        raise HTTPException(status_code=400, detail="New assignee not found in your organization")

    previous_assignee_id = lead.get("assigned_to")
    previous_assignee = None
    if previous_assignee_id:
        try:
            previous_assignee = await db.users.find_one({"_id": ObjectId(previous_assignee_id)}, {"name": 1})
        except Exception:
            previous_assignee = None

    await db.leads.update_one(
        {"_id": lid, "organization_id": org_id},
        {"$set": {"assigned_to": data.new_assignee_id}},
    )

    await log_lead_event(
        lid,
        "transferred",
        {
            "from_user_id": previous_assignee_id,
            "from_user_name": previous_assignee.get("name") if previous_assignee else None,
            "to_user_id": data.new_assignee_id,
            "to_user_name": new_assignee.get("name"),
            "reason": data.reason or "",
        },
        current_user,
        org_id,
    )

    # Notify new assignee
    await db.notifications.insert_one({
        "user_id": data.new_assignee_id,
        "message": f"Lead '{lead['name']}' has been transferred to you by {current_user['name']}",
        "type": "lead_transferred",
        "lead_id": lead_id,
        "read": False,
        "organization_id": org_id,
        "created_at": datetime.now(timezone.utc),
    })

    return {"message": "Lead transferred successfully"}


@api_router.get("/leads/{lead_id}/timeline")
async def get_lead_timeline(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Return the full chronological timeline for a lead. Tenant isolated.

    Counselor/telecaller may only view timeline for leads assigned to them.
    """
    org_id = ObjectId(current_user["organization_id"])
    lid = safe_object_id(lead_id, "lead_id")
    lead = await db.leads.find_one({"_id": lid, "organization_id": org_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if current_user["role"] in ("counselor", "telecaller") and lead.get("assigned_to") != current_user["id"]:
        raise HTTPException(status_code=404, detail="Lead not found")
    events = await db.lead_timeline.find(
        {"lead_id": lid, "organization_id": org_id}
    ).sort("created_at", 1).to_list(1000)
    for e in events:
        e["_id"] = str(e["_id"])
        e["lead_id"] = str(e["lead_id"])
        e.pop("organization_id", None)
        if isinstance(e.get("created_at"), datetime):
            e["created_at"] = e["created_at"].isoformat()
    return events


class LogCallRequest(BaseModel):
    summary: str                                  # what happened on the call (required)
    call_disposition: Optional[str] = "Connected" # Connected, Not Picked, Switched Off, Busy, Wrong Number, Call Back Later
    voice_recording_url: Optional[str] = None
    voice_recording_public_id: Optional[str] = None
    voice_recording_duration: Optional[float] = None
    new_status: Optional[str] = None
    next_followup_date: Optional[str] = None      # YYYY-MM-DD
    next_followup_time: Optional[str] = None      # HH:MM
    next_followup_remarks: Optional[str] = None


@api_router.post("/leads/{lead_id}/log-call")
async def log_call(lead_id: str, data: LogCallRequest, current_user: dict = Depends(get_current_user)):
    """Counselor logs a call that JUST happened. One dialog captures everything:
    voice + remarks + status update + optional next follow-up schedule.

    Creates a synthetic followup doc (marked complete immediately) so it shows up
    on the Follow-ups page in the 'Done' state with the audio + outcome.
    """
    summary = (data.summary or "").strip()
    if not summary:
        raise HTTPException(status_code=400, detail="Outcome / remarks are required")

    org_id = ObjectId(current_user["organization_id"])
    lid = safe_object_id(lead_id, "lead_id")
    lead = await db.leads.find_one({"_id": lid, "organization_id": org_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Counselors / telecallers may only log calls on leads assigned to them
    if current_user["role"] in ("counselor", "telecaller") and lead.get("assigned_to") != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only log calls on leads assigned to you")

    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    now_str = now.strftime("%H:%M")

    # 1) Insert a completed-on-creation follow-up doc so it shows in Follow-ups page history
    fu_doc = {
        "lead_id": str(lid),
        "lead_name": lead.get("name"),
        "lead_mobile": lead.get("mobile"),
        "followup_date": today_str,
        "followup_time": now_str,
        "remarks": f"Call logged just now — {summary[:120]}",
        "completed": True,
        "completed_at": now,
        "completed_by_id": current_user["id"],
        "completed_by_name": current_user.get("name"),
        "completion_summary": summary,
        "voice_recording_url": data.voice_recording_url,
        "voice_recording_public_id": data.voice_recording_public_id,
        "voice_recording_duration": data.voice_recording_duration,
        "organization_id": org_id,
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name"),
        "created_at": now,
    }
    fu_res = await db.followups.insert_one(fu_doc)

    # 2) Timeline event — followup_completed (so it renders the rich way with outcome+audio)
    # If call wasn't connected, auto-schedule retry 1 day later 11am (industry standard call-center practice)
    disposition = (data.call_disposition or "Connected").strip()
    no_connect = disposition in ("Not Picked", "Switched Off", "Busy", "Call Back Later")
    await log_lead_event(
        lid, "followup_completed",
        {
            "followup_id": str(fu_res.inserted_id),
            "scheduled_remarks": None,  # call was unplanned
            "outcome_summary": summary,
            "followup_date": today_str,
            "followup_time": now_str,
            "voice_recording_url": data.voice_recording_url,
            "voice_recording_duration": data.voice_recording_duration,
            "call_disposition": disposition,
            "logged_inline": True,
        },
        current_user, org_id,
    )

    # 3) Status change (optional) — override to "Not Reachable" if no-connect AND user didn't pick a status
    effective_status = data.new_status
    if no_connect and not effective_status:
        effective_status = "Not Reachable"
    if effective_status and effective_status != lead.get("status"):
        old_status = lead.get("status")
        await db.leads.update_one({"_id": lid}, {"$set": {"status": effective_status}})
        ev_type = "lead_lost" if effective_status == "Lost" else "status_changed"
        await log_lead_event(lid, ev_type, {"from": old_status, "to": effective_status}, current_user, org_id)

    out = {"message": "Call logged", "followup_id": str(fu_res.inserted_id), "disposition": disposition}

    # 4) Schedule next follow-up: explicit user-provided date wins; otherwise auto-retry next day for no-connects
    auto_next = None
    if not data.next_followup_date and no_connect:
        next_day = (now + timedelta(days=1)).strftime("%Y-%m-%d")
        auto_next = {"date": next_day, "time": "11:00", "remarks": f"Auto-scheduled retry — previous call was {disposition.lower()}"}

    target_next = None
    if data.next_followup_date:
        target_next = {"date": data.next_followup_date, "time": data.next_followup_time or "10:00", "remarks": (data.next_followup_remarks or "").strip() or f"Scheduled from previous call. Prior outcome: {summary[:80]}"}
    elif auto_next:
        target_next = auto_next

    if target_next:
        next_doc = {
            "lead_id": str(lid),
            "lead_name": lead.get("name"),
            "lead_mobile": lead.get("mobile"),
            "followup_date": data.next_followup_date,
            "followup_time": data.next_followup_time or "10:00",
            "remarks": (data.next_followup_remarks or "").strip() or f"Scheduled from previous call. Prior outcome: {summary[:80]}",
            "completed": False,
            "organization_id": org_id,
            "created_by": current_user["id"],
            "created_by_name": current_user.get("name"),
            "created_at": now,
        }
        nxt = await db.followups.insert_one(next_doc)
        await log_lead_event(
            lid, "followup_added",
            {
                "followup_id": str(nxt.inserted_id),
                "remarks": next_doc["remarks"],
                "followup_date": next_doc["followup_date"],
                "followup_time": next_doc["followup_time"],
            },
            current_user, org_id,
        )
        out["next_followup_id"] = str(nxt.inserted_id)

    return out


# ==================== Lead Comments (note_added in timeline) ====================
class LeadCommentCreate(BaseModel):
    note: str
    notify_assignee: bool = True  # send notification to the assigned counselor


@api_router.post("/leads/{lead_id}/comments")
async def add_lead_comment(lead_id: str, data: LeadCommentCreate, current_user: dict = Depends(get_current_user)):
    """Add an internal comment on a lead's timeline.

    Use case: Manager/Admin commenting on a counselor's lead ("Please follow up after EMI offer
    discussion", "This lead requires senior intervention", etc.). The assigned counselor sees
    the comment in the lead timeline AND in their notifications panel.
    """
    note = (data.note or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    if len(note) > 2000:
        raise HTTPException(status_code=400, detail="Comment is too long (max 2000 chars)")

    org_id = ObjectId(current_user["organization_id"])
    lid = safe_object_id(lead_id, "lead_id")
    lead = await db.leads.find_one({"_id": lid, "organization_id": org_id}, {"name": 1, "assigned_to": 1})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Counselors/telecallers may only comment on leads assigned to them
    if current_user["role"] in ("counselor", "telecaller") and lead.get("assigned_to") != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only comment on leads assigned to you")

    await log_lead_event(
        lid,
        "note_added",
        {"note": note, "from_role": current_user.get("role")},
        current_user,
        org_id,
    )

    # Notify the assigned counselor if the commenter is someone else
    if data.notify_assignee and lead.get("assigned_to") and lead["assigned_to"] != current_user["id"]:
        await db.notifications.insert_one({
            "user_id": lead["assigned_to"],
            "message": f"{current_user.get('name')} commented on lead '{lead.get('name')}': {note[:120]}{'…' if len(note) > 120 else ''}",
            "type": "lead_comment",
            "lead_id": str(lid),
            "read": False,
            "organization_id": org_id,
            "created_at": datetime.now(timezone.utc),
        })

    return {"message": "Comment added", "lead_id": str(lid)}


@api_router.get("/reports/caller-leads/{user_id}")
async def report_caller_leads(user_id: str, current_user: dict = Depends(get_current_user)):
    """Drill-down: every lead currently assigned to the given counselor/telecaller/manager.
    Used by the Reports page so managers can review a specific caller's full pipeline.
    """
    if current_user["role"] not in ("super_admin", "org_admin", "manager"):
        raise HTTPException(status_code=403, detail="Only managers and admins can view caller leads")
    org_id = ObjectId(current_user["organization_id"])
    # Validate target user exists in same org
    target_uid = safe_object_id(user_id, "user_id")
    target = await db.users.find_one({"_id": target_uid, "organization_id": org_id}, {"name": 1, "role": 1, "email": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found in your organization")

    leads = await db.leads.find(
        {"organization_id": org_id, "assigned_to": str(target_uid)},
        {
            "name": 1, "mobile": 1, "email": 1, "status": 1, "lead_id": 1,
            "source": 1, "temperature": 1, "created_at": 1, "updated_at": 1,
        },
    ).sort("created_at", -1).to_list(500)

    for lead in leads:
        lead["_id"] = str(lead["_id"])
        for k in ("created_at", "updated_at"):
            if isinstance(lead.get(k), datetime):
                lead[k] = lead[k].isoformat()

    return {
        "user": {"id": str(target_uid), "name": target.get("name"), "role": target.get("role"), "email": target.get("email")},
        "leads": leads,
        "total": len(leads),
    }


# ==================== Demos (Phase 8) ====================
def _build_demo_share_links(lead: dict, demo_doc: dict) -> dict:
    """Build prefilled WhatsApp and mailto links for the demo invite.

    The actual delivery is done by the caller clicking the link in the UI —
    we do NOT call any external API here (works without Twilio / SendGrid creds).
    """
    when = f"{demo_doc.get('scheduled_date', '')} at {demo_doc.get('scheduled_time', '')}"
    mode = demo_doc.get("demo_mode", "Online")
    link = demo_doc.get("demo_link") or "(link will be shared shortly)"
    name = lead.get("name", "there")
    msg = (
        f"Hi {name}, "
        f"your demo is scheduled on {when} ({mode}). "
        f"Join here: {link}. "
        f"Looking forward!"
    )
    from urllib.parse import quote
    encoded_msg = quote(msg)
    mobile = (lead.get("mobile") or "").lstrip("+").replace(" ", "").replace("-", "")
    whatsapp = f"https://wa.me/{mobile}?text={encoded_msg}" if mobile else ""
    email = lead.get("email") or ""
    subject = quote(f"Your demo on {when}")
    body = encoded_msg
    mailto = f"mailto:{email}?subject={subject}&body={body}" if email else ""
    return {"whatsapp": whatsapp, "mailto": mailto, "message": msg}


def _serialize_demo(d: dict) -> dict:
    d["_id"] = str(d["_id"])
    d.pop("organization_id", None)
    for k in ("created_at", "completed_at"):
        if isinstance(d.get(k), datetime):
            d[k] = d[k].isoformat()
    return d


@api_router.post("/demos")
async def create_demo(data: DemoCreate, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    lid = safe_object_id(data.lead_id, "lead_id")
    lead = await db.leads.find_one({"_id": lid, "organization_id": org_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    owner_oid = safe_object_id(data.demo_owner_id, "demo_owner_id")
    owner = await db.users.find_one({"_id": owner_oid, "organization_id": org_id}, {"name": 1, "role": 1})
    if not owner:
        raise HTTPException(status_code=400, detail="Demo owner not found in your organization")

    demo_doc = {
        "lead_id": str(lid),
        "lead_name": lead.get("name"),
        "lead_mobile": lead.get("mobile"),
        "lead_email": lead.get("email"),
        "demo_owner_id": data.demo_owner_id,
        "demo_owner_name": owner.get("name"),
        "scheduled_date": data.scheduled_date,
        "scheduled_time": data.scheduled_time,
        "demo_mode": data.demo_mode,
        "demo_link": data.demo_link or "",
        "agenda": data.agenda or "",
        "status": "Scheduled",
        "outcome": None,
        "feedback": None,
        "recording_url": None,
        "scheduled_by_id": current_user["id"],
        "scheduled_by_name": current_user["name"],
        "organization_id": org_id,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.demos.insert_one(demo_doc)
    demo_doc["_id"] = result.inserted_id

    # Log to lead timeline
    await log_lead_event(
        lid, "demo_scheduled",
        {
            "demo_id": str(result.inserted_id),
            "demo_owner_id": data.demo_owner_id,
            "demo_owner_name": owner.get("name"),
            "scheduled_date": data.scheduled_date,
            "scheduled_time": data.scheduled_time,
            "demo_mode": data.demo_mode,
            "demo_link": data.demo_link,
            "agenda": data.agenda,
        },
        current_user, org_id,
    )

    # Notify demo owner
    if str(owner_oid) != current_user["id"]:
        await db.notifications.insert_one({
            "user_id": str(owner_oid),
            "message": f"Demo scheduled with {lead.get('name')} on {data.scheduled_date} at {data.scheduled_time}",
            "type": "demo_assigned",
            "read": False,
            "organization_id": org_id,
            "created_at": datetime.now(timezone.utc),
        })

    share = _build_demo_share_links(lead, demo_doc)
    out = _serialize_demo(demo_doc)
    out["share"] = share
    return out


@api_router.get("/demos")
async def list_demos(
    current_user: dict = Depends(get_current_user),
    scope: Optional[str] = "all",     # all | mine | upcoming | completed
):
    org_id = ObjectId(current_user["organization_id"])
    query = {"organization_id": org_id}
    # Caller visibility: counselor/telecaller see ONLY demos they scheduled or are owner of
    if current_user["role"] in ("counselor", "telecaller"):
        query["$or"] = [
            {"demo_owner_id": current_user["id"]},
            {"scheduled_by_id": current_user["id"]},
        ]
    if scope == "mine":
        # Explicit "mine" filter takes precedence
        query = {"organization_id": org_id, "demo_owner_id": current_user["id"]}
    if scope == "upcoming":
        query["status"] = "Scheduled"
    elif scope == "completed":
        query["status"] = "Completed"
    demos = await db.demos.find(query).sort("scheduled_date", -1).to_list(500)
    return [_serialize_demo(d) for d in demos]


@api_router.get("/demos/{demo_id}")
async def get_demo(demo_id: str, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    did = safe_object_id(demo_id, "demo_id")
    demo = await db.demos.find_one({"_id": did, "organization_id": org_id})
    if not demo:
        raise HTTPException(status_code=404, detail="Demo not found")
    if current_user["role"] in ("counselor", "telecaller"):
        if demo.get("demo_owner_id") != current_user["id"] and demo.get("scheduled_by_id") != current_user["id"]:
            raise HTTPException(status_code=404, detail="Demo not found")
    lead = await db.leads.find_one({"_id": ObjectId(demo["lead_id"])}, {"name": 1, "mobile": 1, "email": 1})
    out = _serialize_demo(demo)
    out["share"] = _build_demo_share_links(lead or {}, demo)
    return out


@api_router.post("/demos/{demo_id}/complete")
async def complete_demo(demo_id: str, data: DemoComplete, current_user: dict = Depends(get_current_user)):
    """Demo presenter marks the demo complete with outcome + feedback."""
    org_id = ObjectId(current_user["organization_id"])
    did = safe_object_id(demo_id, "demo_id")
    demo = await db.demos.find_one({"_id": did, "organization_id": org_id})
    if not demo:
        raise HTTPException(status_code=404, detail="Demo not found")
    if demo.get("demo_owner_id") != current_user["id"] and current_user["role"] not in ("super_admin", "org_admin", "manager"):
        raise HTTPException(status_code=403, detail="Only the demo owner or a manager can complete this demo")

    status_map = {"interested": "Completed", "not_interested": "Completed", "reschedule": "Rescheduled", "no_show": "No Show"}
    new_status = status_map.get(data.outcome, "Completed")

    await db.demos.update_one(
        {"_id": did, "organization_id": org_id},
        {"$set": {
            "status": new_status,
            "outcome": data.outcome,
            "feedback": data.feedback or "",
            "recording_url": data.recording_url or "",
            "completed_by_id": current_user["id"],
            "completed_by_name": current_user["name"],
            "completed_at": datetime.now(timezone.utc),
        }},
    )

    # Log timeline
    lid = ObjectId(demo["lead_id"])
    await log_lead_event(
        lid, "demo_completed",
        {
            "demo_id": demo_id,
            "demo_owner_name": demo.get("demo_owner_name"),
            "outcome": data.outcome,
            "feedback": data.feedback or "",
            "status": new_status,
        },
        current_user, org_id,
    )

    # Auto-update lead status based on demo outcome
    if data.outcome == "interested":
        await db.leads.update_one({"_id": lid}, {"$set": {"status": "Interested"}})
        await log_lead_event(lid, "status_changed", {"from": demo.get("lead_status", "—"), "to": "Interested"}, current_user, org_id)
    elif data.outcome == "not_interested":
        await db.leads.update_one({"_id": lid}, {"$set": {"status": "Lost"}})
        await log_lead_event(lid, "lead_lost", {"from": "—", "to": "Lost", "reason": "Demo: not interested"}, current_user, org_id)

    return {"message": "Demo completed", "status": new_status}


@api_router.post("/followups/{followup_id}/complete")
async def complete_followup(followup_id: str, data: FollowupComplete, current_user: dict = Depends(get_current_user)):
    """Rich follow-up completion: captures summary, voice, status change, next action all in one call."""
    org_id = ObjectId(current_user["organization_id"])
    fid = safe_object_id(followup_id, "followup_id")
    fu = await db.followups.find_one({"_id": fid, "organization_id": org_id})
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")

    lid = safe_object_id(fu["lead_id"], "lead_id")
    lead = await db.leads.find_one({"_id": lid, "organization_id": org_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Update the follow-up itself with summary + voice + completion flag
    update_doc = {
        "completed": True,
        "completed_at": datetime.now(timezone.utc),
        "completed_by_id": current_user["id"],
        "completed_by_name": current_user["name"],
        "completion_summary": data.summary,
    }
    if data.voice_recording_url:
        update_doc["voice_recording_url"] = data.voice_recording_url
        update_doc["voice_recording_public_id"] = data.voice_recording_public_id
        update_doc["voice_recording_duration"] = data.voice_recording_duration
    await db.followups.update_one({"_id": fid}, {"$set": update_doc})

    # Log the completion as a SEPARATE event (different from 'followup_added' which is when it was scheduled)
    await log_lead_event(
        lid, "followup_completed",
        {
            "followup_id": str(fid),
            "scheduled_remarks": fu.get("remarks"),
            "outcome_summary": data.summary,
            "followup_date": fu.get("followup_date"),
            "followup_time": fu.get("followup_time"),
            "voice_recording_url": data.voice_recording_url,
            "voice_recording_duration": data.voice_recording_duration,
            "next_action": data.next_action,
        },
        current_user, org_id,
    )

    # Status change
    if data.new_status and data.new_status != lead.get("status"):
        old_status = lead.get("status")
        await db.leads.update_one({"_id": lid}, {"$set": {"status": data.new_status}})
        event_type = "lead_lost" if data.new_status == "Lost" else "status_changed"
        await log_lead_event(lid, event_type, {"from": old_status, "to": data.new_status}, current_user, org_id)

    out = {"message": "Follow-up completed"}

    # Branch: next action
    if data.next_action == "next_followup" and data.next_followup_date:
        new_fu = await db.followups.insert_one({
            "lead_id": str(lid),
            "followup_date": data.next_followup_date,
            "followup_time": data.next_followup_time or "10:00",
            "remarks": f"Scheduled from previous follow-up. Prior summary: {data.summary[:80]}",
            "completed": False,
            "organization_id": org_id,
            "created_by": current_user["id"],
            "created_by_name": current_user.get("name"),
            "created_at": datetime.now(timezone.utc),
        })
        out["next_followup_id"] = str(new_fu.inserted_id)
    elif data.next_action == "book_demo" and data.demo:
        # Reuse create_demo logic inline
        owner_oid = safe_object_id(data.demo.demo_owner_id, "demo_owner_id")
        owner = await db.users.find_one({"_id": owner_oid, "organization_id": org_id}, {"name": 1})
        if owner:
            demo_doc = {
                "lead_id": str(lid),
                "lead_name": lead.get("name"),
                "lead_mobile": lead.get("mobile"),
                "lead_email": lead.get("email"),
                "demo_owner_id": data.demo.demo_owner_id,
                "demo_owner_name": owner.get("name"),
                "scheduled_date": data.demo.scheduled_date,
                "scheduled_time": data.demo.scheduled_time,
                "demo_mode": data.demo.demo_mode,
                "demo_link": data.demo.demo_link or "",
                "agenda": data.demo.agenda or "",
                "status": "Scheduled",
                "scheduled_by_id": current_user["id"],
                "scheduled_by_name": current_user["name"],
                "organization_id": org_id,
                "created_at": datetime.now(timezone.utc),
            }
            demo_res = await db.demos.insert_one(demo_doc)
            await log_lead_event(
                lid, "demo_scheduled",
                {
                    "demo_id": str(demo_res.inserted_id),
                    "demo_owner_name": owner.get("name"),
                    "scheduled_date": data.demo.scheduled_date,
                    "scheduled_time": data.demo.scheduled_time,
                    "demo_mode": data.demo.demo_mode,
                    "demo_link": data.demo.demo_link,
                },
                current_user, org_id,
            )
            demo_doc["_id"] = demo_res.inserted_id
            out["demo"] = _serialize_demo(demo_doc)
            out["demo"]["share"] = _build_demo_share_links(lead, demo_doc)

    return out


# ==================== Followup Routes ====================
@api_router.post("/followups")
async def create_followup(data: FollowupCreate, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])

    followup_doc = {
        "lead_id": data.lead_id,
        "followup_date": data.followup_date,
        "followup_time": data.followup_time,
        "remarks": data.remarks,
        "next_followup": data.next_followup,
        "voice_recording_url": data.voice_recording_url,
        "voice_recording_public_id": data.voice_recording_public_id,
        "voice_recording_duration": data.voice_recording_duration,
        "completed": False,
        "organization_id": org_id,
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name"),
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await db.followups.insert_one(followup_doc)
    followup_doc["_id"] = str(result.inserted_id)
    followup_doc["organization_id"] = str(org_id)

    # Log timeline event for this lead
    await log_lead_event(
        data.lead_id,
        "followup_added",
        {
            "followup_id": followup_doc["_id"],
            "followup_date": data.followup_date,
            "followup_time": data.followup_time,
            "remarks": data.remarks,
            "next_followup": data.next_followup,
            "voice_recording_url": data.voice_recording_url,
            "voice_recording_duration": data.voice_recording_duration,
        },
        current_user,
        org_id,
    )

    return followup_doc

@api_router.get("/followups")
async def get_followups(
    current_user: dict = Depends(get_current_user),
    filter_type: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
):
    org_id = ObjectId(current_user["organization_id"])
    query = {"organization_id": org_id}

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if filter_type == "today":
        query["followup_date"] = today
    elif filter_type == "upcoming":
        query["followup_date"] = {"$gt": today}
    elif filter_type == "missed":
        query["followup_date"] = {"$lt": today}
        query["completed"] = False

    page = max(1, int(page or 1))
    limit = max(1, min(int(limit or 50), 500))
    skip = (page - 1) * limit

    total = await db.followups.count_documents(query)
    cursor = (
        db.followups.find(query, {"organization_id": 0})
        .sort("followup_date", 1)
        .skip(skip)
        .limit(limit)
    )
    followups = await cursor.to_list(limit)

    # Populate lead details
    for followup in followups:
        followup["_id"] = str(followup["_id"])
        try:
            lead = await db.leads.find_one(
                {"_id": ObjectId(followup["lead_id"])}, {"name": 1, "mobile": 1}
            )
            if lead:
                followup["lead_name"] = lead["name"]
                followup["lead_mobile"] = lead["mobile"]
        except Exception:
            pass

    total_pages = (total + limit - 1) // limit if limit else 1
    return {
        "items": followups,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
    }

@api_router.put("/followups/{followup_id}/complete")
async def complete_followup_simple(followup_id: str, current_user: dict = Depends(get_current_user)):
    """Lightweight 'mark as done' (no summary/voice). For rich completion use POST /followups/{id}/complete."""
    org_id = ObjectId(current_user["organization_id"])
    fid = safe_object_id(followup_id, "followup_id")
    result = await db.followups.update_one(
        {"_id": fid, "organization_id": org_id},
        {"$set": {"completed": True}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Followup not found")
    
    return {"message": "Followup marked as completed"}

# ==================== Admission Routes ====================
@api_router.post("/admissions")
async def create_admission(data: AdmissionCreate, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])

    # Validate against service min_price (Phase 6) if a service is referenced
    service = None
    if data.service_id:
        sid = safe_object_id(data.service_id, "service_id")
        service = await db.services.find_one({"_id": sid, "organization_id": org_id})
        if not service:
            raise HTTPException(status_code=404, detail="Service not found")
        # Server-side authoritative pricing: base from service, discount from input, recompute fees
        service_base = service.get("base_price", 0)
        base_price = data.base_price if data.base_price is not None else service_base
        discount = data.discount_amount or 0
        # Trust server-recomputed final price (= base − discount), ignore client-sent fees
        computed_fees = max(0.0, base_price - discount)
        min_price = service.get("min_price", 0)
        if computed_fees < min_price:
            raise HTTPException(
                status_code=400,
                detail=f"Final price ₹{computed_fees:,.0f} is below the minimum allowed (₹{min_price:,.0f}) for this service. Increase the price or reduce the discount.",
            )
        final_fees = computed_fees
    else:
        base_price = data.base_price
        discount = data.discount_amount or 0
        final_fees = data.fees

    admission_doc = {
        "student_name": data.student_name,
        "mobile": data.mobile,
        "course": data.course,
        "fees": final_fees,
        "admission_date": data.admission_date,
        "lead_id": data.lead_id,
        "service_id": data.service_id,
        "service_name": service.get("name") if service else None,
        "base_price": base_price,
        "discount_amount": discount,
        "discount_reason": data.discount_reason or "",
        "counselor_name": current_user["name"],
        "organization_id": org_id,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await db.admissions.insert_one(admission_doc)
    admission_doc["_id"] = str(result.inserted_id)
    admission_doc["organization_id"] = str(org_id)
    
    # Update lead status if lead_id provided + log timeline event
    if data.lead_id:
        await db.leads.update_one(
            {"_id": ObjectId(data.lead_id)},
            {"$set": {"status": "Admission Done"}}
        )
        await log_lead_event(
            data.lead_id,
            "admission_recorded",
            {
                "admission_id": admission_doc["_id"],
                "offering": service.get("name") if service else data.course,
                "amount": final_fees,
                "base_price": base_price,
                "discount_amount": discount,
                "discount_reason": data.discount_reason or "",
                "date": data.admission_date,
            },
            current_user,
            org_id,
        )

    return admission_doc

@api_router.get("/admissions")
async def get_admissions(current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    
    admissions = await db.admissions.find({"organization_id": org_id}, {"organization_id": 0}).sort("created_at", -1).to_list(1000)
    for admission in admissions:
        admission["_id"] = str(admission["_id"])
    
    return admissions

# ==================== Task Routes ====================
@api_router.post("/tasks")
async def create_task(data: TaskCreate, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    
    task_doc = {
        "title": data.title,
        "description": data.description,
        "assigned_to": data.assigned_to,
        "due_date": data.due_date,
        "priority": data.priority,
        "status": "pending",
        "organization_id": org_id,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await db.tasks.insert_one(task_doc)
    task_doc["_id"] = str(result.inserted_id)
    task_doc["organization_id"] = str(org_id)
    
    # Create notification
    await db.notifications.insert_one({
        "user_id": data.assigned_to,
        "message": f"New task assigned: {data.title}",
        "type": "task_assigned",
        "read": False,
        "organization_id": org_id,
        "created_at": datetime.now(timezone.utc)
    })
    
    return task_doc

@api_router.get("/tasks")
async def get_tasks(current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    
    if current_user["role"] in ["counselor", "telecaller"]:
        tasks = await db.tasks.find({"organization_id": org_id, "assigned_to": current_user["id"]}, {"organization_id": 0}).sort("due_date", 1).to_list(1000)
    else:
        tasks = await db.tasks.find({"organization_id": org_id}, {"organization_id": 0}).sort("due_date", 1).to_list(1000)
    
    for task in tasks:
        task["_id"] = str(task["_id"])
    
    return tasks

@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, data: TaskUpdate, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    result = await db.tasks.update_one(
        {"_id": ObjectId(task_id), "organization_id": org_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {"message": "Task updated successfully"}

# ==================== Notification Routes ====================
@api_router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    notifications = await db.notifications.find({"user_id": current_user["id"]}, {"organization_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    
    for notif in notifications:
        notif["_id"] = str(notif["_id"])
    
    return notifications

@api_router.put("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.notifications.update_one(
        {"_id": ObjectId(notif_id), "user_id": current_user["id"]},
        {"$set": {"read": True}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"message": "Notification marked as read"}

# ==================== Lead Source Routes ====================
@api_router.post("/lead-sources")
async def create_lead_source(data: LeadSourceCreate, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    
    existing = await db.lead_sources.find_one({"name": data.name, "organization_id": org_id})
    if existing:
        raise HTTPException(status_code=400, detail="Lead source already exists")
    
    source_doc = {
        "name": data.name,
        "organization_id": org_id,
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await db.lead_sources.insert_one(source_doc)
    source_doc["_id"] = str(result.inserted_id)
    source_doc["organization_id"] = str(org_id)
    
    return source_doc

@api_router.get("/lead-sources")
async def get_lead_sources(current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    
    sources = await db.lead_sources.find({"organization_id": org_id}, {"organization_id": 0}).to_list(100)
    for source in sources:
        source["_id"] = str(source["_id"])
    
    return sources

# ==================== User Management Routes ====================
class SelfProfileUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    avatar_url: Optional[str] = None  # allow clearing ("") to remove


@api_router.put("/users/me")
async def update_my_profile(
    data: SelfProfileUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Logged-in user updates their own profile (name, mobile, avatar)."""
    update_data: dict = {}
    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        if len(name) > 100:
            raise HTTPException(status_code=400, detail="Name too long (max 100 chars)")
        update_data["name"] = name
    if data.mobile is not None:
        mobile = data.mobile.strip()
        update_data["mobile"] = mobile or None
    if data.avatar_url is not None:
        update_data["avatar_url"] = data.avatar_url.strip() or None

    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    await db.users.update_one(
        {"_id": ObjectId(current_user["id"])},
        {"$set": update_data},
    )
    return {"message": "Profile updated", **update_data}


@api_router.post("/users")
async def create_user(data: UserCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["super_admin", "org_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized to create users")
    
    org_id = ObjectId(current_user["organization_id"])
    email = data.email.lower()
    
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    
    # Use provided password or generate temporary password
    if data.password:
        temp_password = data.password
    else:
        temp_password = secrets.token_urlsafe(8)
    hashed = hash_password(temp_password)
    
    user_doc = {
        "email": email,
        "password_hash": hashed,
        "name": data.name,
        "role": data.role,
        "mobile": data.mobile,
        "reports_to": ObjectId(data.reports_to) if data.reports_to else None,
        "organization_id": org_id,
        "active": True,
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = str(result.inserted_id)
    user_doc["organization_id"] = str(org_id)
    if user_doc.get("reports_to"):
        user_doc["reports_to"] = str(user_doc["reports_to"])
    user_doc.pop("password_hash", None)
    user_doc["temp_password"] = temp_password
    
    logger.info(f"User created: {email} with temporary password: {temp_password}")
    
    return user_doc

@api_router.get("/users")
async def get_users(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["super_admin", "org_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized to view users")
    
    org_id = ObjectId(current_user["organization_id"])
    users = await db.users.find({"organization_id": org_id}, {"password_hash": 0, "organization_id": 0}).to_list(100)
    
    for user in users:
        user["_id"] = str(user["_id"])
        if user.get("reports_to"):
            user["reports_to"] = str(user["reports_to"])
    
    return users

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, data: UserUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["super_admin", "org_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized to update users")
    
    org_id = ObjectId(current_user["organization_id"])
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    # Convert reports_to to ObjectId if provided as string
    if "reports_to" in update_data:
        if update_data["reports_to"] == "":
            update_data["reports_to"] = None
        elif isinstance(update_data["reports_to"], str):
            try:
                update_data["reports_to"] = ObjectId(update_data["reports_to"])
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid reports_to value")
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    result = await db.users.update_one(
        {"_id": ObjectId(user_id), "organization_id": org_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User updated successfully"}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["super_admin", "org_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete users")
    
    org_id = ObjectId(current_user["organization_id"])
    
    result = await db.users.delete_one({"_id": ObjectId(user_id), "organization_id": org_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User deleted successfully"}


# ==================== Password Management ====================
class ChangeOwnPasswordRequest(BaseModel):
    current_password: str
    new_password: str


@api_router.post("/auth/change-password")
async def change_own_password(data: ChangeOwnPasswordRequest, current_user: dict = Depends(get_current_user)):
    """Any logged-in user can change their own password by providing the current password."""
    user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
    if not user or not verify_password(data.current_password, user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")
    await db.users.update_one(
        {"_id": ObjectId(current_user["id"])},
        {"$set": {"password_hash": hash_password(data.new_password), "password_updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": "Password changed successfully"}


class AdminResetPasswordRequest(BaseModel):
    new_password: str


@api_router.post("/users/{user_id}/reset-password")
async def admin_reset_user_password(user_id: str, data: AdminResetPasswordRequest, current_user: dict = Depends(get_current_user)):
    """Admin / Org Admin / Super Admin can reset any team member's password without knowing the current one.
    Logs an audit entry. Sub-admins cannot reset other admins (lateral privilege escalation prevented)."""
    if current_user["role"] not in ("super_admin", "org_admin"):
        raise HTTPException(status_code=403, detail="Only admins can reset other users' passwords")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    org_id = ObjectId(current_user["organization_id"])
    uid = safe_object_id(user_id, "user_id")
    target = await db.users.find_one({"_id": uid, "organization_id": org_id}, {"role": 1, "email": 1, "name": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found in your organization")

    # Org Admin cannot reset another Org Admin or Super Admin
    if current_user["role"] == "org_admin" and target.get("role") in ("org_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="You cannot reset another admin's password")

    await db.users.update_one(
        {"_id": uid},
        {"$set": {"password_hash": hash_password(data.new_password), "password_updated_at": datetime.now(timezone.utc)}},
    )
    # Audit log
    await db.password_reset_audit.insert_one({
        "reset_by_id": ObjectId(current_user["id"]),
        "reset_by_email": current_user["email"],
        "target_user_id": uid,
        "target_email": target["email"],
        "target_role": target.get("role"),
        "organization_id": org_id,
        "reset_at": datetime.now(timezone.utc),
    })
    logger.warning(f"PASSWORD RESET: {current_user['email']} reset password for {target['email']} (role: {target.get('role')})")
    return {"message": f"Password reset for {target.get('name')}"}


# ==================== Organization Routes ====================
@api_router.get("/organization")
async def get_organization(current_user: dict = Depends(get_current_user)):
    org = await db.organizations.find_one({"_id": ObjectId(current_user["organization_id"])})
    
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    org["_id"] = str(org["_id"])
    return org

@api_router.put("/organization")
async def update_organization(data: OrganizationUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["super_admin", "org_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized to update organization")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    # Validate Indian GST format if present
    if "gst_number" in update_data and update_data["gst_number"]:
        gst = update_data["gst_number"].strip().upper()
        if not GST_REGEX.match(gst):
            raise HTTPException(
                status_code=400,
                detail="Invalid GST number. Must be 15 chars: 2 digit state code + 10 char PAN + 1 entity + 'Z' + 1 check digit (e.g. 27ABCDE1234F1Z5).",
            )
        update_data["gst_number"] = gst

    result = await db.organizations.update_one(
        {"_id": ObjectId(current_user["organization_id"])},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    return {"message": "Organization updated successfully"}


# ==================== Organization Logo Upload (Cloudinary) ====================
ALLOWED_LOGO_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"}
MAX_LOGO_SIZE = 500 * 1024  # 500 KB


@api_router.post("/uploads/org-logo")
async def upload_org_logo(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] not in ("super_admin", "org_admin"):
        raise HTTPException(status_code=403, detail="Only admins can upload org logo")
    if not os.environ.get("CLOUDINARY_CLOUD_NAME"):
        raise HTTPException(status_code=500, detail="Logo upload not configured")
    if file.content_type not in ALLOWED_LOGO_MIME:
        raise HTTPException(status_code=400, detail=f"File type {file.content_type} not allowed. Use JPG/PNG/WEBP/SVG.")
    content = await file.read()
    if len(content) > MAX_LOGO_SIZE:
        raise HTTPException(status_code=400, detail="Logo too large. Max 500 KB allowed.")
    folder = f"leadtrak/org-logo/{current_user['organization_id']}"
    try:
        result = cloudinary.uploader.upload(
            content,
            folder=folder,
            resource_type="image",
            overwrite=True,
            public_id="logo",
        )
    except Exception as e:
        logger.error(f"Cloudinary logo upload failed: {e}")
        raise HTTPException(status_code=500, detail="Logo upload failed")
    logo_url = result.get("secure_url")
    # Persist on org doc immediately
    await db.organizations.update_one(
        {"_id": ObjectId(current_user["organization_id"])},
        {"$set": {"logo_url": logo_url}},
    )
    return {"logo_url": logo_url, "public_id": result.get("public_id")}


# ==================== User Avatar Upload (Cloudinary) + Self Profile Update ====================
ALLOWED_AVATAR_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
MAX_AVATAR_SIZE = 800 * 1024  # 800 KB


@api_router.post("/uploads/avatar")
async def upload_user_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload the logged-in user's avatar/profile picture to Cloudinary.

    Stores `avatar_url` on the user document and returns the public URL.
    """
    if not os.environ.get("CLOUDINARY_CLOUD_NAME"):
        raise HTTPException(status_code=500, detail="Avatar upload not configured")
    if file.content_type not in ALLOWED_AVATAR_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"File type {file.content_type} not allowed. Use JPG/PNG/WEBP.",
        )
    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="Avatar too large. Max 800 KB allowed.")
    folder = f"leadtrak/user-avatar/{current_user['organization_id']}"
    try:
        result = cloudinary.uploader.upload(
            content,
            folder=folder,
            resource_type="image",
            overwrite=True,
            public_id=f"u_{current_user['id']}",
            transformation=[
                {"width": 400, "height": 400, "crop": "fill", "gravity": "face"},
                {"quality": "auto", "fetch_format": "auto"},
            ],
        )
    except Exception as e:
        logger.error(f"Cloudinary avatar upload failed: {e}")
        raise HTTPException(status_code=500, detail="Avatar upload failed")

    avatar_url = result.get("secure_url")
    await db.users.update_one(
        {"_id": ObjectId(current_user["id"])},
        {"$set": {"avatar_url": avatar_url}},
    )
    return {"avatar_url": avatar_url, "public_id": result.get("public_id")}


@api_router.delete("/uploads/avatar")
async def delete_user_avatar(current_user: dict = Depends(get_current_user)):
    """Remove the logged-in user's avatar."""
    await db.users.update_one(
        {"_id": ObjectId(current_user["id"])},
        {"$set": {"avatar_url": None}},
    )
    return {"message": "Avatar removed"}

# ==================== Subscription Routes ====================
@api_router.get("/subscription-plans")
async def get_subscription_plans():
    plans_cursor = db.subscription_plans.find({})
    plans = []
    async for p in plans_cursor:
        p["id"] = str(p["_id"])
        p.pop("_id", None)
        # GST breakdown (18%) — eta upgrade UI ar manual payment dialog use kore
        base_m = float(p.get("price_monthly", 0) or 0)
        base_a = float(p.get("price_annual", 0) or 0)
        p["gst_rate"] = GST_RATE
        p["gst_monthly"] = round(base_m * GST_RATE, 2)
        p["gst_annual"] = round(base_a * GST_RATE, 2)
        p["total_monthly"] = round(base_m + base_m * GST_RATE, 2)
        p["total_annual"] = round(base_a + base_a * GST_RATE, 2)
        plans.append(p)
    return plans

@api_router.post("/subscriptions/create-order")
async def create_subscription_order(data: SubscriptionCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["super_admin", "org_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    plan = await db.subscription_plans.find_one({"_id": ObjectId(data.plan_id)})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not _razorpay_configured():
        raise HTTPException(status_code=503, detail="Razorpay not configured. Contact the platform owner.")
    
    base_amount = plan[f"price_{data.billing_cycle}"]
    gst_breakdown = with_gst(base_amount)
    amount_paise = int(round(gst_breakdown["total_amount"] * 100))  # Total including GST
    
    try:
        order = razorpay_client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "payment_capture": 1
        })
        # Record the order as pending (used for Abandoned Cart Report)
        await db.subscription_orders.insert_one({
            "organization_id": ObjectId(current_user["organization_id"]),
            "plan_id": ObjectId(data.plan_id),
            "plan_name": plan.get("name"),
            "billing_cycle": data.billing_cycle,
            "amount": gst_breakdown["total_amount"],
            "base_amount": gst_breakdown["base_amount"],
            "gst_rate": GST_RATE,
            "gst_amount": gst_breakdown["gst_amount"],
            "currency": "INR",
            "status": "pending",
            "payment_method": "online_razorpay",
            "razorpay_order_id": order["id"],
            "razorpay_payment_id": None,
            "created_by": ObjectId(current_user["id"]),
            "created_by_name": current_user.get("name"),
            "created_at": datetime.now(timezone.utc),
            "paid_at": None,
            "notes": "",
        })
        
        return {
            "order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"],
            "base_amount": gst_breakdown["base_amount"],
            "gst_amount": gst_breakdown["gst_amount"],
            "total_amount": gst_breakdown["total_amount"],
        }
    except Exception as e:
        logger.error(f"Razorpay error: {str(e)}")
        raise HTTPException(status_code=500, detail="Payment order creation failed")

class VerifyPaymentRequest(BaseModel):
    payment_id: str
    order_id: str
    signature: str


@api_router.post("/subscriptions/verify")
async def verify_subscription(data: VerifyPaymentRequest, current_user: dict = Depends(get_current_user)):
    if not _razorpay_configured():
        raise HTTPException(status_code=503, detail="Razorpay not configured")
    try:
        razorpay_client.utility.verify_payment_signature({
            "razorpay_order_id": data.order_id,
            "razorpay_payment_id": data.payment_id,
            "razorpay_signature": data.signature
        })
    except Exception as e:
        logger.error(f"Payment signature verify failed: {e}")
        raise HTTPException(status_code=400, detail="Payment verification failed")

    order_doc = await db.subscription_orders.find_one({"razorpay_order_id": data.order_id})
    if not order_doc:
        raise HTTPException(status_code=404, detail="Order not found")

    # Safety: only the same tenant (or super admin) can verify their own order
    if (current_user.get("role") != "super_admin"
            and str(order_doc.get("organization_id")) != str(current_user.get("organization_id"))):
        raise HTTPException(status_code=403, detail="Not authorized")

    r = await _activate_subscription_from_paid_order(order_doc, data.payment_id)
    # Return the freshly-paid order id so the frontend can immediately fetch the invoice
    return {
        "message": "Payment verified successfully",
        "order_id": str(order_doc["_id"]),
        **r,
    }


def _serialize_invoice(order: dict, org: dict | None = None) -> dict:
    """Shape a subscription_orders document into an invoice JSON payload."""
    base_amount = float(order.get("base_amount", 0))
    gst_amount = float(order.get("gst_amount", 0))
    if not base_amount:
        # Backfill from total if base wasn't stored historically
        amount = float(order.get("amount", 0))
        base_amount = round(amount / (1 + GST_RATE), 2)
        gst_amount = round(amount - base_amount, 2)
    return {
        "id": str(order["_id"]),
        "receipt_no": order.get("receipt_no", ""),
        "plan_name": order.get("plan_name", ""),
        "billing_cycle": order.get("billing_cycle", ""),
        "base_amount": base_amount,
        "gst_rate": order.get("gst_rate", GST_RATE),
        "gst_amount": gst_amount,
        "amount": float(order.get("amount", 0)),
        "currency": order.get("currency", "INR"),
        "status": order.get("status", "pending"),
        "payment_method": order.get("payment_method", ""),
        "razorpay_order_id": order.get("razorpay_order_id"),
        "razorpay_payment_id": order.get("razorpay_payment_id"),
        "razorpay_short_url": order.get("razorpay_short_url"),
        "reference": order.get("reference", ""),
        "notes": order.get("notes", ""),
        "created_at": order["created_at"].isoformat() if isinstance(order.get("created_at"), datetime) else None,
        "paid_at": order["paid_at"].isoformat() if isinstance(order.get("paid_at"), datetime) else None,
        "subscription_end_date": (
            order["subscription_end_date"].isoformat()
            if isinstance(order.get("subscription_end_date"), datetime) else None
        ),
        "organization": {
            "id": str((org or {}).get("_id", "")),
            "name": (org or {}).get("name", ""),
            "industry": (org or {}).get("industry", ""),
            "email": (org or {}).get("email", ""),
            "phone": (org or {}).get("phone", ""),
            "address": (org or {}).get("address", ""),
            "gstin": (org or {}).get("gstin", ""),
        } if org else None,
    }


@api_router.get("/subscriptions/my-orders")
async def get_my_subscription_orders(current_user: dict = Depends(get_current_user)):
    """List all subscription orders for the current tenant (newest first)."""
    org_id = ObjectId(current_user["organization_id"])
    cursor = db.subscription_orders.find({"organization_id": org_id}).sort("created_at", -1).limit(50)
    org = await db.organizations.find_one({"_id": org_id})
    items = []
    async for o in cursor:
        items.append(_serialize_invoice(o, org))
    return items


@api_router.get("/subscriptions/orders/{order_id}")
async def get_subscription_order(order_id: str, current_user: dict = Depends(get_current_user)):
    """Fetch a single subscription order/invoice for the current user.

    Tenants can only see their own orders; super_admin can see any.
    """
    oid = safe_object_id(order_id, "order_id")
    order = await db.subscription_orders.find_one({"_id": oid})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if (current_user.get("role") != "super_admin"
            and str(order.get("organization_id")) != str(current_user.get("organization_id"))):
        raise HTTPException(status_code=403, detail="Not authorized")
    org = await db.organizations.find_one({"_id": order["organization_id"]})
    return _serialize_invoice(order, org)


# ==================== Tenant Subscription Status ====================
@api_router.get("/subscription/status")
async def subscription_status(current_user: dict = Depends(get_current_user)):
    """Return current tenant's subscription status with days remaining for the header badge."""
    org = await db.organizations.find_one(
        {"_id": ObjectId(current_user["organization_id"])},
        {"subscription_plan": 1, "subscription_status": 1, "trial_end_date": 1, "subscription_end_date": 1}
    )
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    now = datetime.now(timezone.utc)
    end_date = org.get("subscription_end_date") or org.get("trial_end_date")
    days_remaining = None
    if end_date:
        # Ensure tz-aware comparison
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        days_remaining = max(0, (end_date - now).days)
    status_val = org.get("subscription_status") or "trial"
    # Auto-flip to expired if past end
    if end_date and now > end_date and status_val in ("trial", "active"):
        status_val = "expired"
        await db.organizations.update_one(
            {"_id": org["_id"]},
            {"$set": {"subscription_status": "expired"}}
        )
    return {
        "plan": org.get("subscription_plan", "starter"),
        "status": status_val,
        "days_remaining": days_remaining,
        "end_date": end_date.isoformat() if end_date else None,
    }


# ==================== Super Admin: SaaS Billing ====================
class ManualPaymentRequest(BaseModel):
    organization_id: str
    plan_id: str
    billing_cycle: str  # monthly | annual
    amount: float
    payment_method: str  # cash | bank_transfer | cheque | upi | other
    reference: Optional[str] = None  # cheque no, txn id, etc.
    notes: Optional[str] = None


@api_router.get("/platform/trial-report")
async def platform_trial_report(current_user: dict = Depends(get_current_user)):
    """Super Admin: list of orgs currently in trial along with days remaining and expired trials."""
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    now = datetime.now(timezone.utc)
    orgs = await db.organizations.find(
        {"subscription_status": {"$in": ["trial", "expired"]}}
    ).sort("trial_end_date", 1).to_list(1000)
    rows = []
    for org in orgs:
        end_date = org.get("trial_end_date") or org.get("subscription_end_date")
        if end_date and end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        days_remaining = max(0, (end_date - now).days) if end_date else 0
        is_expired = end_date and end_date < now
        # Fetch admin user for contact
        admin = await db.users.find_one({"organization_id": org["_id"], "role": "org_admin"}, {"email": 1, "name": 1})
        rows.append({
            "id": str(org["_id"]),
            "name": org.get("name", ""),
            "industry": org.get("industry", ""),
            "subscription_plan": org.get("subscription_plan", "starter"),
            "trial_start_date": (org.get("trial_start_date") or "").isoformat() if isinstance(org.get("trial_start_date"), datetime) else "",
            "trial_end_date": end_date.isoformat() if end_date else "",
            "days_remaining": days_remaining,
            "status": "expired" if is_expired else "trial",
            "admin_name": (admin or {}).get("name", ""),
            "admin_email": (admin or {}).get("email", ""),
            "created_at": org["created_at"].isoformat() if isinstance(org.get("created_at"), datetime) else "",
        })
    return rows


@api_router.get("/platform/abandoned-carts")
async def platform_abandoned_carts(current_user: dict = Depends(get_current_user)):
    """Super Admin: list of subscription orders that were created but never paid (>1 hour stale)."""
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    now = datetime.now(timezone.utc)
    # Auto-mark pending orders >24h old as abandoned
    cutoff = now - timedelta(hours=24)
    await db.subscription_orders.update_many(
        {"status": "pending", "created_at": {"$lt": cutoff}},
        {"$set": {"status": "abandoned"}}
    )
    orders = await db.subscription_orders.find(
        {"status": {"$in": ["pending", "abandoned"]}}
    ).sort("created_at", -1).to_list(1000)
    rows = []
    for o in orders:
        org = await db.organizations.find_one({"_id": o["organization_id"]}, {"name": 1})
        admin = await db.users.find_one({"organization_id": o["organization_id"], "role": "org_admin"}, {"email": 1, "name": 1, "mobile": 1})
        created_at = o.get("created_at")
        age_hours = round((now - created_at).total_seconds() / 3600, 1) if created_at else None
        rows.append({
            "id": str(o["_id"]),
            "organization_id": str(o["organization_id"]),
            "organization_name": (org or {}).get("name", ""),
            "plan_name": o.get("plan_name", ""),
            "billing_cycle": o.get("billing_cycle", ""),
            "amount": o.get("amount", 0),
            "status": o.get("status"),
            "razorpay_order_id": o.get("razorpay_order_id", ""),
            "age_hours": age_hours,
            "admin_name": (admin or {}).get("name", ""),
            "admin_email": (admin or {}).get("email", ""),
            "admin_mobile": (admin or {}).get("mobile", ""),
            "created_at": created_at.isoformat() if isinstance(created_at, datetime) else "",
        })
    return rows


@api_router.get("/platform/subscription-orders")
async def platform_subscription_orders(current_user: dict = Depends(get_current_user)):
    """Super Admin: all subscription orders (paid + pending + abandoned)."""
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    orders = await db.subscription_orders.find({}).sort("created_at", -1).to_list(2000)
    rows = []
    for o in orders:
        org = await db.organizations.find_one({"_id": o["organization_id"]}, {"name": 1})
        rows.append({
            "id": str(o["_id"]),
            "organization_id": str(o["organization_id"]),
            "organization_name": (org or {}).get("name", ""),
            "plan_name": o.get("plan_name", ""),
            "billing_cycle": o.get("billing_cycle", ""),
            "amount": o.get("amount", 0),
            "base_amount": o.get("base_amount", round(float(o.get("amount", 0)) / (1 + GST_RATE), 2)),
            "gst_amount": o.get("gst_amount", round(float(o.get("amount", 0)) - float(o.get("amount", 0)) / (1 + GST_RATE), 2)),
            "gst_rate": o.get("gst_rate", GST_RATE),
            "receipt_no": o.get("receipt_no", ""),
            "status": o.get("status"),
            "payment_method": o.get("payment_method", ""),
            "reference": o.get("reference", ""),
            "notes": o.get("notes", ""),
            "created_at": o["created_at"].isoformat() if isinstance(o.get("created_at"), datetime) else "",
            "paid_at": o["paid_at"].isoformat() if isinstance(o.get("paid_at"), datetime) else None,
            "recorded_by": o.get("recorded_by_name", o.get("created_by_name", "")),
        })
    return rows


@api_router.post("/platform/manual-payment")
async def platform_manual_payment(data: ManualPaymentRequest, current_user: dict = Depends(get_current_user)):
    """Super Admin: manually mark an offline payment (Cash / Cheque / Bank Transfer)."""
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    org_oid = safe_object_id(data.organization_id, "organization_id")
    plan_oid = safe_object_id(data.plan_id, "plan_id")

    org = await db.organizations.find_one({"_id": org_oid})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    plan = await db.subscription_plans.find_one({"_id": plan_oid})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if data.billing_cycle not in ("monthly", "annual"):
        raise HTTPException(status_code=400, detail="billing_cycle must be 'monthly' or 'annual'")
    if data.payment_method not in ("cash", "bank_transfer", "cheque", "upi", "other"):
        raise HTTPException(status_code=400, detail="Invalid payment_method")

    now = datetime.now(timezone.utc)
    days = 365 if data.billing_cycle == "annual" else 30
    # If org already has an active subscription, extend from the current end_date; else from now.
    current_end = org.get("subscription_end_date")
    if current_end and current_end.tzinfo is None:
        current_end = current_end.replace(tzinfo=timezone.utc)
    base = current_end if (current_end and current_end > now and org.get("subscription_status") == "active") else now
    new_end = base + timedelta(days=days)

    # Generate receipt number
    receipt_no = f"RCP-{now.strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"

    # GST breakdown — Super Admin enters the AMOUNT RECEIVED (incl. GST). We back-out the base.
    total_received = float(data.amount or 0)
    base_amount = round(total_received / (1 + GST_RATE), 2)
    gst_amount = round(total_received - base_amount, 2)

    order_doc = {
        "organization_id": org_oid,
        "plan_id": plan_oid,
        "plan_name": plan.get("name"),
        "billing_cycle": data.billing_cycle,
        "amount": total_received,
        "base_amount": base_amount,
        "gst_rate": GST_RATE,
        "gst_amount": gst_amount,
        "currency": "INR",
        "status": "paid",
        "payment_method": data.payment_method,
        "reference": data.reference or "",
        "notes": data.notes or "",
        "receipt_no": receipt_no,
        "recorded_by": ObjectId(current_user["id"]),
        "recorded_by_name": current_user.get("name"),
        "created_at": now,
        "paid_at": now,
        "subscription_end_date": new_end,
    }
    result = await db.subscription_orders.insert_one(order_doc)

    # Update organization
    await db.organizations.update_one(
        {"_id": org_oid},
        {"$set": {
            "subscription_status": "active",
            "subscription_plan": plan.get("name", "").lower(),
            "subscription_end_date": new_end,
            "last_payment_date": now,
        }}
    )

    return {
        "id": str(result.inserted_id),
        "receipt_no": receipt_no,
        "subscription_end_date": new_end.isoformat(),
        "message": f"Payment recorded. Subscription extended to {new_end.strftime('%d %b %Y')}.",
    }


@api_router.post("/platform/organizations/{org_id}/extend-trial")
async def extend_trial(org_id: str, days: int = 7, current_user: dict = Depends(get_current_user)):
    """Super Admin: grant additional trial days."""
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    if days <= 0 or days > 365:
        raise HTTPException(status_code=400, detail="days must be 1-365")
    org_oid = safe_object_id(org_id, "org_id")
    org = await db.organizations.find_one({"_id": org_oid})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if org.get("subscription_status") == "active":
        raise HTTPException(status_code=400, detail="Org is on a paid subscription — record a payment instead of extending trial")
    now = datetime.now(timezone.utc)
    current_end = org.get("trial_end_date") or org.get("subscription_end_date") or now
    if current_end.tzinfo is None:
        current_end = current_end.replace(tzinfo=timezone.utc)
    base = current_end if current_end > now else now
    new_end = base + timedelta(days=days)
    await db.organizations.update_one(
        {"_id": org_oid},
        {"$set": {
            "trial_end_date": new_end,
            "subscription_end_date": new_end,
            "subscription_status": "trial",
        }}
    )
    return {"trial_end_date": new_end.isoformat(), "days_added": days}


# ==================== Super Admin: Impersonate Org Admin ====================
def create_impersonation_token(impersonator_id: str, target_user_id: str, target_email: str) -> str:
    """Short-lived access token (30 min) that lets a Super Admin act AS another user.
    The payload preserves both the real ID and the impersonator ID for audit logs."""
    payload = {
        "sub": target_user_id,
        "email": target_email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
        "type": "access",
        "impersonator_id": impersonator_id,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


@api_router.post("/platform/organizations/{org_id}/impersonate")
async def impersonate_org_admin(org_id: str, response: Response, current_user: dict = Depends(get_current_user)):
    """Super Admin impersonation: temporarily log in as the Org Admin of {org_id}.
    Use case: tenant support, debugging, validating onboarding.
    Security:
      • Only super_admin can call this
      • Token expiry is shorter (30 min) than a normal access token (15 min refresh dependency)
      • All actions performed while impersonating are recorded in `impersonation_audit_log`
      • Refresh token is NOT issued — when the impersonation token expires the session ends naturally
    """
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")

    org_oid = safe_object_id(org_id, "org_id")
    org = await db.organizations.find_one({"_id": org_oid}, {"name": 1, "industry": 1})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Pick the org admin — fallback to any active user in that org
    target = await db.users.find_one(
        {"organization_id": org_oid, "role": "org_admin", "active": {"$ne": False}},
        {"email": 1, "name": 1, "role": 1},
    )
    if not target:
        target = await db.users.find_one(
            {"organization_id": org_oid, "active": {"$ne": False}},
            {"email": 1, "name": 1, "role": 1},
        )
    if not target:
        raise HTTPException(status_code=404, detail="No active user found in this organization")

    token = create_impersonation_token(
        impersonator_id=current_user["id"],
        target_user_id=str(target["_id"]),
        target_email=target["email"],
    )

    # Audit log
    await db.impersonation_audit_log.insert_one({
        "impersonator_id": ObjectId(current_user["id"]),
        "impersonator_email": current_user["email"],
        "target_user_id": target["_id"],
        "target_email": target["email"],
        "target_org_id": org_oid,
        "target_org_name": org.get("name"),
        "started_at": datetime.now(timezone.utc),
    })
    logger.warning(
        f"IMPERSONATION: {current_user['email']} -> {target['email']} (org: {org.get('name')})"
    )

    # Issue the impersonation cookie — overrides the super admin's normal cookie
    response.set_cookie(
        key="access_token", value=token,
        httponly=True, secure=True, samesite="none", max_age=1800, path="/",
    )
    # Clear the refresh token so the session can't be silently extended
    response.delete_cookie("refresh_token", path="/")

    return {
        "message": "Impersonating",
        "target_user": {
            "id": str(target["_id"]),
            "email": target["email"],
            "name": target.get("name"),
            "role": target.get("role"),
        },
        "organization": {
            "id": str(org_oid),
            "name": org.get("name"),
        },
        "expires_in": 1800,
    }


# ==================== Colleges (Admission Consultancy Industry) ====================
class CollegeCreate(BaseModel):
    name: str
    city: Optional[str] = None
    state: Optional[str] = None
    type: Optional[str] = None  # e.g. "Government" / "Private" / "Deemed"
    courses_offered: Optional[List[str]] = None  # list of course names
    notes: Optional[str] = None


@api_router.get("/colleges")
async def list_colleges(current_user: dict = Depends(get_current_user)):
    """List all colleges saved by the current organization."""
    org_id = ObjectId(current_user["organization_id"])
    rows = await db.colleges.find({"organization_id": org_id, "active": {"$ne": False}}).sort("name", 1).to_list(500)
    for r in rows:
        r["_id"] = str(r["_id"])
        r["id"] = r["_id"]
        r.pop("organization_id", None)
    return rows


@api_router.post("/colleges")
async def create_college(data: CollegeCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("super_admin", "org_admin", "manager"):
        raise HTTPException(status_code=403, detail="Only managers and admins can add colleges")
    org_id = ObjectId(current_user["organization_id"])
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="College name is required")
    # Prevent duplicates within the same org (case-insensitive)
    existing = await db.colleges.find_one({"organization_id": org_id, "name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=409, detail=f"College '{name}' already exists")
    doc = {
        "name": name,
        "city": (data.city or "").strip() or None,
        "state": (data.state or "").strip() or None,
        "type": (data.type or "").strip() or None,
        "courses_offered": data.courses_offered or [],
        "notes": (data.notes or "").strip() or None,
        "active": True,
        "organization_id": org_id,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.colleges.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    doc["id"] = doc["_id"]
    doc.pop("organization_id", None)
    return doc


@api_router.put("/colleges/{college_id}")
async def update_college(college_id: str, data: CollegeCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("super_admin", "org_admin", "manager"):
        raise HTTPException(status_code=403, detail="Only managers and admins can edit colleges")
    org_id = ObjectId(current_user["organization_id"])
    cid = safe_object_id(college_id, "college_id")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    res = await db.colleges.update_one({"_id": cid, "organization_id": org_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="College not found")
    return {"message": "College updated"}


@api_router.delete("/colleges/{college_id}")
async def delete_college(college_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("super_admin", "org_admin"):
        raise HTTPException(status_code=403, detail="Only admins can delete colleges")
    org_id = ObjectId(current_user["organization_id"])
    cid = safe_object_id(college_id, "college_id")
    # Soft-delete (mark inactive)
    res = await db.colleges.update_one({"_id": cid, "organization_id": org_id}, {"$set": {"active": False}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="College not found")
    return {"message": "College deleted"}


# ==================== Razorpay: Public Config + Payment Links + Webhook ====================
@api_router.get("/razorpay/config")
async def razorpay_config(current_user: dict = Depends(get_current_user)):
    """Expose just the public Key ID to the frontend checkout. Secret is never sent."""
    return {
        "configured": _razorpay_configured(),
        "key_id": RAZORPAY_KEY_ID if _razorpay_configured() else "",
    }


@api_router.get("/razorpay/public-config")
async def razorpay_public_config():
    """Public (no-auth) version used by the Register page before login.
    Same response shape as /razorpay/config but accessible to anonymous visitors
    so the landing/register pages can pre-load the Razorpay key for one-click
    paid signup. The Key ID is a public identifier (safe to expose)."""
    return {
        "configured": _razorpay_configured(),
        "key_id": RAZORPAY_KEY_ID if _razorpay_configured() else "",
    }


class PaymentLinkRequest(BaseModel):
    plan_id: str
    billing_cycle: str  # "monthly" | "annual"
    notify_sms: bool = True
    notify_email: bool = True
    expire_in_days: Optional[int] = 7  # link auto-expires
    note: Optional[str] = None


@api_router.post("/platform/organizations/{org_id}/payment-link")
async def create_payment_link_for_org(
    org_id: str,
    data: PaymentLinkRequest,
    current_user: dict = Depends(get_current_user),
):
    """Super Admin: generate a Razorpay Payment Link for a tenant.
    Returns a short_url to share via WhatsApp/email. Payment success triggers
    the webhook which auto-activates the org's subscription.
    """
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    if not _razorpay_configured():
        raise HTTPException(status_code=503, detail="Razorpay not configured. Set RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET in backend .env")
    if data.billing_cycle not in ("monthly", "annual"):
        raise HTTPException(status_code=400, detail="billing_cycle must be 'monthly' or 'annual'")

    org_oid = safe_object_id(org_id, "org_id")
    plan_oid = safe_object_id(data.plan_id, "plan_id")

    org = await db.organizations.find_one({"_id": org_oid})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    plan = await db.subscription_plans.find_one({"_id": plan_oid})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # Find the org admin for prefill (name / email / mobile)
    admin = await db.users.find_one(
        {"organization_id": org_oid, "role": "org_admin"},
        {"name": 1, "email": 1, "mobile": 1},
    ) or {}

    base_amount = float(plan.get(f"price_{data.billing_cycle}", 0) or 0)
    gst = with_gst(base_amount)
    amount_paise = int(round(gst["total_amount"] * 100))

    now = datetime.now(timezone.utc)
    # Insert pending order first so we have an internal reference_id
    order_doc = {
        "organization_id": org_oid,
        "plan_id": plan_oid,
        "plan_name": plan.get("name"),
        "billing_cycle": data.billing_cycle,
        "amount": gst["total_amount"],
        "base_amount": gst["base_amount"],
        "gst_rate": GST_RATE,
        "gst_amount": gst["gst_amount"],
        "currency": "INR",
        "status": "pending",
        "payment_method": "razorpay_payment_link",
        "razorpay_payment_link_id": None,
        "razorpay_short_url": None,
        "razorpay_payment_id": None,
        "created_by": ObjectId(current_user["id"]),
        "created_by_name": current_user.get("name"),
        "created_at": now,
        "paid_at": None,
        "notes": data.note or f"Payment link for {plan.get('name')} ({data.billing_cycle})",
    }
    result = await db.subscription_orders.insert_one(order_doc)
    ref_id = str(result.inserted_id)

    # Build payment link payload. expire_by is a unix timestamp.
    expire_days = max(1, min(int(data.expire_in_days or 7), 30))
    expire_by = int((now + timedelta(days=expire_days)).timestamp())

    description = f"{plan.get('name')} ({data.billing_cycle}) — {org.get('name')} · Leadtrak CRM"
    # Razorpay requires customer.contact in E.164 (with country code). Best-effort normalize.
    contact = (admin.get("mobile") or org.get("phone") or "").strip()
    if contact and not contact.startswith("+"):
        # Assume India if 10 digits
        digits = "".join([c for c in contact if c.isdigit()])
        if len(digits) == 10:
            contact = f"+91{digits}"
        elif len(digits) == 12 and digits.startswith("91"):
            contact = f"+{digits}"
        else:
            contact = ""  # invalid — skip to avoid Razorpay error

    payload = {
        "amount": amount_paise,
        "currency": "INR",
        "accept_partial": False,
        "expire_by": expire_by,
        "reference_id": ref_id,
        "description": description[:2048],
        "customer": {
            "name": (admin.get("name") or org.get("name") or "Customer")[:200],
            "email": admin.get("email") or org.get("email") or "",
            "contact": contact,
        },
        "notify": {
            "sms": bool(data.notify_sms) and bool(contact),
            "email": bool(data.notify_email) and bool(admin.get("email") or org.get("email")),
        },
        "reminder_enable": True,
        "notes": {
            "organization_id": str(org_oid),
            "plan_id": str(plan_oid),
            "plan_name": plan.get("name", ""),
            "billing_cycle": data.billing_cycle,
            "internal_order_id": ref_id,
        },
    }
    # Drop empty contact / email to satisfy Razorpay validation
    if not payload["customer"]["contact"]:
        payload["customer"].pop("contact", None)
        payload["notify"]["sms"] = False
    if not payload["customer"]["email"]:
        payload["customer"].pop("email", None)
        payload["notify"]["email"] = False

    try:
        link = razorpay_client.payment_link.create(payload)
    except Exception as e:
        # Roll back the pending order so the dashboard isn't polluted
        await db.subscription_orders.delete_one({"_id": result.inserted_id})
        logger.error(f"Razorpay payment_link.create failed: {e}")
        raise HTTPException(status_code=502, detail=f"Razorpay error: {str(e)[:300]}")

    # Persist link id + short_url on the order
    await db.subscription_orders.update_one(
        {"_id": result.inserted_id},
        {"$set": {
            "razorpay_payment_link_id": link.get("id"),
            "razorpay_short_url": link.get("short_url"),
            "razorpay_payment_link_status": link.get("status"),
        }}
    )

    return {
        "order_id": ref_id,
        "payment_link_id": link.get("id"),
        "short_url": link.get("short_url"),
        "amount": gst["total_amount"],
        "base_amount": gst["base_amount"],
        "gst_amount": gst["gst_amount"],
        "currency": "INR",
        "expires_at": datetime.fromtimestamp(expire_by, tz=timezone.utc).isoformat(),
        "status": link.get("status"),
    }


@api_router.get("/platform/organizations/{org_id}/payment-links")
async def list_org_payment_links(org_id: str, current_user: dict = Depends(get_current_user)):
    """Super Admin: recent payment links sent to this org (paid + pending)."""
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    org_oid = safe_object_id(org_id, "org_id")
    rows = await db.subscription_orders.find(
        {"organization_id": org_oid, "payment_method": "razorpay_payment_link"}
    ).sort("created_at", -1).limit(20).to_list(20)
    out = []
    for r in rows:
        out.append({
            "id": str(r["_id"]),
            "plan_name": r.get("plan_name"),
            "billing_cycle": r.get("billing_cycle"),
            "amount": r.get("amount"),
            "status": r.get("status"),
            "short_url": r.get("razorpay_short_url"),
            "payment_link_id": r.get("razorpay_payment_link_id"),
            "created_at": (r.get("created_at").isoformat() if isinstance(r.get("created_at"), datetime) else ""),
            "paid_at": (r.get("paid_at").isoformat() if isinstance(r.get("paid_at"), datetime) else None),
        })
    return out


async def _activate_subscription_from_paid_order(order_doc: dict, razorpay_payment_id: Optional[str] = None) -> dict:
    """Shared helper: mark order paid, extend org subscription. Idempotent."""
    if not order_doc:
        return {"updated": False, "reason": "order not found"}
    if order_doc.get("status") == "paid":
        return {"updated": False, "reason": "already paid"}

    now = datetime.now(timezone.utc)
    billing_cycle = order_doc.get("billing_cycle", "monthly")
    days = 365 if billing_cycle == "annual" else 30

    org_oid = order_doc["organization_id"]
    org = await db.organizations.find_one({"_id": org_oid}, {"subscription_status": 1, "subscription_end_date": 1})
    current_end = (org or {}).get("subscription_end_date")
    if current_end and current_end.tzinfo is None:
        current_end = current_end.replace(tzinfo=timezone.utc)
    base = current_end if (current_end and current_end > now and (org or {}).get("subscription_status") == "active") else now
    new_end = base + timedelta(days=days)

    receipt_no = order_doc.get("receipt_no") or f"RCP-{now.strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"
    await db.subscription_orders.update_one(
        {"_id": order_doc["_id"]},
        {"$set": {
            "status": "paid",
            "razorpay_payment_id": razorpay_payment_id,
            "paid_at": now,
            "subscription_end_date": new_end,
            "receipt_no": receipt_no,
        }}
    )
    await db.organizations.update_one(
        {"_id": org_oid},
        {"$set": {
            "subscription_status": "active",
            "subscription_plan": (order_doc.get("plan_name") or "growth").lower(),
            "subscription_end_date": new_end,
            "last_payment_date": now,
        }}
    )
    return {"updated": True, "subscription_end_date": new_end.isoformat(), "receipt_no": receipt_no}


@api_router.post("/webhooks/razorpay")
@limiter.limit("120/minute")
async def razorpay_webhook(request: Request, response: Response):
    """Public Razorpay webhook receiver. Validates X-Razorpay-Signature (HMAC-SHA256)
    and activates subscriptions on `payment_link.paid` / `payment.captured`.
    Configure in Razorpay Dashboard → Webhooks with the same RAZORPAY_WEBHOOK_SECRET.
    """
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    if not RAZORPAY_WEBHOOK_SECRET:
        logger.error("Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=503, detail="Webhook not configured")

    # Manual HMAC verification (Razorpay sends raw body)
    expected_sig = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_sig, signature):
        logger.warning("Razorpay webhook signature mismatch")
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = json.loads(body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event", "")
    entity = (payload.get("payload") or {})

    # Log raw event for the webhook health dashboard
    try:
        await db.webhook_logs.insert_one({
            "source": "razorpay",
            "event": event,
            "status": "received",
            "payload": payload,
            "received_at": datetime.now(timezone.utc),
        })
    except Exception:
        pass

    result = {"event": event, "handled": False}

    if event == "payment_link.paid":
        link_entity = (entity.get("payment_link") or {}).get("entity") or {}
        link_id = link_entity.get("id")
        rzp_payment_id = ((entity.get("payment") or {}).get("entity") or {}).get("id")
        order_doc = await db.subscription_orders.find_one({"razorpay_payment_link_id": link_id})
        if not order_doc:
            ref_id = link_entity.get("reference_id")
            if ref_id:
                try:
                    order_doc = await db.subscription_orders.find_one({"_id": ObjectId(ref_id)})
                except Exception:
                    order_doc = None
        if order_doc:
            r = await _activate_subscription_from_paid_order(order_doc, rzp_payment_id)
            result.update({"handled": True, **r})

    elif event == "payment.captured":
        # Standard checkout flow — find the order by razorpay_order_id
        pay_entity = (entity.get("payment") or {}).get("entity") or {}
        rzp_order_id = pay_entity.get("order_id")
        rzp_payment_id = pay_entity.get("id")
        if rzp_order_id:
            order_doc = await db.subscription_orders.find_one({"razorpay_order_id": rzp_order_id})
            if order_doc:
                r = await _activate_subscription_from_paid_order(order_doc, rzp_payment_id)
                result.update({"handled": True, **r})

    return result
# ==================== End Razorpay ====================


# ==================== Locations (States & Cities) ====================
class CityCreate(BaseModel):
    state: str
    city: str


class CityUpdate(BaseModel):
    state: Optional[str] = None
    city: Optional[str] = None
    is_active: Optional[bool] = None


@api_router.get("/locations/states")
async def list_states(current_user: dict = Depends(get_current_user)):
    """Distinct list of states that have at least one active city."""
    states = await db.locations.distinct("state", {"is_active": True})
    return sorted(states)


@api_router.get("/locations/cities")
async def list_cities(state: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Cities of a given state (or all active cities if state omitted)."""
    query = {"is_active": True}
    if state:
        query["state"] = state
    cursor = db.locations.find(query, {"city": 1, "state": 1}).sort("city", 1)
    rows = []
    async for d in cursor:
        rows.append({"id": str(d["_id"]), "state": d["state"], "city": d["city"]})
    return rows


@api_router.get("/platform/locations")
async def platform_list_locations(current_user: dict = Depends(get_current_user)):
    """Super Admin: full list of all cities (active + inactive) for management UI."""
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    cursor = db.locations.find({}).sort([("state", 1), ("city", 1)])
    rows = []
    async for d in cursor:
        rows.append({
            "id": str(d["_id"]),
            "state": d.get("state", ""),
            "city": d.get("city", ""),
            "is_active": d.get("is_active", True),
            "is_default": d.get("is_default", False),
            "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else None,
        })
    return rows


@api_router.post("/platform/locations/cities")
async def platform_add_city(data: CityCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    state = (data.state or "").strip()
    city = (data.city or "").strip()
    if not state or not city:
        raise HTTPException(status_code=400, detail="state and city are required")
    # Case-insensitive dedupe
    existing = await db.locations.find_one({
        "state": {"$regex": f"^{state}$", "$options": "i"},
        "city": {"$regex": f"^{city}$", "$options": "i"},
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"{city}, {state} already exists")
    doc = {
        "state": state,
        "city": city,
        "is_active": True,
        "is_default": False,
        "created_at": datetime.now(timezone.utc),
        "created_by": ObjectId(current_user["id"]),
    }
    result = await db.locations.insert_one(doc)
    return {"id": str(result.inserted_id), "state": state, "city": city, "is_active": True}


@api_router.put("/platform/locations/cities/{city_id}")
async def platform_update_city(city_id: str, data: CityUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    oid = safe_object_id(city_id, "city_id")
    existing = await db.locations.find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="City not found")
    updates = {}
    if data.state is not None:
        updates["state"] = data.state.strip()
    if data.city is not None:
        updates["city"] = data.city.strip()
    if data.is_active is not None:
        updates["is_active"] = data.is_active
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    # Dedupe if name/state changed
    if "state" in updates or "city" in updates:
        new_state = updates.get("state", existing["state"])
        new_city = updates.get("city", existing["city"])
        dup = await db.locations.find_one({
            "_id": {"$ne": oid},
            "state": {"$regex": f"^{new_state}$", "$options": "i"},
            "city": {"$regex": f"^{new_city}$", "$options": "i"},
        })
        if dup:
            raise HTTPException(status_code=400, detail=f"{new_city}, {new_state} already exists")
    await db.locations.update_one({"_id": oid}, {"$set": updates})
    return {"id": city_id, **updates}


@api_router.delete("/platform/locations/cities/{city_id}")
async def platform_delete_city(city_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    oid = safe_object_id(city_id, "city_id")
    result = await db.locations.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="City not found")
    return {"deleted": True}



# ==================== PWA: Tenant-aware Manifest ====================
@api_router.get("/pwa/manifest")
async def pwa_manifest(current_user: dict = Depends(get_current_user)):
    """Per-tenant Web App Manifest — installs as the org's branded PWA."""
    org_id = ObjectId(current_user["organization_id"])
    org = await db.organizations.find_one({"_id": org_id}, {"name": 1, "branding": 1, "industry": 1})
    org_name = (org or {}).get("name", "Leadtrak")
    branding = (org or {}).get("branding") or {}
    primary_color = branding.get("primary_color") or "#7C3AED"
    logo_url = branding.get("logo_url") or ""
    short_name = org_name[:12] if len(org_name) > 12 else org_name
    return {
        "name": f"{org_name} CRM",
        "short_name": short_name,
        "description": f"{org_name} — powered by Leadtrak CRM",
        "start_url": "/dashboard",
        "scope": "/",
        "display": "standalone",
        "orientation": "portrait",
        "background_color": "#000000",
        "theme_color": primary_color,
        "icons": [
            {"src": logo_url or "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": logo_url or "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": logo_url or "/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable"},
            {"src": logo_url or "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
        "categories": ["business", "productivity"],
        "shortcuts": [
            {"name": "Add Lead", "url": "/leads"},
            {"name": "Dashboard", "url": "/dashboard"},
            {"name": "Reports", "url": "/reports"},
        ],
    }


# ==================== Onboarding Wizard ====================
ONBOARDING_STEPS = [
    "welcome",     # 0 — confirm industry / branding (auto-done on signup)
    "services",    # 1 — add at least one service
    "team",        # 2 — invite first team member (or skip)
    "lead_source", # 3 — review a lead source (Widget / FB / Google)
    "first_lead",  # 4 — add first lead (or skip)
]


class OnboardingAdvance(BaseModel):
    step: str  # name from ONBOARDING_STEPS
    data: Optional[dict] = None


@api_router.get("/onboarding/state")
async def onboarding_state(current_user: dict = Depends(get_current_user)):
    """Return current org's onboarding progress."""
    if current_user["role"] not in ("org_admin", "super_admin"):
        return {"completed": True, "step_index": len(ONBOARDING_STEPS), "completed_steps": ONBOARDING_STEPS}
    org_id = ObjectId(current_user["organization_id"])
    org = await db.organizations.find_one({"_id": org_id}, {"onboarding": 1, "name": 1, "created_at": 1, "industry": 1})
    onb = org.get("onboarding") or {}
    completed_steps = onb.get("completed_steps") or []
    skipped = onb.get("skipped", False)
    completed = bool(onb.get("completed_at")) or skipped
    # Auto-detect partial completion from existing data (for orgs created before onboarding existed)
    if not completed and "welcome" not in completed_steps and org.get("industry"):
        completed_steps.append("welcome")
    if not completed and "services" not in completed_steps:
        if await db.services.count_documents({"organization_id": org_id, "active": {"$ne": False}}) > 0:
            completed_steps.append("services")
    if not completed and "team" not in completed_steps:
        # Anyone besides the original admin
        if await db.users.count_documents({"organization_id": org_id}) > 1:
            completed_steps.append("team")
    if not completed and "first_lead" not in completed_steps:
        if await db.leads.count_documents({"organization_id": org_id}) > 0:
            completed_steps.append("first_lead")
    step_index = next((i for i, s in enumerate(ONBOARDING_STEPS) if s not in completed_steps), len(ONBOARDING_STEPS))
    return {
        "completed": step_index >= len(ONBOARDING_STEPS) or completed,
        "skipped": skipped,
        "step_index": step_index,
        "completed_steps": completed_steps,
        "all_steps": ONBOARDING_STEPS,
        "industry": org.get("industry"),
        "org_name": org.get("name"),
    }


@api_router.post("/onboarding/advance")
async def onboarding_advance(data: OnboardingAdvance, current_user: dict = Depends(get_current_user)):
    """Mark a step as completed."""
    if current_user["role"] not in ("org_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only Org Admin can advance onboarding")
    if data.step not in ONBOARDING_STEPS:
        raise HTTPException(status_code=400, detail="Invalid step")
    org_id = ObjectId(current_user["organization_id"])
    now = datetime.now(timezone.utc)
    await db.organizations.update_one(
        {"_id": org_id},
        {"$addToSet": {"onboarding.completed_steps": data.step},
         "$set": {"onboarding.last_advanced_at": now}}
    )
    # If all steps done, mark completed
    org = await db.organizations.find_one({"_id": org_id}, {"onboarding": 1})
    completed_steps = (org.get("onboarding") or {}).get("completed_steps", [])
    if all(s in completed_steps for s in ONBOARDING_STEPS):
        await db.organizations.update_one({"_id": org_id}, {"$set": {"onboarding.completed_at": now}})
    return {"status": "ok", "completed_steps": completed_steps}


@api_router.post("/onboarding/skip")
async def onboarding_skip(current_user: dict = Depends(get_current_user)):
    """Permanently dismiss the wizard."""
    if current_user["role"] not in ("org_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only Org Admin can skip onboarding")
    org_id = ObjectId(current_user["organization_id"])
    await db.organizations.update_one(
        {"_id": org_id},
        {"$set": {"onboarding.skipped": True, "onboarding.skipped_at": datetime.now(timezone.utc)}}
    )
    return {"status": "ok"}


@api_router.post("/onboarding/reset")
async def onboarding_reset(current_user: dict = Depends(get_current_user)):
    """Re-show the wizard (useful for re-onboarding)."""
    if current_user["role"] not in ("org_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only Org Admin can reset onboarding")
    org_id = ObjectId(current_user["organization_id"])
    await db.organizations.update_one({"_id": org_id}, {"$unset": {"onboarding": ""}})
    return {"status": "ok"}


# ==================== Reports Routes ====================
@api_router.get("/reports/lead-summary")
async def get_lead_summary_report(
    current_user: dict = Depends(get_current_user),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    org_id = ObjectId(current_user["organization_id"])
    query = {"organization_id": org_id}
    
    if start_date and end_date:
        query["created_at"] = {
            "$gte": datetime.fromisoformat(start_date),
            "$lte": datetime.fromisoformat(end_date)
        }
    
    total = await db.leads.count_documents(query)
    by_status = await db.leads.aggregate([
        {"$match": query},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]).to_list(100)
    
    by_source = await db.leads.aggregate([
        {"$match": query},
        {"$group": {"_id": "$lead_source", "count": {"$sum": 1}}}
    ]).to_list(100)
    
    return {
        "total": total,
        "by_status": [{"status": item["_id"], "count": item["count"]} for item in by_status],
        "by_source": [{"source": item["_id"], "count": item["count"]} for item in by_source]
    }

@api_router.get("/reports/revenue")
async def get_revenue_report(current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    
    pipeline = [
        {"$match": {"organization_id": org_id}},
        {"$group": {"_id": None, "total_revenue": {"$sum": "$fees"}}}
    ]
    
    result = await db.admissions.aggregate(pipeline).to_list(1)
    total_revenue = result[0]["total_revenue"] if result else 0
    
    return {"total_revenue": total_revenue}


@api_router.get("/reports/lead-temperature")
async def report_lead_temperature(current_user: dict = Depends(get_current_user)):
    """Counts of hot / warm / cold leads (active leads only — exclude Lost & Admission Done)."""
    org_id = ObjectId(current_user["organization_id"])
    match = {"organization_id": org_id, "status": {"$nin": ["Lost", "Admission Done"]}}
    if current_user["role"] in ("counselor", "telecaller"):
        match["assigned_to"] = current_user["id"]
    pipeline = [
        {"$match": match},
        {"$group": {"_id": {"$ifNull": ["$temperature", "warm"]}, "count": {"$sum": 1}}},
    ]
    results = await db.leads.aggregate(pipeline).to_list(10)
    counts = {"hot": 0, "warm": 0, "cold": 0}
    for r in results:
        key = (r["_id"] or "warm").lower()
        if key in counts:
            counts[key] = r["count"]
    counts["total"] = counts["hot"] + counts["warm"] + counts["cold"]
    return counts


@api_router.get("/reports/by-caller")
async def report_by_caller(current_user: dict = Depends(get_current_user)):
    """Per-caller performance: total leads, hot/warm/cold split, conversions, revenue."""
    if current_user["role"] not in ("super_admin", "org_admin", "manager"):
        raise HTTPException(status_code=403, detail="Only managers and admins can view team reports")
    org_id = ObjectId(current_user["organization_id"])
    users = await db.users.find(
        {"organization_id": org_id, "role": {"$in": ["counselor", "telecaller", "manager"]}}
    ).to_list(200)
    rows = []
    for u in users:
        uid = str(u["_id"])
        # Tenant + caller leads
        leads_match = {"organization_id": org_id, "assigned_to": uid}
        total_leads = await db.leads.count_documents(leads_match)
        hot = await db.leads.count_documents({**leads_match, "temperature": "hot"})
        warm = await db.leads.count_documents({**leads_match, "temperature": "warm"})
        cold = await db.leads.count_documents({**leads_match, "temperature": "cold"})
        lost = await db.leads.count_documents({**leads_match, "status": "Lost"})
        converted = await db.leads.count_documents({**leads_match, "status": "Admission Done"})
        revenue_pipe = [
            {"$match": {"organization_id": org_id, "created_by": uid}},
            {"$group": {"_id": None, "total": {"$sum": "$fees"}}},
        ]
        rev = await db.admissions.aggregate(revenue_pipe).to_list(1)
        revenue = rev[0]["total"] if rev else 0
        # Demos owned
        demos_total = await db.demos.count_documents({"organization_id": org_id, "demo_owner_id": uid})
        demos_done = await db.demos.count_documents({"organization_id": org_id, "demo_owner_id": uid, "status": "Completed"})
        rows.append({
            "user_id": uid,
            "name": u.get("name"),
            "role": u.get("role"),
            "total_leads": total_leads,
            "hot": hot, "warm": warm, "cold": cold,
            "converted": converted,
            "lost": lost,
            "revenue": revenue,
            "conversion_rate": round((converted / total_leads * 100) if total_leads else 0, 1),
            "demos_total": demos_total,
            "demos_done": demos_done,
        })
    rows.sort(key=lambda r: (-r["converted"], -r["revenue"], -r["total_leads"]))
    return rows


@api_router.get("/reports/by-manager")
async def report_by_manager(current_user: dict = Depends(get_current_user)):
    """Per-manager performance: their team's combined leads, conversions, revenue, team size."""
    if current_user["role"] not in ("super_admin", "org_admin", "manager"):
        raise HTTPException(status_code=403, detail="Only managers and admins can view team reports")
    org_id = ObjectId(current_user["organization_id"])

    # Find managers (role=manager OR role=org_admin)
    managers = await db.users.find(
        {"organization_id": org_id, "role": {"$in": ["manager", "org_admin"]}}
    ).to_list(100)

    rows = []
    # Track team members assigned to a manager
    all_team_assigned = set()
    for m in managers:
        mid = m["_id"]
        team_members = await db.users.find(
            {"organization_id": org_id, "reports_to": mid}
        ).to_list(200)
        team_ids = [str(t["_id"]) for t in team_members]
        all_team_assigned.update(team_ids)
        # Include manager's own leads too
        owner_ids = team_ids + [str(mid)]

        leads_match = {"organization_id": org_id, "assigned_to": {"$in": owner_ids}}
        total_leads = await db.leads.count_documents(leads_match)
        converted = await db.leads.count_documents({**leads_match, "status": {"$in": ["Admission Done", "Won", "Admitted", "Booked", "Confirmed", "Issued", "Member", "Renewed"]}})
        lost = await db.leads.count_documents({**leads_match, "status": {"$in": ["Lost", "Not Interested", "Dropped", "Cancelled", "Churned", "Rejected"]}})
        hot = await db.leads.count_documents({**leads_match, "temperature": "hot"})

        # Revenue from team's admissions
        revenue = 0
        if owner_ids:
            rev_pipe = [
                {"$match": {"organization_id": org_id, "created_by": {"$in": owner_ids}}},
                {"$group": {"_id": None, "total": {"$sum": "$fees"}}},
            ]
            rev = await db.admissions.aggregate(rev_pipe).to_list(1)
            revenue = rev[0]["total"] if rev else 0

        rows.append({
            "manager_id": str(mid),
            "manager_name": m.get("name"),
            "role": m.get("role"),
            "team_size": len(team_members),
            "team_members": [{"id": str(t["_id"]), "name": t.get("name"), "role": t.get("role")} for t in team_members],
            "total_leads": total_leads,
            "hot": hot,
            "converted": converted,
            "lost": lost,
            "revenue": revenue,
            "conversion_rate": round((converted / total_leads * 100) if total_leads else 0, 1),
        })

    # Add an "Unassigned" bucket for users not reporting to any manager
    unassigned = await db.users.find({
        "organization_id": org_id,
        "role": {"$in": ["counselor", "telecaller", "manager"]},
        "$or": [{"reports_to": {"$exists": False}}, {"reports_to": None}],
    }).to_list(200)
    # Filter out the managers themselves (they're shown as their own row)
    manager_ids_set = {m["_id"] for m in managers}
    unassigned = [u for u in unassigned if u["_id"] not in manager_ids_set]
    if unassigned:
        unassigned_ids = [str(u["_id"]) for u in unassigned]
        ua_match = {"organization_id": org_id, "assigned_to": {"$in": unassigned_ids}}
        rows.append({
            "manager_id": None,
            "manager_name": "Unassigned",
            "role": "—",
            "team_size": len(unassigned),
            "team_members": [{"id": str(u["_id"]), "name": u.get("name"), "role": u.get("role")} for u in unassigned],
            "total_leads": await db.leads.count_documents(ua_match),
            "hot": await db.leads.count_documents({**ua_match, "temperature": "hot"}),
            "converted": await db.leads.count_documents({**ua_match, "status": {"$in": ["Admission Done", "Won", "Admitted", "Booked", "Confirmed", "Issued", "Member", "Renewed"]}}),
            "lost": await db.leads.count_documents({**ua_match, "status": {"$in": ["Lost", "Not Interested", "Dropped", "Cancelled", "Churned", "Rejected"]}}),
            "revenue": 0,
            "conversion_rate": 0,
        })

    rows.sort(key=lambda r: (-r["converted"], -r["revenue"], -r["total_leads"]))
    return rows


@api_router.get("/reports/total-summary")
async def report_total_summary(current_user: dict = Depends(get_current_user)):
    """Org-wide totals + per-source + per-status breakdown for the Overview tab."""
    if current_user["role"] not in ("super_admin", "org_admin", "manager"):
        raise HTTPException(status_code=403, detail="Only managers and admins can view team reports")
    org_id = ObjectId(current_user["organization_id"])
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    last_7d = now - timedelta(days=7)
    last_30d = now - timedelta(days=30)

    base = {"organization_id": org_id}
    total_leads = await db.leads.count_documents(base)
    today_leads = await db.leads.count_documents({**base, "created_at": {"$gte": today_start}})
    week_leads = await db.leads.count_documents({**base, "created_at": {"$gte": last_7d}})
    month_leads = await db.leads.count_documents({**base, "created_at": {"$gte": last_30d}})
    converted = await db.leads.count_documents({**base, "status": {"$in": ["Admission Done", "Won", "Admitted", "Booked", "Confirmed", "Issued", "Member", "Renewed"]}})
    lost = await db.leads.count_documents({**base, "status": {"$in": ["Lost", "Not Interested", "Dropped", "Cancelled", "Churned", "Rejected"]}})
    active = total_leads - converted - lost

    # Revenue
    rev_pipe = [
        {"$match": base},
        {"$group": {"_id": None, "total": {"$sum": "$fees"}, "count": {"$sum": 1}}},
    ]
    rev = await db.admissions.aggregate(rev_pipe).to_list(1)
    revenue = rev[0]["total"] if rev else 0
    admissions_count = rev[0]["count"] if rev else 0

    # By source
    source_pipe = [
        {"$match": base},
        {"$group": {"_id": "$lead_source", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    by_source = [{"source": r["_id"] or "Unknown", "count": r["count"]} async for r in db.leads.aggregate(source_pipe)]

    # By status
    status_pipe = [
        {"$match": base},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    by_status = [{"status": r["_id"] or "Unknown", "count": r["count"]} async for r in db.leads.aggregate(status_pipe)]

    # Active team count
    team_count = await db.users.count_documents({"organization_id": org_id, "role": {"$in": ["counselor", "telecaller", "manager"]}})
    manager_count = await db.users.count_documents({"organization_id": org_id, "role": {"$in": ["manager", "org_admin"]}})

    return {
        "total_leads": total_leads,
        "today_leads": today_leads,
        "week_leads": week_leads,
        "month_leads": month_leads,
        "converted": converted,
        "lost": lost,
        "active": active,
        "conversion_rate": round((converted / total_leads * 100) if total_leads else 0, 1),
        "revenue": revenue,
        "admissions_count": admissions_count,
        "avg_ticket_size": round(revenue / admissions_count, 2) if admissions_count else 0,
        "team_count": team_count,
        "manager_count": manager_count,
        "by_source": by_source,
        "by_status": by_status,
    }


@api_router.get("/reports/by-demo-owner")
async def report_by_demo_owner(current_user: dict = Depends(get_current_user)):
    """Per-demo-owner stats: total scheduled, completed, outcomes split."""
    if current_user["role"] not in ("super_admin", "org_admin", "manager"):
        raise HTTPException(status_code=403, detail="Only managers and admins can view demo reports")
    org_id = ObjectId(current_user["organization_id"])
    pipeline = [
        {"$match": {"organization_id": org_id}},
        {"$group": {
            "_id": {"id": "$demo_owner_id", "name": "$demo_owner_name"},
            "total": {"$sum": 1},
            "completed": {"$sum": {"$cond": [{"$eq": ["$status", "Completed"]}, 1, 0]}},
            "interested": {"$sum": {"$cond": [{"$eq": ["$outcome", "interested"]}, 1, 0]}},
            "not_interested": {"$sum": {"$cond": [{"$eq": ["$outcome", "not_interested"]}, 1, 0]}},
            "reschedule": {"$sum": {"$cond": [{"$eq": ["$outcome", "reschedule"]}, 1, 0]}},
            "no_show": {"$sum": {"$cond": [{"$eq": ["$outcome", "no_show"]}, 1, 0]}},
        }},
    ]
    results = await db.demos.aggregate(pipeline).to_list(200)
    rows = []
    for r in results:
        total = r["total"]
        completed = r["completed"]
        rows.append({
            "demo_owner_id": r["_id"].get("id"),
            "demo_owner_name": r["_id"].get("name"),
            "total": total,
            "completed": completed,
            "interested": r["interested"],
            "not_interested": r["not_interested"],
            "reschedule": r["reschedule"],
            "no_show": r["no_show"],
            "completion_rate": round((completed / total * 100) if total else 0, 1),
        })
    rows.sort(key=lambda r: -r["completed"])
    return rows

# ==================== Integration Routes ====================
async def _log_webhook(
    org_id: Optional[ObjectId],
    *,
    source: str,
    event: str,
    status: str,  # "success" | "failed" | "duplicate" | "ignored"
    leads_imported: int = 0,
    duplicates: int = 0,
    error: Optional[str] = None,
    payload: Optional[dict] = None,
    response: Optional[dict] = None,
    ip: Optional[str] = None,
    page_id: Optional[str] = None,
):
    """Persist an inbound webhook event for the per-tenant Webhook Health Dashboard."""
    if not org_id:
        # Webhook arrived without resolvable tenant — log under a sentinel for super-admin debugging
        return
    try:
        doc = {
            "organization_id": org_id,
            "source": source,
            "event": event,
            "status": status,
            "leads_imported": leads_imported,
            "duplicates": duplicates,
            "error": error,
            "payload": payload,
            "response": response,
            "ip": ip,
            "page_id": page_id,
            "created_at": datetime.now(timezone.utc),
        }
        await db.webhook_logs.insert_one(doc)
    except Exception as e:
        logger.warning(f"_log_webhook failed: {e}")


async def _ingest_external_lead(
    org: dict,
    *,
    source: str,
    external_id: str,
    name: str,
    mobile: str,
    email: Optional[str] = None,
    course_interested: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    extras: Optional[dict] = None,
    raw: Optional[dict] = None,
) -> Optional[str]:
    """Idempotently insert a lead coming from an external channel (FB Lead Ads / Google Ads).

    Uses (organization_id, source_external_id) as the dedupe key.
    Returns the new lead_id, or None when a duplicate was skipped.
    """
    org_id = org["_id"]
    if not name or not mobile:
        return None
    # Idempotency: skip if same external_id already imported
    existing = await db.leads.find_one(
        {"organization_id": org_id, "source_external_id": external_id},
        {"_id": 1},
    )
    if existing:
        return None
    # Also skip if mobile/email already exists (cross-channel duplicates)
    or_clauses = [{"mobile": mobile}]
    if email:
        or_clauses.append({"email": email})
    if await db.leads.find_one({"organization_id": org_id, "$or": or_clauses}, {"_id": 1}):
        return None

    lead_count = await db.leads.count_documents({"organization_id": org_id})
    lead_id_str = f"LEAD{lead_count + 1:05d}"
    assignee = await pick_round_robin_assignee(org_id)
    extras = extras or {}
    doc = {
        "lead_id": lead_id_str,
        "name": name,
        "mobile": mobile,
        "email": email,
        "course_interested": course_interested or "Inquiry",
        "state": state or "",
        "city": city or "",
        "lead_source": source,
        "source_external_id": external_id,
        "company_name": extras.get("company_name"),
        "budget_range": extras.get("budget_range"),
        "preferred_date": extras.get("preferred_date"),
        "travellers": extras.get("travellers"),
        "assigned_to": assignee,
        "status": "New",
        "organization_id": org_id,
        "created_by": None,
        "raw_payload": raw,
        "created_at": datetime.now(timezone.utc),
    }
    try:
        result = await db.leads.insert_one(doc)
    except Exception as e:
        logger.warning(f"_ingest_external_lead duplicate-key for {source}/{external_id}: {e}")
        return None
    # Timeline
    await db.lead_timeline.insert_one({
        "lead_id": result.inserted_id,
        "organization_id": org_id,
        "event_type": "lead_created",
        "payload": {"name": name, "source": source, "status": "New", "assigned_to": assignee},
        "actor_id": None,
        "actor_name": source,
        "actor_role": "system",
        "created_at": datetime.now(timezone.utc),
    })
    if assignee:
        await db.notifications.insert_one({
            "user_id": assignee,
            "message": f"New lead '{name}' from {source} assigned to you",
            "type": "lead_assigned",
            "lead_id": lead_id_str,
            "read": False,
            "organization_id": org_id,
            "created_at": datetime.now(timezone.utc),
        })
    return lead_id_str


def _verify_fb_signature(app_secret: str, raw_body: bytes, header_sig: str) -> bool:
    """Verify Meta's X-Hub-Signature-256 header using HMAC-SHA256 (constant-time compare)."""
    if not header_sig or not app_secret:
        return False
    try:
        scheme, received = header_sig.split("=", 1)
    except ValueError:
        return False
    if scheme.lower() != "sha256":
        return False
    expected = hmac.new(app_secret.encode("utf-8"), msg=raw_body, digestmod=hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received)


def _fb_fields_to_dict(field_data: list) -> dict:
    """Convert FB lead 'field_data': [{'name':'full_name','values':['Jane']}, …] → flat dict."""
    out = {}
    for item in field_data or []:
        n = item.get("name")
        v = item.get("values") or []
        if n and v:
            out[n] = v[0]
    return out


def _map_fb_lead(fb_fields: dict, field_mapping: Optional[dict] = None) -> dict:
    """Apply per-tenant field mapping + sensible defaults for canonical CRM fields."""
    field_mapping = field_mapping or {}
    # Defaults — FB form's most common field names
    defaults = {
        "full_name": "name",
        "name": "name",
        "first_name": "name",
        "phone_number": "mobile",
        "phone": "mobile",
        "mobile_number": "mobile",
        "email": "email",
        "email_address": "email",
        "city": "city",
        "state": "state",
        "course_interested": "course_interested",
        "service_required": "course_interested",
        "property_type": "course_interested",
        "company_name": "company_name",
        "budget": "budget_range",
        "budget_range": "budget_range",
        "preferred_date": "preferred_date",
        "travel_date": "preferred_date",
        "number_of_travellers": "travellers",
    }
    merged = {**defaults, **field_mapping}
    crm = {}
    for fb_name, value in fb_fields.items():
        canonical = merged.get(fb_name, fb_name)
        if canonical not in crm or not crm[canonical]:
            crm[canonical] = value
    return crm


@api_router.get("/integrations/facebook-leads")
async def facebook_lead_verify(request: Request):
    """Meta GET verification: returns hub.challenge if hub.verify_token matches any tenant's token."""
    qp = request.query_params
    client_ip = request.client.host if request.client else None
    if qp.get("hub.mode") != "subscribe":
        raise HTTPException(status_code=400, detail="Invalid hub.mode")
    token = qp.get("hub.verify_token") or ""
    challenge = qp.get("hub.challenge") or ""
    # Match against any organization's facebook_lead_ads.verify_token
    match = await db.organizations.find_one(
        {"integrations.facebook_lead_ads.verify_token": token},
        {"_id": 1},
    )
    if not match:
        # Fallback to a global env var if user prefers a single shared token
        global_token = os.environ.get("FB_WEBHOOK_VERIFY_TOKEN")
        if not global_token or token != global_token:
            raise HTTPException(status_code=403, detail="Invalid verify token")
    if match:
        await _log_webhook(
            match["_id"], source="facebook", event="subscribe_verify",
            status="success", payload={"mode": "subscribe"}, ip=client_ip,
        )
    return Response(content=challenge, media_type="text/plain")


@api_router.post("/integrations/facebook-leads")
async def facebook_lead_webhook(request: Request):
    """Meta POST: verifies signature → resolves tenant by page_id → fetches lead → creates lead."""
    raw_body = await request.body()
    header_sig = request.headers.get("X-Hub-Signature-256", "")
    client_ip = request.client.host if request.client else None
    try:
        payload = json.loads(raw_body.decode("utf-8") or "{}")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    entries = payload.get("entry") or []
    if not entries:
        return {"status": "ignored", "reason": "no entries"}

    imported_ids = []
    duplicates_count = 0
    for entry in entries:
        page_id = str(entry.get("id") or "")
        if not page_id:
            continue
        org = await db.organizations.find_one(
            {"integrations.facebook_lead_ads.page_id": page_id}
        )
        if not org:
            logger.warning(f"FB webhook: unknown page_id={page_id}")
            continue
        fb_cfg = (org.get("integrations") or {}).get("facebook_lead_ads") or {}
        app_secret = fb_cfg.get("app_secret") or ""
        page_access_token = fb_cfg.get("page_access_token") or ""
        if not _verify_fb_signature(app_secret, raw_body, header_sig):
            await _log_webhook(
                org["_id"], source="facebook", event="leadgen",
                status="failed", error="Invalid HMAC signature",
                payload={"page_id": page_id}, ip=client_ip, page_id=page_id,
            )
            logger.warning(f"FB webhook: signature verification failed for page_id={page_id}")
            raise HTTPException(status_code=401, detail="Invalid signature")
        for change in entry.get("changes") or []:
            if change.get("field") != "leadgen":
                continue
            value = change.get("value") or {}
            leadgen_id = str(value.get("leadgen_id") or "")
            if not leadgen_id:
                continue
            # Fetch full lead from Graph API
            lead_data = {"field_data": []}
            graph_error = None
            if page_access_token:
                try:
                    api_ver = fb_cfg.get("graph_api_version") or "v19.0"
                    r = requests.get(
                        f"https://graph.facebook.com/{api_ver}/{leadgen_id}",
                        params={"access_token": page_access_token, "fields": "field_data,created_time,form_id,ad_id"},
                        timeout=10,
                    )
                    if r.status_code == 200:
                        lead_data = r.json()
                    else:
                        graph_error = f"Graph API {r.status_code}: {r.text[:200]}"
                        logger.warning(graph_error)
                except Exception as e:
                    graph_error = f"Graph API request error: {e}"
                    logger.error(graph_error)
            fb_fields = _fb_fields_to_dict(lead_data.get("field_data") or [])
            crm = _map_fb_lead(fb_fields, fb_cfg.get("field_mapping") or {})
            new_id = await _ingest_external_lead(
                org,
                source="Facebook Lead Ads",
                external_id=leadgen_id,
                name=crm.get("name") or "Unknown",
                mobile=str(crm.get("mobile") or "").strip(),
                email=crm.get("email"),
                course_interested=crm.get("course_interested"),
                state=crm.get("state"),
                city=crm.get("city"),
                extras={
                    "company_name": crm.get("company_name"),
                    "budget_range": crm.get("budget_range"),
                    "preferred_date": crm.get("preferred_date"),
                    "travellers": crm.get("travellers"),
                },
                raw={"webhook_value": value, "graph_api_lead": lead_data},
            )
            if new_id:
                imported_ids.append(new_id)
                await _log_webhook(
                    org["_id"], source="facebook", event="leadgen",
                    status="success", leads_imported=1,
                    payload={"page_id": page_id, "leadgen_id": leadgen_id, "fb_fields": fb_fields},
                    response={"lead_id": new_id}, ip=client_ip, page_id=page_id,
                )
            else:
                duplicates_count += 1
                await _log_webhook(
                    org["_id"], source="facebook", event="leadgen",
                    status="duplicate" if not graph_error else "failed",
                    duplicates=1 if not graph_error else 0,
                    error=graph_error,
                    payload={"page_id": page_id, "leadgen_id": leadgen_id, "fb_fields": fb_fields},
                    ip=client_ip, page_id=page_id,
                )
    return {"status": "ok", "imported": len(imported_ids), "lead_ids": imported_ids, "duplicates": duplicates_count}


class GoogleAdsLeadIn(BaseModel):
    """Body of a Google Ads Lead Form (Webhook integration) POST."""
    lead_id: Optional[str] = None
    google_key: str  # the Webhook Key (shared secret) configured in Google Ads
    user_column_data: Optional[list] = None  # Google's native format
    # OR flat fields for simple posting from Zapier / custom integrations
    name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    course_interested: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    campaign_id: Optional[str] = None
    form_id: Optional[str] = None


@api_router.post("/integrations/google-ads/{tenant_id}")
async def google_ads_lead_webhook(tenant_id: str, data: GoogleAdsLeadIn, request: Request):
    """Google Ads Lead Form webhook receiver.
    URL pattern: /api/integrations/google-ads/{tenant_id}
    Auth: caller must include `google_key` matching the tenant's stored webhook key.
    Supports both native Google `user_column_data` array and flat JSON for Zapier-style posts.
    """
    client_ip = request.client.host if request.client else None
    try:
        org_oid = ObjectId(tenant_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tenant_id")
    org = await db.organizations.find_one({"_id": org_oid})
    if not org:
        raise HTTPException(status_code=404, detail="Tenant not found")
    g_cfg = (org.get("integrations") or {}).get("google_ads") or {}
    stored_key = g_cfg.get("webhook_secret") or g_cfg.get("webhook_key") or ""
    if not stored_key or not hmac.compare_digest(stored_key, data.google_key or ""):
        await _log_webhook(
            org_oid, source="google_ads", event="lead_form",
            status="failed", error="Invalid webhook key",
            payload={"campaign_id": data.campaign_id, "form_id": data.form_id}, ip=client_ip,
        )
        raise HTTPException(status_code=401, detail="Invalid webhook key")

    # Normalize fields — Google sends `user_column_data: [{column_id, column_name, string_value}, …]`
    name = (data.name or "").strip()
    mobile = (data.mobile or "").strip()
    email = data.email
    course = data.course_interested
    state = data.state
    city = data.city
    if data.user_column_data:
        for item in data.user_column_data:
            col = (item.get("column_id") or item.get("column_name") or "").upper()
            val = item.get("string_value") or ""
            if not val:
                continue
            if col in ("FULL_NAME", "NAME", "FIRST_NAME"):
                name = name or val
            elif col in ("PHONE_NUMBER", "PHONE", "MOBILE"):
                mobile = mobile or val
            elif col in ("EMAIL", "EMAIL_ADDRESS"):
                email = email or val
            elif col in ("CITY",):
                city = city or val
            elif col in ("STATE",):
                state = state or val
            elif col in ("COURSE", "SERVICE", "PRODUCT", "INTEREST"):
                course = course or val

    if not name or not mobile:
        await _log_webhook(
            org_oid, source="google_ads", event="lead_form",
            status="failed", error="name and mobile are required",
            payload=data.model_dump(), ip=client_ip,
        )
        raise HTTPException(status_code=400, detail="name and mobile are required")
    ext_id = data.lead_id or f"google-{datetime.now(timezone.utc).timestamp():.0f}-{mobile}"
    new_lead = await _ingest_external_lead(
        org,
        source="Google Ads",
        external_id=ext_id,
        name=name,
        mobile=mobile,
        email=email,
        course_interested=course,
        state=state,
        city=city,
        raw=data.model_dump(),
    )
    if new_lead:
        await _log_webhook(
            org_oid, source="google_ads", event="lead_form",
            status="success", leads_imported=1,
            payload=data.model_dump(), response={"lead_id": new_lead}, ip=client_ip,
        )
    else:
        await _log_webhook(
            org_oid, source="google_ads", event="lead_form",
            status="duplicate", duplicates=1,
            payload=data.model_dump(), ip=client_ip,
        )
    return {"status": "ok", "lead_id": new_lead, "duplicate": new_lead is None}


# ==================== Webhook Health (Org Admin) ====================
@api_router.get("/webhook-logs/stats")
async def webhook_logs_stats(current_user: dict = Depends(get_current_user)):
    """Per-tenant webhook stats for the health dashboard. Org Admin only."""
    if current_user["role"] not in ("org_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only Org Admins can view webhook health")
    org_id = ObjectId(current_user["organization_id"])
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    last_24h = now - timedelta(hours=24)
    last_7d = now - timedelta(days=7)

    base = {"organization_id": org_id}
    total = await db.webhook_logs.count_documents(base)
    success = await db.webhook_logs.count_documents({**base, "status": "success"})
    failed = await db.webhook_logs.count_documents({**base, "status": "failed"})
    duplicates = await db.webhook_logs.count_documents({**base, "status": "duplicate"})
    today = await db.webhook_logs.count_documents({**base, "created_at": {"$gte": today_start}})
    last24 = await db.webhook_logs.count_documents({**base, "created_at": {"$gte": last_24h}})
    last7 = await db.webhook_logs.count_documents({**base, "created_at": {"$gte": last_7d}})

    # Per-source breakdown
    pipeline = [
        {"$match": base},
        {"$group": {
            "_id": "$source",
            "total": {"$sum": 1},
            "success": {"$sum": {"$cond": [{"$eq": ["$status", "success"]}, 1, 0]}},
            "failed": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}},
            "duplicates": {"$sum": {"$cond": [{"$eq": ["$status", "duplicate"]}, 1, 0]}},
            "leads_imported": {"$sum": "$leads_imported"},
            "last_event_at": {"$max": "$created_at"},
        }},
    ]
    by_source = []
    async for r in db.webhook_logs.aggregate(pipeline):
        by_source.append({
            "source": r["_id"],
            "total": r["total"],
            "success": r["success"],
            "failed": r["failed"],
            "duplicates": r["duplicates"],
            "leads_imported": r.get("leads_imported", 0),
            "last_event_at": r["last_event_at"].isoformat() if r.get("last_event_at") else None,
        })

    success_rate = round((success / total * 100) if total else 0, 1)
    return {
        "total": total,
        "success": success,
        "failed": failed,
        "duplicates": duplicates,
        "success_rate": success_rate,
        "today": today,
        "last_24h": last24,
        "last_7d": last7,
        "by_source": by_source,
    }


@api_router.get("/webhook-logs")
async def list_webhook_logs(
    source: Optional[str] = None,
    status: Optional[str] = None,
    since: Optional[str] = None,  # ISO date
    limit: int = 100,
    current_user: dict = Depends(get_current_user),
):
    """List webhook events for the current tenant (Org Admin only). Most recent first."""
    if current_user["role"] not in ("org_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only Org Admins can view webhook health")
    org_id = ObjectId(current_user["organization_id"])
    q = {"organization_id": org_id}
    if source:
        q["source"] = source
    if status:
        q["status"] = status
    if since:
        try:
            q["created_at"] = {"$gte": datetime.fromisoformat(since.replace("Z", "+00:00"))}
        except Exception:
            pass
    limit = max(1, min(limit, 500))
    cursor = db.webhook_logs.find(q).sort("created_at", -1).limit(limit)
    rows = []
    async for d in cursor:
        rows.append({
            "id": str(d["_id"]),
            "source": d.get("source"),
            "event": d.get("event"),
            "status": d.get("status"),
            "leads_imported": d.get("leads_imported", 0),
            "duplicates": d.get("duplicates", 0),
            "error": d.get("error"),
            "page_id": d.get("page_id"),
            "ip": d.get("ip"),
            "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else None,
        })
    return rows


@api_router.get("/webhook-logs/{log_id}")
async def get_webhook_log(log_id: str, current_user: dict = Depends(get_current_user)):
    """Full payload + response for a single webhook event. Org Admin only, tenant-scoped."""
    if current_user["role"] not in ("org_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only Org Admins can view webhook health")
    org_id = ObjectId(current_user["organization_id"])
    oid = safe_object_id(log_id, "log_id")
    d = await db.webhook_logs.find_one({"_id": oid, "organization_id": org_id})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return {
        "id": str(d["_id"]),
        "source": d.get("source"),
        "event": d.get("event"),
        "status": d.get("status"),
        "leads_imported": d.get("leads_imported", 0),
        "duplicates": d.get("duplicates", 0),
        "error": d.get("error"),
        "payload": d.get("payload"),
        "response": d.get("response"),
        "page_id": d.get("page_id"),
        "ip": d.get("ip"),
        "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else None,
    }


@api_router.post("/webhook-logs/{log_id}/retry")
async def retry_webhook_log(log_id: str, current_user: dict = Depends(get_current_user)):
    """Re-ingest a failed webhook payload using the stored data. Org Admin only."""
    if current_user["role"] not in ("org_admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only Org Admins can retry webhooks")
    org_id = ObjectId(current_user["organization_id"])
    oid = safe_object_id(log_id, "log_id")
    log = await db.webhook_logs.find_one({"_id": oid, "organization_id": org_id})
    if not log:
        raise HTTPException(status_code=404, detail="Not found")
    if log.get("status") == "success":
        return {"status": "noop", "reason": "Already successful"}
    org = await db.organizations.find_one({"_id": org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    source = log.get("source")
    payload = log.get("payload") or {}
    new_lead_id = None
    if source == "google_ads":
        name = (payload.get("name") or "").strip()
        mobile = (payload.get("mobile") or "").strip()
        if not name or not mobile:
            await _log_webhook(org_id, source="google_ads", event="retry", status="failed", error="name and mobile required for retry", payload=payload)
            raise HTTPException(status_code=400, detail="Original payload missing name/mobile")
        ext_id = payload.get("lead_id") or f"retry-{oid}"
        new_lead_id = await _ingest_external_lead(
            org, source="Google Ads", external_id=ext_id,
            name=name, mobile=mobile, email=payload.get("email"),
            course_interested=payload.get("course_interested"),
            state=payload.get("state"), city=payload.get("city"),
            raw=payload,
        )
    elif source == "facebook":
        fb_fields = payload.get("fb_fields") or {}
        if not fb_fields:
            raise HTTPException(status_code=400, detail="Original webhook had no FB field data to retry")
        crm = _map_fb_lead(fb_fields, ((org.get("integrations") or {}).get("facebook_lead_ads") or {}).get("field_mapping") or {})
        leadgen_id = payload.get("leadgen_id") or f"retry-{oid}"
        new_lead_id = await _ingest_external_lead(
            org, source="Facebook Lead Ads", external_id=leadgen_id,
            name=crm.get("name") or "Unknown",
            mobile=str(crm.get("mobile") or "").strip(),
            email=crm.get("email"),
            course_interested=crm.get("course_interested"),
            state=crm.get("state"), city=crm.get("city"),
            extras={"company_name": crm.get("company_name"), "budget_range": crm.get("budget_range"), "preferred_date": crm.get("preferred_date"), "travellers": crm.get("travellers")},
            raw=payload,
        )
    else:
        raise HTTPException(status_code=400, detail=f"Retry not supported for source '{source}'")

    status_val = "success" if new_lead_id else "duplicate"
    await _log_webhook(
        org_id, source=source or "unknown", event="retry",
        status=status_val,
        leads_imported=1 if new_lead_id else 0,
        duplicates=0 if new_lead_id else 1,
        payload=payload, response={"lead_id": new_lead_id},
    )
    return {"status": status_val, "lead_id": new_lead_id}

@api_router.post("/integrations/whatsapp/send")
async def send_whatsapp_message(data: WhatsAppMessage, current_user: dict = Depends(get_current_user)):
    twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    twilio_token = os.environ.get("TWILIO_AUTH_TOKEN")
    twilio_phone = os.environ.get("TWILIO_PHONE_NUMBER")
    
    if not all([twilio_sid, twilio_token, twilio_phone]):
        raise HTTPException(status_code=500, detail="WhatsApp integration not configured")
    
    try:
        from twilio.rest import Client
        twilio_client = Client(twilio_sid, twilio_token)
        
        message = twilio_client.messages.create(
            body=data.message,
            from_=f"whatsapp:{twilio_phone}",
            to=f"whatsapp:{data.to}"
        )
        
        return {"message_sid": message.sid, "status": "sent"}
    except Exception as e:
        logger.error(f"WhatsApp send error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send WhatsApp message")

# ==================== Dashboard Widgets (Enhanced) ====================
@api_router.get("/dashboard/funnel")
async def get_lead_funnel(current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    org = await db.organizations.find_one({"_id": org_id}, {"industry": 1})
    industry = (org or {}).get("industry") or "education"
    terms = get_terms(industry)
    stages = ["New", "Contacted", "Interested", "Admission Done"]
    # Display labels — last stage adapts to industry
    display_labels = {
        "Admission Done": terms.get("conversion_verb", "Converted"),
    }
    counts = {}
    for stage in stages:
        counts[stage] = await db.leads.count_documents({"organization_id": org_id, "status": stage})
    total = sum(counts.values()) or 1
    return [
        {
            "stage": display_labels.get(stage, stage),
            "raw_stage": stage,
            "count": counts[stage],
            "percentage": round(counts[stage] / total * 100, 1),
        }
        for stage in stages
    ]

@api_router.get("/dashboard/leaderboard")
async def get_counselor_leaderboard(current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    users_cursor = db.users.find({"organization_id": org_id})
    leaderboard = []
    async for user in users_cursor:
        user_id = str(user["_id"])
        leads_assigned = await db.leads.count_documents({"organization_id": org_id, "assigned_to": user_id})
        admissions_done = await db.leads.count_documents({"organization_id": org_id, "assigned_to": user_id, "status": "Admission Done"})
        if leads_assigned > 0:
            conversion = round(admissions_done / leads_assigned * 100, 1)
        else:
            conversion = 0
        leaderboard.append({
            "user_id": user_id,
            "name": user["name"],
            "role": user["role"],
            "leads_assigned": leads_assigned,
            "admissions": admissions_done,
            "conversion_rate": conversion,
        })
    leaderboard.sort(key=lambda x: x["admissions"], reverse=True)
    return leaderboard[:5]

@api_router.get("/dashboard/activity-feed")
async def get_activity_feed(current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    activities = []
    # Recent leads
    leads = await db.leads.find({"organization_id": org_id}).sort("created_at", -1).limit(8).to_list(8)
    for lead in leads:
        creator = await db.users.find_one({"_id": ObjectId(lead.get("created_by"))}) if lead.get("created_by") else None
        activities.append({
            "type": "lead_created",
            "actor": creator["name"] if creator else "System",
            "text": f"created lead {lead['name']}",
            "timestamp": lead["created_at"].isoformat() if isinstance(lead["created_at"], datetime) else lead["created_at"],
            "color": "violet",
        })
    # Recent admissions
    admissions = await db.admissions.find({"organization_id": org_id}).sort("created_at", -1).limit(5).to_list(5)
    for adm in admissions:
        activities.append({
            "type": "admission",
            "actor": adm.get("counselor_name", "System"),
            "text": f"recorded admission for {adm['student_name']}",
            "timestamp": adm["created_at"].isoformat() if isinstance(adm["created_at"], datetime) else adm["created_at"],
            "color": "emerald",
        })
    activities.sort(key=lambda x: x["timestamp"], reverse=True)
    return activities[:10]

@api_router.get("/dashboard/today-followups")
async def get_today_followups(current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    query = {"organization_id": org_id, "followup_date": today}
    # Strict caller visibility: counselor/telecaller see only their own followups
    if current_user["role"] in ("counselor", "telecaller"):
        query["created_by"] = current_user["id"]
    followups = await db.followups.find(query).limit(20).to_list(20)
    for fu in followups:
        fu["_id"] = str(fu["_id"])
        fu.pop("organization_id", None)
        try:
            lead = await db.leads.find_one({"_id": ObjectId(fu["lead_id"])}, {"name": 1, "mobile": 1})
            if lead:
                fu["lead_name"] = lead["name"]
                fu["lead_mobile"] = lead["mobile"]
        except Exception:
            pass
    return followups

# ==================== Activity Logs ====================
@api_router.get("/activity-logs")
async def get_activity_logs(current_user: dict = Depends(get_current_user), limit: int = 50):
    org_id = ObjectId(current_user["organization_id"])
    if current_user["role"] not in ["super_admin", "org_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    logs = await db.activity_logs.find({"organization_id": org_id}, {"organization_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    for log in logs:
        log["_id"] = str(log["_id"])
    return logs

async def log_activity(org_id, user_id, user_name, action, target_type, target_id, details=""):
    await db.activity_logs.insert_one({
        "organization_id": org_id,
        "user_id": user_id,
        "user_name": user_name,
        "action": action,
        "target_type": target_type,
        "target_id": str(target_id) if target_id else None,
        "details": details,
        "timestamp": datetime.now(timezone.utc),
    })

# ==================== CSV Lead Import ====================
@api_router.post("/leads/import-csv")
async def import_leads_csv(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["super_admin", "org_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    org_id = ObjectId(current_user["organization_id"])
    contents = await file.read()
    
    try:
        text = contents.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid CSV file: {str(e)}")

    imported = 0
    skipped_duplicates = 0
    errors = []
    distribution = {}  # caller_id -> count
    for idx, row in enumerate(rows, start=2):
        try:
            name = (row.get("name") or row.get("Name") or "").strip()
            mobile = (row.get("mobile") or row.get("Mobile") or "").strip()
            email = (row.get("email") or row.get("Email") or "").strip()
            if not name or not mobile:
                errors.append(f"Row {idx}: missing name or mobile")
                continue
            # Skip duplicates by mobile OR email
            or_clauses = [{"mobile": mobile}]
            if email:
                or_clauses.append({"email": email})
            if await db.leads.find_one({"organization_id": org_id, "$or": or_clauses}, {"_id": 1}):
                skipped_duplicates += 1
                continue
            lead_count = await db.leads.count_documents({"organization_id": org_id})
            lead_id = f"LEAD{lead_count + 1:05d}"
            # Round-robin distribute among counselor/telecaller
            assignee = await pick_round_robin_assignee(org_id)
            def _col(*keys):
                for k in keys:
                    v = row.get(k)
                    if v not in (None, ""):
                        return v.strip() if isinstance(v, str) else v
                return None
            inserted = await db.leads.insert_one({
                "lead_id": lead_id,
                "name": name,
                "mobile": mobile,
                "email": email,
                "course_interested": _col("course", "Course", "course_interested", "service", "product", "package") or "General",
                "state": _col("state", "State") or "",
                "city": _col("city", "City") or "",
                "lead_source": _col("source", "Source", "lead_source") or "CSV Import",
                "company_name": _col("company_name", "Company Name", "company"),
                "budget_range": _col("budget_range", "Budget", "budget"),
                "preferred_date": _col("preferred_date", "Preferred Date", "date"),
                "travellers": _col("travellers", "Travellers"),
                "temperature": (_col("temperature", "Temperature") or "warm").lower(),
                "assigned_to": assignee,
                "status": "New",
                "organization_id": org_id,
                "created_by": current_user["id"],
                "created_at": datetime.now(timezone.utc),
            })
            await log_lead_event(
                inserted.inserted_id,
                "lead_created",
                {"name": name, "source": row.get("source") or "CSV Import", "status": "New", "assigned_to": assignee},
                current_user,
                org_id,
            )
            if assignee:
                distribution[assignee] = distribution.get(assignee, 0) + 1
                await db.notifications.insert_one({
                    "user_id": assignee,
                    "message": f"New lead '{name}' has been assigned to you (CSV import)",
                    "type": "lead_assigned",
                    "lead_id": str(inserted.inserted_id),
                    "read": False,
                    "organization_id": org_id,
                    "created_at": datetime.now(timezone.utc),
                })
            imported += 1
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
    
    await log_activity(org_id, current_user["id"], current_user["name"], "imported_csv", "leads", None, f"{imported} leads imported, {skipped_duplicates} duplicates skipped")
    return {"imported": imported, "skipped_duplicates": skipped_duplicates, "errors": errors[:10], "total_errors": len(errors), "distribution": distribution}

# ==================== Excel Export ====================
@api_router.get("/reports/export-leads-excel")
async def export_leads_excel(current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    leads = await db.leads.find({"organization_id": org_id}).sort("created_at", -1).to_list(10000)
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Leads"
    headers = ["Lead ID", "Name", "Mobile", "Email", "Course", "Source", "Status", "State", "City", "Created"]
    ws.append(headers)
    for lead in leads:
        ws.append([
            lead.get("lead_id", ""),
            lead.get("name", ""),
            lead.get("mobile", ""),
            lead.get("email", ""),
            lead.get("course_interested", ""),
            lead.get("lead_source", ""),
            lead.get("status", ""),
            lead.get("state", ""),
            lead.get("city", ""),
            lead.get("created_at").strftime("%Y-%m-%d %H:%M") if isinstance(lead.get("created_at"), datetime) else str(lead.get("created_at", "")),
        ])
    
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=leads_{datetime.now().strftime('%Y%m%d')}.xlsx"},
    )

# ==================== WhatsApp Templates ====================
class WhatsAppTemplateCreate(BaseModel):
    name: str
    body: str
    category: Optional[str] = "general"

@api_router.post("/whatsapp-templates")
async def create_template(data: WhatsAppTemplateCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["super_admin", "org_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    org_id = ObjectId(current_user["organization_id"])
    doc = {
        "name": data.name,
        "body": data.body,
        "category": data.category,
        "organization_id": org_id,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.whatsapp_templates.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    doc["organization_id"] = str(org_id)
    return doc

@api_router.get("/whatsapp-templates")
async def list_templates(current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    templates = await db.whatsapp_templates.find({"organization_id": org_id}, {"organization_id": 0}).sort("created_at", -1).to_list(100)
    for t in templates:
        t["_id"] = str(t["_id"])
    return templates

@api_router.delete("/whatsapp-templates/{tpl_id}")
async def delete_template(tpl_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["super_admin", "org_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    org_id = ObjectId(current_user["organization_id"])
    result = await db.whatsapp_templates.delete_one({"_id": ObjectId(tpl_id), "organization_id": org_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Deleted"}

# ==================== Public Lead Capture Widget ====================
class PublicLeadCreate(BaseModel):
    name: str
    mobile: str
    email: Optional[str] = None
    course_interested: Optional[str] = "Inquiry"
    state: Optional[str] = ""
    city: Optional[str] = ""
    company_name: Optional[str] = None
    budget_range: Optional[str] = None
    preferred_date: Optional[str] = None
    travellers: Optional[str] = None
    message: Optional[str] = ""

@api_router.get("/widget/token")
async def get_widget_token(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["super_admin", "org_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    org_id = ObjectId(current_user["organization_id"])
    org = await db.organizations.find_one({"_id": org_id})
    if not org.get("widget_token"):
        token = secrets.token_urlsafe(16)
        await db.organizations.update_one({"_id": org_id}, {"$set": {"widget_token": token}})
        return {"widget_token": token}
    return {"widget_token": org["widget_token"]}

@api_router.get("/widget/config/{widget_token}")
async def public_widget_config(widget_token: str):
    """Public (no-auth) endpoint that returns the org's industry-specific widget configuration.
    The embeddable JS calls this on load to render the right fields, branding & state list."""
    org = await db.organizations.find_one({"widget_token": widget_token})
    if not org:
        raise HTTPException(status_code=404, detail="Invalid widget token")
    industry = org.get("industry") or "generic"
    terms = get_terms(industry)
    industry_fields = get_widget_fields(industry)
    # Fetch active states once for the cascading state dropdown
    states = await db.locations.distinct("state", {"is_active": True})
    # Fetch active services for service-select fields
    services_cursor = db.services.find(
        {"organization_id": org["_id"], "active": {"$ne": False}},
        {"name": 1, "category": 1, "base_price": 1}
    ).sort("name", 1)
    services = []
    async for s in services_cursor:
        services.append({
            "name": s.get("name", ""),
            "category": s.get("category", ""),
            "base_price": s.get("base_price", 0),
        })
    branding = org.get("branding", {}) or {}
    logo_url = branding.get("logo_url") or org.get("logo_url") or ""
    return {
        "org_name": org.get("name", ""),
        "logo_url": logo_url,
        "industry": industry,
        "terms": terms,
        "primary_color": branding.get("primary_color") or "#7C3AED",
        "fields": industry_fields,
        "states": sorted(states),
        "services": services,
    }


@api_router.get("/widget/cities/{widget_token}")
async def public_widget_cities(widget_token: str, state: str):
    """Public endpoint to fetch cities for a state (used by widget's cascading dropdown)."""
    org = await db.organizations.find_one({"widget_token": widget_token}, {"_id": 1})
    if not org:
        raise HTTPException(status_code=404, detail="Invalid widget token")
    cursor = db.locations.find({"is_active": True, "state": state}, {"city": 1}).sort("city", 1)
    cities = [d["city"] async for d in cursor]
    return {"cities": cities}


@api_router.post("/widget/lead/{widget_token}")
@limiter.limit("30/minute")
async def public_widget_lead(widget_token: str, data: PublicLeadCreate, request: Request, response: Response):
    org = await db.organizations.find_one({"widget_token": widget_token})
    if not org:
        raise HTTPException(status_code=404, detail="Invalid widget token")
    org_id = org["_id"]
    # Skip duplicate (mobile or email)
    or_clauses = [{"mobile": data.mobile}]
    if data.email:
        or_clauses.append({"email": data.email})
    if await db.leads.find_one({"organization_id": org_id, "$or": or_clauses}, {"_id": 1}):
        return {"status": "success", "message": "Thanks! We'll be in touch shortly."}
    lead_count = await db.leads.count_documents({"organization_id": org_id})
    lead_id = f"LEAD{lead_count + 1:05d}"
    # Round-robin auto-assign to active counselor/telecaller
    assignee = await pick_round_robin_assignee(org_id)
    inserted = await db.leads.insert_one({
        "lead_id": lead_id,
        "name": data.name,
        "mobile": data.mobile,
        "email": data.email,
        "course_interested": data.course_interested or "Inquiry",
        "state": data.state or "",
        "city": data.city or "",
        "company_name": data.company_name,
        "budget_range": data.budget_range,
        "preferred_date": data.preferred_date,
        "travellers": data.travellers,
        "lead_source": "Website Widget",
        "assigned_to": assignee,
        "status": "New",
        "remarks": data.message or "",
        "organization_id": org_id,
        "created_by": None,
        "created_at": datetime.now(timezone.utc),
    })
    # Synthetic actor for timeline (no current_user in public endpoint)
    await db.lead_timeline.insert_one({
        "lead_id": inserted.inserted_id,
        "organization_id": org_id,
        "event_type": "lead_created",
        "payload": {"name": data.name, "source": "Website Widget", "status": "New", "assigned_to": assignee},
        "actor_id": None,
        "actor_name": "Website Widget",
        "actor_role": "system",
        "created_at": datetime.now(timezone.utc),
    })
    if assignee:
        await db.notifications.insert_one({
            "user_id": assignee,
            "message": f"New web lead '{data.name}' has been assigned to you",
            "type": "lead_assigned",
            "read": False,
            "organization_id": org_id,
            "created_at": datetime.now(timezone.utc),
        })
    return {"status": "success", "message": "Thanks! We'll be in touch shortly."}

# ==================== Integrations (Tenant-level keys) ====================
class IntegrationsUpdate(BaseModel):
    razorpay: Optional[Dict[str, Any]] = None
    twilio_whatsapp: Optional[Dict[str, Any]] = None
    facebook_lead_ads: Optional[Dict[str, Any]] = None
    google_ads: Optional[Dict[str, Any]] = None
    auto_assign_enabled: Optional[bool] = None


def _mask_secret(val):
    if not val or not isinstance(val, str):
        return ""
    if len(val) <= 6:
        return "•" * len(val)
    return val[:4] + "•" * (len(val) - 8) + val[-4:]


def _redact_integrations(integrations: dict) -> dict:
    """Return integrations with sensitive secrets masked for safe GET responses."""
    SECRET_KEYS = {"key_secret", "auth_token", "page_access_token", "webhook_secret"}
    redacted = {}
    for provider, cfg in (integrations or {}).items():
        if not isinstance(cfg, dict):
            redacted[provider] = cfg
            continue
        out = {}
        for k, v in cfg.items():
            if k in SECRET_KEYS and v:
                out[k] = _mask_secret(v)
                out[f"{k}_set"] = True
            else:
                out[k] = v
        redacted[provider] = out
    return redacted


@api_router.get("/organization/integrations")
async def get_integrations(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("super_admin", "org_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    org = await db.organizations.find_one(
        {"_id": ObjectId(current_user["organization_id"])},
        {"integrations": 1, "auto_assign_enabled": 1},
    )
    integrations = (org or {}).get("integrations") or {}
    return {
        "integrations": _redact_integrations(integrations),
        "auto_assign_enabled": (org or {}).get("auto_assign_enabled", True),
    }


@api_router.put("/organization/integrations")
async def update_integrations(data: IntegrationsUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("super_admin", "org_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    org_id = ObjectId(current_user["organization_id"])
    payload = data.model_dump(exclude_none=True)
    update_set = {}
    if "auto_assign_enabled" in payload:
        update_set["auto_assign_enabled"] = payload.pop("auto_assign_enabled")
    # Merge each provider into the existing dict (partial update)
    if payload:
        org = await db.organizations.find_one({"_id": org_id}, {"integrations": 1})
        existing = (org or {}).get("integrations") or {}
        for provider, cfg in payload.items():
            if cfg is None:
                continue
            # Don't overwrite a saved secret with a masked echo from the client
            current = existing.get(provider) or {}
            merged = {**current}
            for k, v in (cfg or {}).items():
                if v is None:
                    continue
                # If client sends a masked value (•••), keep the existing
                if isinstance(v, str) and "•" in v:
                    continue
                merged[k] = v
            existing[provider] = merged
        update_set["integrations"] = existing
    if update_set:
        await db.organizations.update_one({"_id": org_id}, {"$set": update_set})
    # Return redacted view
    org = await db.organizations.find_one({"_id": org_id}, {"integrations": 1, "auto_assign_enabled": 1})
    return {
        "integrations": _redact_integrations((org or {}).get("integrations") or {}),
        "auto_assign_enabled": (org or {}).get("auto_assign_enabled", True),
    }


# ==================== Drip Campaigns (P2) ====================
class CampaignCreate(BaseModel):
    name: str
    trigger: str
    steps: List[Dict[str, Any]]

@api_router.post("/campaigns")
async def create_campaign(data: CampaignCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["super_admin", "org_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    org_id = ObjectId(current_user["organization_id"])
    doc = {
        "name": data.name,
        "trigger": data.trigger,
        "steps": data.steps,
        "active": True,
        "organization_id": org_id,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.campaigns.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    doc["organization_id"] = str(org_id)
    return doc

@api_router.get("/campaigns")
async def list_campaigns(current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    items = await db.campaigns.find({"organization_id": org_id}, {"organization_id": 0}).to_list(100)
    for c in items:
        c["_id"] = str(c["_id"])
    return items

# ==================== Advanced Analytics (P2) ====================
@api_router.get("/analytics/cohort")
async def get_cohort_analysis(current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    # Cohort by source: leads vs admissions
    pipeline = [
        {"$match": {"organization_id": org_id}},
        {"$group": {
            "_id": "$lead_source",
            "leads": {"$sum": 1},
            "admissions": {"$sum": {"$cond": [{"$eq": ["$status", "Admission Done"]}, 1, 0]}},
        }},
    ]
    rows = await db.leads.aggregate(pipeline).to_list(50)
    return [
        {
            "source": r["_id"],
            "leads": r["leads"],
            "admissions": r["admissions"],
            "conversion_rate": round(r["admissions"] / r["leads"] * 100, 1) if r["leads"] else 0,
        }
        for r in rows
    ]

# ==================== Super Admin: Platform / Tenant Management ====================
class PlatformOrgCreate(BaseModel):
    organization_name: str
    industry: Optional[str] = "education"
    admin_name: str
    admin_email: EmailStr
    admin_mobile: Optional[str] = None
    admin_password: str
    subscription_plan: Optional[str] = "starter"

@api_router.get("/platform/stats")
async def platform_stats(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    total_orgs = await db.organizations.count_documents({})
    active_orgs = await db.organizations.count_documents({"status": {"$ne": "suspended"}})
    total_users = await db.users.count_documents({})
    total_leads = await db.leads.count_documents({})
    total_admissions = await db.admissions.count_documents({})
    revenue_pipeline = await db.admissions.aggregate([{"$group": {"_id": None, "total": {"$sum": "$fees"}}}]).to_list(1)
    revenue = revenue_pipeline[0]["total"] if revenue_pipeline else 0
    plan_dist = await db.organizations.aggregate([{"$group": {"_id": "$subscription_plan", "count": {"$sum": 1}}}]).to_list(10)
    return {
        "total_organizations": total_orgs,
        "active_organizations": active_orgs,
        "suspended_organizations": total_orgs - active_orgs,
        "total_users": total_users,
        "total_leads_platform": total_leads,
        "total_admissions_platform": total_admissions,
        "platform_revenue": revenue,
        "plan_distribution": [{"plan": p["_id"], "count": p["count"]} for p in plan_dist],
    }

@api_router.get("/platform/organizations")
async def list_all_organizations(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    orgs = await db.organizations.find({}).sort("created_at", -1).to_list(1000)
    result = []
    now = datetime.now(timezone.utc)
    for org in orgs:
        oid = org["_id"]
        users_count = await db.users.count_documents({"organization_id": oid})
        leads_count = await db.leads.count_documents({"organization_id": oid})
        admissions_count = await db.admissions.count_documents({"organization_id": oid})
        end_date = org.get("subscription_end_date") or org.get("trial_end_date")
        if end_date and end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        days_remaining = max(0, (end_date - now).days) if end_date else None
        result.append({
            "id": str(oid),
            "name": org.get("name", ""),
            "subscription_plan": org.get("subscription_plan", "starter"),
            "subscription_status": org.get("subscription_status", "active"),
            "subscription_end_date": end_date.isoformat() if end_date else None,
            "days_remaining": days_remaining,
            "status": org.get("status", "active"),
            "users_count": users_count,
            "leads_count": leads_count,
            "admissions_count": admissions_count,
            "created_at": org["created_at"].isoformat() if isinstance(org.get("created_at"), datetime) else org.get("created_at"),
        })
    return result

@api_router.post("/platform/organizations")
async def create_organization(data: PlatformOrgCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    email = data.admin_email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    industry = (data.industry or "education").lower()
    if industry not in SUPPORTED_INDUSTRIES:
        industry = "education"
    org_result = await db.organizations.insert_one({
        "name": data.organization_name,
        "industry": industry,
        "subscription_plan": data.subscription_plan,
        "subscription_status": "trial",
        "trial_start_date": datetime.now(timezone.utc),
        "trial_end_date": datetime.now(timezone.utc) + timedelta(days=14),
        "subscription_end_date": datetime.now(timezone.utc) + timedelta(days=14),
        "status": "active",
        "settings": {},
        "created_at": datetime.now(timezone.utc),
    })
    org_id = org_result.inserted_id
    await db.users.insert_one({
        "email": email,
        "password_hash": hash_password(data.admin_password),
        "name": data.admin_name,
        "mobile": (data.admin_mobile or "").strip() or None,
        "role": "org_admin",
        "organization_id": org_id,
        "active": True,
        "created_at": datetime.now(timezone.utc),
    })
    # Seed default services for the chosen industry
    try:
        defaults = get_default_services(industry)
        if defaults:
            await db.services.insert_many([
                {
                    "name": s["name"],
                    "category": s.get("category", "General"),
                    "base_price": s.get("base_price", 0),
                    "min_price": s.get("min_price", s.get("base_price", 0)),
                    "active": True,
                    "organization_id": org_id,
                    "created_at": datetime.now(timezone.utc),
                }
                for s in defaults
            ])
    except Exception as e:
        logger.warning(f"Failed to seed default services for org {org_id}: {e}")
    return {"id": str(org_id), "name": data.organization_name, "industry": industry, "admin_email": email}

@api_router.put("/platform/organizations/{org_id}/toggle")
async def toggle_organization_status(org_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    org = await db.organizations.find_one({"_id": ObjectId(org_id)})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    new_status = "suspended" if org.get("status", "active") == "active" else "active"
    await db.organizations.update_one({"_id": ObjectId(org_id)}, {"$set": {"status": new_status}})
    return {"status": new_status}

@api_router.delete("/platform/organizations/{org_id}")
async def delete_organization(org_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    oid = ObjectId(org_id)
    # Cascade delete tenant data
    await db.users.delete_many({"organization_id": oid})
    await db.leads.delete_many({"organization_id": oid})
    await db.followups.delete_many({"organization_id": oid})
    await db.admissions.delete_many({"organization_id": oid})
    await db.tasks.delete_many({"organization_id": oid})
    await db.notifications.delete_many({"organization_id": oid})
    await db.activity_logs.delete_many({"organization_id": oid})
    await db.whatsapp_templates.delete_many({"organization_id": oid})
    await db.lead_sources.delete_many({"organization_id": oid})
    await db.campaigns.delete_many({"organization_id": oid})
    await db.support_tickets.delete_many({"organization_id": oid})
    await db.organizations.delete_one({"_id": oid})
    return {"message": "Organization and all related data deleted"}

# ==================== Voice Recording Upload ====================
ALLOWED_VOICE_MIME = {
    "audio/webm", "audio/mp4", "audio/mpeg", "audio/mp3", "audio/ogg",
    "audio/wav", "audio/x-wav", "audio/x-m4a", "audio/aac", "audio/opus",
    "audio/3gpp", "audio/amr",
    # Some browsers send video/* for audio-only containers (esp. WhatsApp .mp4 voice notes
    # and Chrome MediaRecorder webm). Accept these too.
    "video/webm", "video/mp4",
    # Generic fallback when the OS / browser couldn't sniff a MIME
    "application/octet-stream",
}
ALLOWED_VOICE_EXTS = (".mp3", ".m4a", ".wav", ".ogg", ".webm", ".mp4", ".aac", ".opus", ".3gp", ".amr")
MAX_VOICE_SIZE = 5 * 1024 * 1024  # 5 MB (supports uploaded calls up to ~5 min)
MAX_VOICE_DURATION = 300  # 5 minutes

@api_router.post("/uploads/voice-recording")
async def upload_voice_recording(
    file: UploadFile = File(...),
    duration: Optional[float] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Upload a follow-up voice recording (max 3 minutes, 3 MB) to Cloudinary.

    Allowed roles: counselor, telecaller, manager, org_admin, super_admin.
    """
    if current_user["role"] not in ("super_admin", "org_admin", "manager", "counselor", "telecaller"):
        raise HTTPException(status_code=403, detail="Not authorized to upload voice recordings")
    if not os.environ.get("CLOUDINARY_CLOUD_NAME"):
        raise HTTPException(status_code=500, detail="Voice uploads not configured")
    if file.content_type not in ALLOWED_VOICE_MIME:
        # Fall back to extension check (e.g. WhatsApp .mp4 voice notes may report odd MIME)
        fname = (file.filename or "").lower()
        ext_ok = any(fname.endswith(ext) for ext in ALLOWED_VOICE_EXTS)
        if not ext_ok:
            raise HTTPException(status_code=400, detail=f"Audio type {file.content_type} not allowed")
    content = await file.read()
    if len(content) > MAX_VOICE_SIZE:
        raise HTTPException(status_code=400, detail="Recording too large. Max 5 MB allowed.")
    if duration is not None and duration > MAX_VOICE_DURATION:
        raise HTTPException(status_code=400, detail="Recording duration exceeds 5 minutes")
    folder = f"leadtrak/voice/{current_user['organization_id']}"
    try:
        result = cloudinary.uploader.upload(
            content,
            folder=folder,
            resource_type="video",  # Cloudinary stores audio under 'video' resource type
        )
    except Exception as e:
        logger.error(f"Cloudinary voice upload failed: {e}")
        raise HTTPException(status_code=500, detail="Voice upload failed")
    return {
        "url": result.get("secure_url"),
        "public_id": result.get("public_id"),
        "duration": result.get("duration") or duration,
        "size": len(content),
        "mime_type": file.content_type,
    }


# ==================== Support Tickets ====================
ALLOWED_TICKET_MIME = {
    "image/jpeg", "image/jpg", "image/png", "image/webp",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
}
MAX_TICKET_FILE_SIZE = 200 * 1024  # 200 KB
MAX_TICKET_FILES = 5

class TicketCreate(BaseModel):
    subject: str
    category: str
    priority: str = "Medium"
    message: str
    attachments: Optional[List[Dict[str, Any]]] = []

class TicketReply(BaseModel):
    message: str
    attachments: Optional[List[Dict[str, Any]]] = []

class TicketStatusUpdate(BaseModel):
    status: str

@api_router.post("/uploads/ticket-attachment")
async def upload_ticket_attachment(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if not os.environ.get("CLOUDINARY_CLOUD_NAME"):
        raise HTTPException(status_code=500, detail="File uploads not configured. Please add Cloudinary credentials.")
    if file.content_type not in ALLOWED_TICKET_MIME:
        raise HTTPException(status_code=400, detail=f"File type {file.content_type} not allowed. Use JPG, PNG, PDF, or Excel.")
    content = await file.read()
    if len(content) > MAX_TICKET_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max 200 KB allowed.")
    is_image = file.content_type.startswith("image/")
    resource_type = "image" if is_image else "raw"
    folder = f"educrm/tickets/{current_user['organization_id']}"
    try:
        result = cloudinary.uploader.upload(
            content,
            folder=folder,
            resource_type=resource_type,
        )
    except Exception as e:
        logger.error(f"Cloudinary upload failed: {e}")
        raise HTTPException(status_code=500, detail="Upload failed")
    return {
        "url": result.get("secure_url"),
        "public_id": result.get("public_id"),
        "resource_type": resource_type,
        "filename": file.filename,
        "size": len(content),
        "mime_type": file.content_type,
    }

@api_router.post("/support-tickets")
async def create_ticket(data: TicketCreate, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    if data.attachments and len(data.attachments) > MAX_TICKET_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_TICKET_FILES} attachments allowed")
    ticket_count = await db.support_tickets.count_documents({})
    ticket_no = f"TKT{ticket_count + 1:05d}"
    doc = {
        "ticket_no": ticket_no,
        "subject": data.subject,
        "category": data.category,
        "priority": data.priority,
        "status": "open",
        "messages": [{
            "id": secrets.token_urlsafe(8),
            "sender_id": current_user["id"],
            "sender_name": current_user["name"],
            "sender_role": current_user["role"],
            "message": data.message,
            "attachments": data.attachments or [],
            "timestamp": datetime.now(timezone.utc),
        }],
        "organization_id": org_id,
        "created_by": current_user["id"],
        "creator_name": current_user["name"],
        "creator_email": current_user["email"],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.support_tickets.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    doc["organization_id"] = str(org_id)
    return doc

@api_router.get("/support-tickets")
async def list_tickets(current_user: dict = Depends(get_current_user)):
    role = current_user["role"]
    if role == "super_admin":
        query = {}
    elif role == "org_admin":
        query = {"organization_id": ObjectId(current_user["organization_id"])}
    else:
        # manager/counselor/telecaller — only their own tickets
        query = {
            "organization_id": ObjectId(current_user["organization_id"]),
            "created_by": current_user["id"],
        }
    tickets = await db.support_tickets.find(query, {"messages": 0}).sort("updated_at", -1).to_list(500)
    for t in tickets:
        t["_id"] = str(t["_id"])
        t["organization_id"] = str(t.get("organization_id", ""))
        if role == "super_admin":
            org = await db.organizations.find_one({"_id": ObjectId(t["organization_id"])}, {"name": 1})
            t["organization_name"] = org["name"] if org else ""
    return tickets

def _can_access_ticket(ticket: dict, current_user: dict) -> bool:
    role = current_user["role"]
    if role == "super_admin":
        return True
    if str(ticket["organization_id"]) != current_user["organization_id"]:
        return False
    if role == "org_admin":
        return True
    # other roles — only the creator
    return ticket.get("created_by") == current_user["id"]

@api_router.get("/support-tickets/{tid}")
async def get_ticket(tid: str, current_user: dict = Depends(get_current_user)):
    ticket = await db.support_tickets.find_one({"_id": ObjectId(tid)})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if not _can_access_ticket(ticket, current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    ticket["_id"] = str(ticket["_id"])
    ticket["organization_id"] = str(ticket["organization_id"])
    org = await db.organizations.find_one({"_id": ObjectId(ticket["organization_id"])}, {"name": 1})
    ticket["organization_name"] = org["name"] if org else ""
    for m in ticket.get("messages", []):
        if isinstance(m.get("timestamp"), datetime):
            m["timestamp"] = m["timestamp"].isoformat()
    return ticket

@api_router.post("/support-tickets/{tid}/reply")
async def reply_ticket(tid: str, data: TicketReply, current_user: dict = Depends(get_current_user)):
    ticket = await db.support_tickets.find_one({"_id": ObjectId(tid)})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if not _can_access_ticket(ticket, current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    if data.attachments and len(data.attachments) > MAX_TICKET_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_TICKET_FILES} attachments allowed")
    new_msg = {
        "id": secrets.token_urlsafe(8),
        "sender_id": current_user["id"],
        "sender_name": current_user["name"],
        "sender_role": current_user["role"],
        "message": data.message,
        "attachments": data.attachments or [],
        "timestamp": datetime.now(timezone.utc),
    }
    await db.support_tickets.update_one(
        {"_id": ObjectId(tid)},
        {"$push": {"messages": new_msg}, "$set": {"updated_at": datetime.now(timezone.utc)}},
    )
    # Notify the creator if reply is from staff (super_admin / org_admin)
    if current_user["role"] in ("super_admin", "org_admin") and ticket.get("created_by") != current_user["id"]:
        await db.notifications.insert_one({
            "user_id": ticket["created_by"],
            "message": f"New reply on your ticket {ticket['ticket_no']}: {ticket['subject']}",
            "type": "ticket_reply",
            "ticket_id": str(ticket["_id"]),
            "read": False,
            "organization_id": ticket["organization_id"],
            "created_at": datetime.now(timezone.utc),
        })
    return {"message": "Reply added"}

@api_router.delete("/support-tickets/{tid}/messages/{msg_id}")
async def delete_ticket_message(tid: str, msg_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admin can delete replies")
    ticket = await db.support_tickets.find_one({"_id": ObjectId(tid)})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    # Find message to optionally clean up Cloudinary attachments
    msg = next((m for m in ticket.get("messages", []) if m.get("id") == msg_id), None)
    if msg:
        for att in msg.get("attachments", []) or []:
            try:
                pid = att.get("public_id")
                if pid:
                    cloudinary.uploader.destroy(pid, resource_type=att.get("resource_type", "image"), invalidate=True)
            except Exception as e:
                logger.warning(f"Cloudinary delete failed: {e}")
    await db.support_tickets.update_one(
        {"_id": ObjectId(tid)},
        {"$pull": {"messages": {"id": msg_id}}, "$set": {"updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": "Reply deleted"}

@api_router.put("/support-tickets/{tid}/status")
async def update_ticket_status(tid: str, data: TicketStatusUpdate, current_user: dict = Depends(get_current_user)):
    ticket = await db.support_tickets.find_one({"_id": ObjectId(tid)})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if current_user["role"] not in ("super_admin", "org_admin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    if current_user["role"] == "org_admin" and str(ticket["organization_id"]) != current_user["organization_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    old_status = ticket.get("status")
    await db.support_tickets.update_one(
        {"_id": ObjectId(tid)},
        {"$set": {"status": data.status, "updated_at": datetime.now(timezone.utc)}},
    )
    # Notify creator on status change
    if old_status != data.status and ticket.get("created_by") != current_user["id"]:
        status_msg = {
            "resolved": "✅ Your ticket has been resolved",
            "in_progress": "🔄 Your ticket is now in progress",
            "closed": "Your ticket has been closed",
            "open": "Your ticket has been reopened",
        }.get(data.status, f"Ticket status changed to {data.status}")
        await db.notifications.insert_one({
            "user_id": ticket["created_by"],
            "message": f"{status_msg}: {ticket['subject']}",
            "type": "ticket_status",
            "ticket_id": str(ticket["_id"]),
            "read": False,
            "organization_id": ticket["organization_id"],
            "created_at": datetime.now(timezone.utc),
        })
    return {"status": data.status}

# Include the router in the main app
app.include_router(api_router)

# ==================== CORS (strict — no wildcard with credentials) ====================
_raw_origins = os.environ.get('CORS_ORIGINS', '')
_allowed_origins = [o.strip() for o in _raw_origins.split(',') if o.strip() and o.strip() != '*']
if not _allowed_origins:
    # Sane local default — never wildcard when credentials are enabled
    _allowed_origins = ['http://localhost:3000']
logger.info(f"CORS allowed origins: {_allowed_origins}")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    max_age=600,
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
