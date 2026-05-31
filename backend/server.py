from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Response, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import io
import csv
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
from industry_config import INDUSTRY_CONFIG, SUPPORTED_INDUSTRIES, get_industry, get_terms, list_industries

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = "HS256"

# Razorpay Configuration
razorpay_client = razorpay.Client(auth=(os.environ.get("RAZORPAY_KEY_ID", ""), os.environ.get("RAZORPAY_KEY_SECRET", "")))

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
        org_id = user.get("organization_id")
        user["organization_id"] = str(org_id) if org_id else ""
        user.pop("password_hash", None)
        # Attach industry + terminology from the organization
        industry_key = "generic"
        org_name = ""
        if org_id:
            org = await db.organizations.find_one({"_id": org_id}, {"industry": 1, "name": 1})
            if org:
                industry_key = org.get("industry") or "education"
                org_name = org.get("name", "")
        user["industry"] = industry_key
        user["organization_name"] = org_name
        user["terminology"] = get_terms(industry_key)
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
            lockout_time = attempt["last_attempt"] + timedelta(minutes=15)
            if datetime.now(timezone.utc) < lockout_time:
                remaining = int((lockout_time - datetime.now(timezone.utc)).total_seconds() / 60)
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

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    mobile: Optional[str] = None

class LeadCreate(BaseModel):
    name: str
    mobile: str
    email: Optional[str] = None
    course_interested: str
    state: Optional[str] = None
    city: Optional[str] = None
    lead_source: str
    assigned_to: Optional[str] = None
    status: str = "New"

class LeadUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    course_interested: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    lead_source: Optional[str] = None
    assigned_to: Optional[str] = None
    status: Optional[str] = None

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

class AdmissionCreate(BaseModel):
    student_name: str
    mobile: str
    course: str
    fees: float
    admission_date: str
    lead_id: Optional[str] = None

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

class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
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
    logger.info("Database initialized and indexes created")

# ==================== Auth Routes ====================
@api_router.post("/auth/register")
async def register(data: RegisterRequest, response: Response):
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

    # Create organization
    org_result = await db.organizations.insert_one({
        "name": data.organization_name,
        "industry": industry,
        "subscription_plan": "starter",
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
async def forgot_password(data: ForgotPasswordRequest):
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
    reset_link = f"{frontend_url}/reset-password?token={token}"
    logger.info(f"Password reset link: {reset_link}")
    
    return {"message": "If email exists, reset link has been sent"}

@api_router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordRequest):
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

    # Hard-block duplicates on mobile OR email
    or_clauses = [{"mobile": data.mobile}]
    if data.email:
        or_clauses.append({"email": data.email})
    duplicate = await db.leads.find_one(
        {"organization_id": org_id, "$or": or_clauses},
        {"name": 1, "mobile": 1, "email": 1, "lead_id": 1},
    )
    if duplicate:
        duplicate["_id"] = str(duplicate["_id"])
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"Lead already exists with this {'mobile' if duplicate.get('mobile') == data.mobile else 'email'}",
                "existing_lead": duplicate,
            },
        )

    # Generate lead_id
    lead_count = await db.leads.count_documents({"organization_id": org_id})
    lead_id = f"LEAD{lead_count + 1:05d}"
    
    lead_doc = {
        "lead_id": lead_id,
        "name": data.name,
        "mobile": data.mobile,
        "email": data.email,
        "course_interested": data.course_interested,
        "state": data.state,
        "city": data.city,
        "lead_source": data.lead_source,
        "assigned_to": data.assigned_to,
        "status": data.status,
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
            "assigned_to": data.assigned_to,
        },
        current_user,
        org_id,
    )

    lead_doc["organization_id"] = str(org_id)
    
    # Create notification for assigned user
    if data.assigned_to:
        await db.notifications.insert_one({
            "user_id": data.assigned_to,
            "message": f"New lead '{data.name}' has been assigned to you",
            "type": "lead_assigned",
            "read": False,
            "organization_id": org_id,
            "created_at": datetime.now(timezone.utc)
        })

    return lead_doc

@api_router.get("/leads")
async def get_leads(
    current_user: dict = Depends(get_current_user),
    status: Optional[str] = None,
    source: Optional[str] = None,
    assigned_to: Optional[str] = None,
    search: Optional[str] = None
):
    org_id = ObjectId(current_user["organization_id"])
    query = {"organization_id": org_id}
    
    if status:
        query["status"] = status
    if source:
        query["lead_source"] = source
    if assigned_to:
        query["assigned_to"] = assigned_to
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"mobile": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]
    
    leads = await db.leads.find(query, {"organization_id": 0}).sort("created_at", -1).to_list(1000)
    for lead in leads:
        lead["_id"] = str(lead["_id"])
    
    return leads

@api_router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    lead = await db.leads.find_one({"_id": ObjectId(lead_id), "organization_id": org_id}, {"organization_id": 0})
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    lead["_id"] = str(lead["_id"])
    return lead

@api_router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, data: LeadUpdate, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    # Read current lead so we can log diffs
    current = await db.leads.find_one({"_id": ObjectId(lead_id), "organization_id": org_id})
    if not current:
        raise HTTPException(status_code=404, detail="Lead not found")

    result = await db.leads.update_one(
        {"_id": ObjectId(lead_id), "organization_id": org_id},
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
    return {"message": "Lead updated successfully"}

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    
    if current_user["role"] not in ["super_admin", "org_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete leads")
    
    result = await db.leads.delete_one({"_id": ObjectId(lead_id), "organization_id": org_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    return {"message": "Lead deleted successfully"}

@api_router.post("/leads/{lead_id}/assign")
async def assign_lead(lead_id: str, assigned_to: str, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    
    result = await db.leads.update_one(
        {"_id": ObjectId(lead_id), "organization_id": org_id},
        {"$set": {"assigned_to": assigned_to}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Create notification
    lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
    await db.notifications.insert_one({
        "user_id": assigned_to,
        "message": f"Lead '{lead['name']}' has been assigned to you",
        "type": "lead_assigned",
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
    lead = await db.leads.find_one({"_id": ObjectId(lead_id), "organization_id": org_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Validate new assignee belongs to same org
    new_assignee = await db.users.find_one({"_id": ObjectId(data.new_assignee_id), "organization_id": org_id})
    if not new_assignee:
        raise HTTPException(status_code=400, detail="New assignee not found in your organization")

    previous_assignee_id = lead.get("assigned_to")
    previous_assignee = None
    if previous_assignee_id:
        previous_assignee = await db.users.find_one({"_id": ObjectId(previous_assignee_id)}, {"name": 1})

    await db.leads.update_one(
        {"_id": ObjectId(lead_id), "organization_id": org_id},
        {"$set": {"assigned_to": data.new_assignee_id}},
    )

    await log_lead_event(
        lead_id,
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
        "read": False,
        "organization_id": org_id,
        "created_at": datetime.now(timezone.utc),
    })

    return {"message": "Lead transferred successfully"}


@api_router.get("/leads/{lead_id}/timeline")
async def get_lead_timeline(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Return the full chronological timeline for a lead. Tenant isolated."""
    org_id = ObjectId(current_user["organization_id"])
    lead = await db.leads.find_one({"_id": ObjectId(lead_id), "organization_id": org_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    events = await db.lead_timeline.find(
        {"lead_id": ObjectId(lead_id), "organization_id": org_id}
    ).sort("created_at", 1).to_list(1000)
    for e in events:
        e["_id"] = str(e["_id"])
        e["lead_id"] = str(e["lead_id"])
        e.pop("organization_id", None)
        if isinstance(e.get("created_at"), datetime):
            e["created_at"] = e["created_at"].isoformat()
    return events

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
    filter_type: Optional[str] = None
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
    
    followups = await db.followups.find(query, {"organization_id": 0}).sort("followup_date", 1).to_list(1000)
    
    # Populate lead details
    for followup in followups:
        followup["_id"] = str(followup["_id"])
        lead = await db.leads.find_one({"_id": ObjectId(followup["lead_id"])}, {"name": 1, "mobile": 1})
        if lead:
            followup["lead_name"] = lead["name"]
            followup["lead_mobile"] = lead["mobile"]
    
    return followups

@api_router.put("/followups/{followup_id}/complete")
async def complete_followup(followup_id: str, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    
    result = await db.followups.update_one(
        {"_id": ObjectId(followup_id), "organization_id": org_id},
        {"$set": {"completed": True}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Followup not found")
    
    return {"message": "Followup marked as completed"}

# ==================== Admission Routes ====================
@api_router.post("/admissions")
async def create_admission(data: AdmissionCreate, current_user: dict = Depends(get_current_user)):
    org_id = ObjectId(current_user["organization_id"])
    
    admission_doc = {
        "student_name": data.student_name,
        "mobile": data.mobile,
        "course": data.course,
        "fees": data.fees,
        "admission_date": data.admission_date,
        "lead_id": data.lead_id,
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
                "offering": data.course,
                "amount": data.fees,
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
@api_router.post("/users")
async def create_user(data: UserCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["super_admin", "org_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized to create users")
    
    org_id = ObjectId(current_user["organization_id"])
    email = data.email.lower()
    
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    
    # Generate temporary password
    temp_password = secrets.token_urlsafe(8)
    hashed = hash_password(temp_password)
    
    user_doc = {
        "email": email,
        "password_hash": hashed,
        "name": data.name,
        "role": data.role,
        "mobile": data.mobile,
        "organization_id": org_id,
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = str(result.inserted_id)
    user_doc["organization_id"] = str(org_id)
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
    
    return users

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, data: UserUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["super_admin", "org_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized to update users")
    
    org_id = ObjectId(current_user["organization_id"])
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
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
    
    result = await db.organizations.update_one(
        {"_id": ObjectId(current_user["organization_id"])},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    return {"message": "Organization updated successfully"}

# ==================== Subscription Routes ====================
@api_router.get("/subscription-plans")
async def get_subscription_plans():
    plans = await db.subscription_plans.find({}, {"_id": 0}).to_list(10)
    return plans

@api_router.post("/subscriptions/create-order")
async def create_subscription_order(data: SubscriptionCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["super_admin", "org_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    plan = await db.subscription_plans.find_one({"_id": ObjectId(data.plan_id)})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    amount = plan[f"price_{data.billing_cycle}"] * 100  # Convert to paise
    
    try:
        order = razorpay_client.order.create({
            "amount": amount,
            "currency": "INR",
            "payment_capture": 1
        })
        
        return {
            "order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"]
        }
    except Exception as e:
        logger.error(f"Razorpay error: {str(e)}")
        raise HTTPException(status_code=500, detail="Payment order creation failed")

@api_router.post("/subscriptions/verify")
async def verify_subscription(payment_id: str, order_id: str, signature: str, current_user: dict = Depends(get_current_user)):
    try:
        razorpay_client.utility.verify_payment_signature({
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature
        })
        
        # Update organization subscription
        await db.organizations.update_one(
            {"_id": ObjectId(current_user["organization_id"])},
            {"$set": {"subscription_status": "active", "last_payment_date": datetime.now(timezone.utc)}}
        )
        
        return {"message": "Payment verified successfully"}
    except Exception as e:
        logger.error(f"Payment verification error: {str(e)}")
        raise HTTPException(status_code=400, detail="Payment verification failed")

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

# ==================== Integration Routes ====================
@api_router.post("/integrations/facebook-leads")
async def facebook_lead_webhook(request: Request):
    # Structure for Facebook Lead Ads webhook
    # User needs to configure this with their Facebook App
    data = await request.json()
    logger.info(f"Facebook lead received: {data}")
    
    # TODO: Validate webhook signature
    # TODO: Parse lead data and create lead in database
    
    return {"status": "received"}

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
    followups = await db.followups.find({"organization_id": org_id, "followup_date": today}).limit(5).to_list(5)
    for fu in followups:
        fu["_id"] = str(fu["_id"])
        fu.pop("organization_id", None)
        lead = await db.leads.find_one({"_id": ObjectId(fu["lead_id"])}, {"name": 1, "mobile": 1})
        if lead:
            fu["lead_name"] = lead["name"]
            fu["lead_mobile"] = lead["mobile"]
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
    errors = []
    for idx, row in enumerate(rows, start=2):
        try:
            name = (row.get("name") or row.get("Name") or "").strip()
            mobile = (row.get("mobile") or row.get("Mobile") or "").strip()
            if not name or not mobile:
                errors.append(f"Row {idx}: missing name or mobile")
                continue
            lead_count = await db.leads.count_documents({"organization_id": org_id})
            lead_id = f"LEAD{lead_count + 1:05d}"
            await db.leads.insert_one({
                "lead_id": lead_id,
                "name": name,
                "mobile": mobile,
                "email": row.get("email") or row.get("Email") or "",
                "course_interested": row.get("course") or row.get("Course") or "General",
                "state": row.get("state") or row.get("State") or "",
                "city": row.get("city") or row.get("City") or "",
                "lead_source": row.get("source") or row.get("Source") or "CSV Import",
                "assigned_to": None,
                "status": "New",
                "organization_id": org_id,
                "created_by": current_user["id"],
                "created_at": datetime.now(timezone.utc),
            })
            imported += 1
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
    
    await log_activity(org_id, current_user["id"], current_user["name"], "imported_csv", "leads", None, f"{imported} leads imported")
    return {"imported": imported, "errors": errors[:10], "total_errors": len(errors)}

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

@api_router.post("/widget/lead/{widget_token}")
async def public_widget_lead(widget_token: str, data: PublicLeadCreate):
    org = await db.organizations.find_one({"widget_token": widget_token})
    if not org:
        raise HTTPException(status_code=404, detail="Invalid widget token")
    org_id = org["_id"]
    lead_count = await db.leads.count_documents({"organization_id": org_id})
    lead_id = f"LEAD{lead_count + 1:05d}"
    await db.leads.insert_one({
        "lead_id": lead_id,
        "name": data.name,
        "mobile": data.mobile,
        "email": data.email,
        "course_interested": data.course_interested or "Inquiry",
        "state": "",
        "city": "",
        "lead_source": "Website Widget",
        "assigned_to": None,
        "status": "New",
        "remarks": data.message or "",
        "organization_id": org_id,
        "created_by": None,
        "created_at": datetime.now(timezone.utc),
    })
    return {"status": "success", "message": "Thanks! We'll be in touch shortly."}

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
    admin_name: str
    admin_email: EmailStr
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
    for org in orgs:
        oid = org["_id"]
        users_count = await db.users.count_documents({"organization_id": oid})
        leads_count = await db.leads.count_documents({"organization_id": oid})
        admissions_count = await db.admissions.count_documents({"organization_id": oid})
        result.append({
            "id": str(oid),
            "name": org.get("name", ""),
            "subscription_plan": org.get("subscription_plan", "starter"),
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
    org_result = await db.organizations.insert_one({
        "name": data.organization_name,
        "subscription_plan": data.subscription_plan,
        "status": "active",
        "settings": {},
        "created_at": datetime.now(timezone.utc),
    })
    org_id = org_result.inserted_id
    await db.users.insert_one({
        "email": email,
        "password_hash": hash_password(data.admin_password),
        "name": data.admin_name,
        "role": "org_admin",
        "organization_id": org_id,
        "created_at": datetime.now(timezone.utc),
    })
    return {"id": str(org_id), "name": data.organization_name, "admin_email": email}

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
    "audio/wav", "audio/x-wav", "audio/x-m4a", "audio/aac",
    # Some browsers send video/* for webm audio recordings
    "video/webm",
}
MAX_VOICE_SIZE = 3 * 1024 * 1024  # 3 MB

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
        raise HTTPException(status_code=400, detail=f"Audio type {file.content_type} not allowed")
    content = await file.read()
    if len(content) > MAX_VOICE_SIZE:
        raise HTTPException(status_code=400, detail="Recording too large. Max 3 MB (≈3 minutes) allowed.")
    if duration is not None and duration > 180:
        raise HTTPException(status_code=400, detail="Recording duration exceeds 3 minutes")
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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
