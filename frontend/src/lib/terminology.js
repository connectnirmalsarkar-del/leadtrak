// Terminology helper for multi-industry CRM.
// Reads labels from the authenticated user's organization industry template.
// Falls back to generic Education-style labels if not yet loaded.

import { useAuth } from '@/context/AuthContext';

const FALLBACK_TERMS = {
  lead: 'Lead',
  leads: 'Leads',
  contact: 'Contact',
  contacts: 'Contacts',
  conversion: 'Conversion',
  conversions: 'Conversions',
  offering: 'Offering',
  offerings: 'Offerings',
  conversion_verb: 'Converted',
  conversion_action: 'Convert',
  pipeline: 'Sales Pipeline',
  revenue_label: 'Revenue',
};

export function useTerminology() {
  const { user } = useAuth();
  const t = (user && user.terminology) || {};
  return { ...FALLBACK_TERMS, ...t };
}

export function useIndustry() {
  const { user } = useAuth();
  return user?.industry || 'education';
}
