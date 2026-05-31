"""Industry templates for the multi-industry CRM.

Each template provides:
- label: Human-readable industry name (shown in dropdowns)
- icon: lucide-react icon name (used on the frontend)
- terms: Terminology overrides used across UI labels
- default_sources / default_lead_statuses / default_pipeline_stages:
  Seed data for a brand-new organization on that industry.
"""

INDUSTRY_CONFIG = {
    "education": {
        "label": "Education",
        "icon": "GraduationCap",
        "tagline": "Schools, colleges, coaching & EdTech",
        "terms": {
            "lead": "Lead", "leads": "Leads",
            "contact": "Student", "contacts": "Students",
            "conversion": "Admission", "conversions": "Admissions",
            "offering": "Course", "offerings": "Courses",
            "conversion_verb": "Enrolled",
            "conversion_action": "Convert to Admission",
            "pipeline": "Admission Pipeline",
            "revenue_label": "Fees Collected",
        },
        "default_sources": ["Website", "Facebook Ad", "Google Ad", "Walk-in", "Referral", "Cold Call", "WhatsApp"],
        "default_lead_statuses": [
            "New", "Contacted", "Interested", "Counseling Scheduled", "Counseling Done",
            "Application Sent", "Documents Pending", "Fee Discussion", "Admitted",
            "Not Interested", "Dropped", "Lost"
        ],
        "default_pipeline_stages": ["New Inquiry", "Counseling", "Documentation", "Fee Payment", "Enrolled"],
    },
    "it_software": {
        "label": "IT / Software",
        "icon": "Code2",
        "tagline": "SaaS, agencies, IT services & B2B tech",
        "terms": {
            "lead": "Lead", "leads": "Leads",
            "contact": "Client", "contacts": "Clients",
            "conversion": "Deal", "conversions": "Deals",
            "offering": "Service", "offerings": "Services",
            "conversion_verb": "Won",
            "conversion_action": "Close Deal",
            "pipeline": "Sales Pipeline",
            "revenue_label": "Revenue",
        },
        "default_sources": ["Website", "LinkedIn", "Referral", "Cold Email", "Demo Request", "Partner", "Event"],
        "default_lead_statuses": [
            "New", "Contacted", "Qualifying", "Demo Scheduled", "Demo Done",
            "Proposal Sent", "Negotiation", "Contract Sent", "Won", "Lost", "On Hold"
        ],
        "default_pipeline_stages": ["Discovery", "Qualification", "Demo", "Proposal", "Negotiation", "Closed Won"],
    },
    "real_estate": {
        "label": "Real Estate",
        "icon": "Home",
        "tagline": "Developers, brokers & property consultants",
        "terms": {
            "lead": "Lead", "leads": "Leads",
            "contact": "Buyer", "contacts": "Buyers",
            "conversion": "Booking", "conversions": "Bookings",
            "offering": "Property", "offerings": "Properties",
            "conversion_verb": "Booked",
            "conversion_action": "Convert to Booking",
            "pipeline": "Booking Pipeline",
            "revenue_label": "Booking Value",
        },
        "default_sources": ["99acres", "MagicBricks", "Housing.com", "Website", "Facebook Ad", "Walk-in", "Referral"],
        "default_lead_statuses": [
            "New", "Contacted", "Site Visit Scheduled", "Site Visited",
            "Negotiation", "Token Paid", "Booked", "Cancelled", "Lost"
        ],
        "default_pipeline_stages": ["Inquiry", "Site Visit", "Negotiation", "Token Money", "Agreement", "Booked"],
    },
    "healthcare": {
        "label": "Healthcare & Clinics",
        "icon": "Stethoscope",
        "tagline": "Hospitals, clinics, dental, wellness",
        "terms": {
            "lead": "Inquiry", "leads": "Inquiries",
            "contact": "Patient", "contacts": "Patients",
            "conversion": "Appointment", "conversions": "Appointments",
            "offering": "Treatment", "offerings": "Treatments",
            "conversion_verb": "Booked",
            "conversion_action": "Book Appointment",
            "pipeline": "Patient Pipeline",
            "revenue_label": "Treatment Revenue",
        },
        "default_sources": ["Website", "Google Ad", "Walk-in", "Referral", "Insurance Network", "WhatsApp"],
        "default_lead_statuses": ["New", "Contacted", "Consulted", "Treatment Ongoing", "Completed", "Lost"],
        "default_pipeline_stages": ["Inquiry", "Consultation Booked", "Consulted", "Treatment Plan", "Treatment Started", "Completed"],
    },
    "insurance": {
        "label": "Insurance",
        "icon": "ShieldCheck",
        "tagline": "Life, health, motor & general insurance",
        "terms": {
            "lead": "Lead", "leads": "Leads",
            "contact": "Policyholder", "contacts": "Policyholders",
            "conversion": "Policy", "conversions": "Policies",
            "offering": "Plan", "offerings": "Plans",
            "conversion_verb": "Issued",
            "conversion_action": "Issue Policy",
            "pipeline": "Policy Pipeline",
            "revenue_label": "Premium",
        },
        "default_sources": ["Website", "Cold Call", "Referral", "Walk-in", "Agent Network", "WhatsApp"],
        "default_lead_statuses": [
            "New", "Contacted", "Quote Sent", "Proposal Sent",
            "KYC Pending", "Underwriting", "Issued", "Rejected", "Lost"
        ],
        "default_pipeline_stages": ["Quote", "Proposal", "Medical/KYC", "Underwriting", "Issued"],
    },
    "travel": {
        "label": "Travel & Tour",
        "icon": "Plane",
        "tagline": "Tour operators, DMCs & travel agents",
        "terms": {
            "lead": "Lead", "leads": "Leads",
            "contact": "Traveler", "contacts": "Travelers",
            "conversion": "Booking", "conversions": "Bookings",
            "offering": "Package", "offerings": "Packages",
            "conversion_verb": "Booked",
            "conversion_action": "Confirm Booking",
            "pipeline": "Booking Pipeline",
            "revenue_label": "Trip Value",
        },
        "default_sources": ["Website", "Google Ad", "Instagram", "Facebook Ad", "Referral", "Walk-in", "WhatsApp"],
        "default_lead_statuses": [
            "New", "Itinerary Sent", "Quote Sent", "Negotiation",
            "Token Paid", "Confirmed", "Travelled", "Cancelled", "Lost"
        ],
        "default_pipeline_stages": ["Inquiry", "Itinerary", "Quote", "Negotiation", "Token", "Booked", "Travelled"],
    },
    "retail": {
        "label": "Retail & E-commerce",
        "icon": "ShoppingBag",
        "tagline": "Stores, D2C brands & online retail",
        "terms": {
            "lead": "Lead", "leads": "Leads",
            "contact": "Customer", "contacts": "Customers",
            "conversion": "Order", "conversions": "Orders",
            "offering": "Product", "offerings": "Products",
            "conversion_verb": "Ordered",
            "conversion_action": "Place Order",
            "pipeline": "Sales Pipeline",
            "revenue_label": "Order Value",
        },
        "default_sources": ["Website", "Instagram", "Facebook Ad", "Walk-in", "Referral", "Marketplace", "WhatsApp"],
        "default_lead_statuses": [
            "New", "Contacted", "Cart Added", "Checkout Started",
            "Ordered", "Shipped", "Delivered", "Returned", "Lost"
        ],
        "default_pipeline_stages": ["Inquiry", "Quote", "Order Placed", "Paid", "Shipped", "Delivered"],
    },
    "fitness": {
        "label": "Fitness & Wellness",
        "icon": "Dumbbell",
        "tagline": "Gyms, yoga, wellness studios & coaches",
        "terms": {
            "lead": "Lead", "leads": "Leads",
            "contact": "Member", "contacts": "Members",
            "conversion": "Membership", "conversions": "Memberships",
            "offering": "Program", "offerings": "Programs",
            "conversion_verb": "Joined",
            "conversion_action": "Activate Membership",
            "pipeline": "Membership Pipeline",
            "revenue_label": "Membership Revenue",
        },
        "default_sources": ["Website", "Instagram", "Walk-in", "Referral", "Google Ad", "WhatsApp"],
        "default_lead_statuses": [
            "New", "Trial Booked", "Trial Done", "Member",
            "Renewal Due", "Renewed", "Churned", "Lost"
        ],
        "default_pipeline_stages": ["Inquiry", "Trial Booked", "Trial Done", "Joined", "Active", "Renewed"],
    },
    "generic": {
        "label": "Generic Sales",
        "icon": "Briefcase",
        "tagline": "Any other B2B / B2C business",
        "terms": {
            "lead": "Lead", "leads": "Leads",
            "contact": "Customer", "contacts": "Customers",
            "conversion": "Deal", "conversions": "Deals",
            "offering": "Offering", "offerings": "Offerings",
            "conversion_verb": "Won",
            "conversion_action": "Close Deal",
            "pipeline": "Sales Pipeline",
            "revenue_label": "Revenue",
        },
        "default_sources": ["Website", "Referral", "Cold Call", "Walk-in", "Email", "Event", "WhatsApp"],
        "default_lead_statuses": [
            "New", "Contacted", "Qualified", "Proposal Sent",
            "Negotiation", "Won", "Lost", "On Hold"
        ],
        "default_pipeline_stages": ["Lead", "Qualified", "Proposal", "Negotiation", "Won"],
    },
}


SUPPORTED_INDUSTRIES = list(INDUSTRY_CONFIG.keys())


# ==================== Default Services per Industry ====================
# Seeded on org signup. Format: {name, category, base_price, min_price}
DEFAULT_SERVICES = {
    "education": [
        {"name": "MBA Full-time", "category": "Master's", "base_price": 240000, "min_price": 200000},
        {"name": "BBA", "category": "Bachelor's", "base_price": 120000, "min_price": 100000},
        {"name": "PGDM", "category": "Master's", "base_price": 300000, "min_price": 275000},
        {"name": "MCA", "category": "Master's", "base_price": 180000, "min_price": 160000},
        {"name": "BTech CSE", "category": "Bachelor's", "base_price": 200000, "min_price": 180000},
    ],
    "it_software": [
        {"name": "Website Development", "category": "Web", "base_price": 50000, "min_price": 35000},
        {"name": "Mobile App (iOS+Android)", "category": "Mobile", "base_price": 150000, "min_price": 120000},
        {"name": "Custom SaaS Build", "category": "Product", "base_price": 500000, "min_price": 400000},
        {"name": "DevOps Setup", "category": "Infra", "base_price": 80000, "min_price": 60000},
        {"name": "Maintenance (Annual)", "category": "Support", "base_price": 60000, "min_price": 48000},
    ],
    "real_estate": [
        {"name": "1 BHK Apartment", "category": "Apartment", "base_price": 4500000, "min_price": 4200000},
        {"name": "2 BHK Apartment", "category": "Apartment", "base_price": 7500000, "min_price": 7000000},
        {"name": "3 BHK Apartment", "category": "Apartment", "base_price": 11000000, "min_price": 10500000},
        {"name": "Villa", "category": "Independent", "base_price": 25000000, "min_price": 23000000},
        {"name": "Commercial Office", "category": "Commercial", "base_price": 15000000, "min_price": 13500000},
    ],
    "healthcare": [
        {"name": "General Consultation", "category": "Consult", "base_price": 600, "min_price": 500},
        {"name": "Dental Cleaning", "category": "Dental", "base_price": 2500, "min_price": 2000},
        {"name": "Physiotherapy Session", "category": "Physio", "base_price": 1200, "min_price": 1000},
        {"name": "Full Body Health Check", "category": "Diagnostics", "base_price": 8000, "min_price": 6500},
        {"name": "Specialist Consult", "category": "Consult", "base_price": 1500, "min_price": 1200},
    ],
    "insurance": [
        {"name": "Term Life — 1 Cr", "category": "Life", "base_price": 12000, "min_price": 11000},
        {"name": "Health Floater Family", "category": "Health", "base_price": 25000, "min_price": 22000},
        {"name": "Motor — Private Car", "category": "Motor", "base_price": 8500, "min_price": 7500},
        {"name": "Home Insurance", "category": "Property", "base_price": 5500, "min_price": 5000},
    ],
    "travel": [
        {"name": "Goa 3N4D Package", "category": "Domestic", "base_price": 18000, "min_price": 15000},
        {"name": "Kerala 5N6D Package", "category": "Domestic", "base_price": 32000, "min_price": 28000},
        {"name": "Dubai 4N5D Package", "category": "International", "base_price": 65000, "min_price": 58000},
        {"name": "Europe 10D Package", "category": "International", "base_price": 250000, "min_price": 230000},
    ],
    "retail": [
        {"name": "Premium T-Shirt", "category": "Apparel", "base_price": 1500, "min_price": 1200},
        {"name": "Sneakers", "category": "Footwear", "base_price": 4500, "min_price": 3800},
        {"name": "Smartwatch", "category": "Electronics", "base_price": 12000, "min_price": 10500},
        {"name": "Gift Hamper", "category": "Lifestyle", "base_price": 2500, "min_price": 2000},
    ],
    "fitness": [
        {"name": "Monthly Membership", "category": "Gym", "base_price": 2500, "min_price": 2000},
        {"name": "Quarterly Membership", "category": "Gym", "base_price": 6500, "min_price": 5500},
        {"name": "Annual Membership", "category": "Gym", "base_price": 22000, "min_price": 18000},
        {"name": "Personal Trainer (10 sessions)", "category": "Training", "base_price": 12000, "min_price": 10000},
        {"name": "Yoga Pass (Monthly)", "category": "Yoga", "base_price": 3000, "min_price": 2500},
    ],
    "generic": [
        {"name": "Standard Package", "category": "General", "base_price": 10000, "min_price": 8000},
        {"name": "Premium Package", "category": "General", "base_price": 25000, "min_price": 22000},
        {"name": "Enterprise Package", "category": "General", "base_price": 100000, "min_price": 90000},
    ],
}


def get_default_services(industry: str) -> list:
    return DEFAULT_SERVICES.get(industry, DEFAULT_SERVICES["generic"])


def get_industry(industry: str) -> dict:
    """Return the config for an industry, falling back to generic."""
    return INDUSTRY_CONFIG.get(industry) or INDUSTRY_CONFIG["generic"]


def get_terms(industry: str) -> dict:
    return get_industry(industry)["terms"]


def get_lead_statuses(industry: str) -> list:
    """Return industry-specific lead status list (used in dropdowns)."""
    return get_industry(industry).get("default_lead_statuses", [])


def list_industries() -> list:
    """Return public industry list (for the signup dropdown)."""
    return [
        {
            "key": key,
            "label": cfg["label"],
            "icon": cfg["icon"],
            "tagline": cfg["tagline"],
        }
        for key, cfg in INDUSTRY_CONFIG.items()
    ]
