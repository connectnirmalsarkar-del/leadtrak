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
        "default_lead_statuses": ["New", "Contacted", "Interested", "Follow-up", "Converted", "Lost"],
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
        "default_lead_statuses": ["New", "Qualifying", "Demo Scheduled", "Proposal Sent", "Negotiation", "Won", "Lost"],
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
        "default_lead_statuses": ["New", "Contacted", "Site Visit Scheduled", "Site Visited", "Negotiation", "Booked", "Lost"],
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
        "default_lead_statuses": ["New", "Contacted", "Quote Sent", "Proposal", "Issued", "Lost"],
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
        "default_lead_statuses": ["New", "Quote Sent", "Negotiation", "Confirmed", "Travelled", "Lost"],
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
        "default_lead_statuses": ["New", "Contacted", "Cart Added", "Checkout", "Ordered", "Lost"],
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
        "default_lead_statuses": ["New", "Trial Booked", "Trial Done", "Member", "Renewed", "Lost"],
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
        "default_lead_statuses": ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"],
        "default_pipeline_stages": ["Lead", "Qualified", "Proposal", "Negotiation", "Won"],
    },
}


SUPPORTED_INDUSTRIES = list(INDUSTRY_CONFIG.keys())


def get_industry(industry: str) -> dict:
    """Return the config for an industry, falling back to generic."""
    return INDUSTRY_CONFIG.get(industry) or INDUSTRY_CONFIG["generic"]


def get_terms(industry: str) -> dict:
    return get_industry(industry)["terms"]


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
