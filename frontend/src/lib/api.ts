const API_BASE = import.meta.env.VITE_API_URL || '';

export interface GrantSummary {
  id: number;
  opportunity_number: string;
  title: string;
  agency: string | null;
  award_floor: number | null;
  award_ceiling: number | null;
  close_date: string | null;
  posting_date: string | null;
  status: string | null;
  funding_instrument: string | null;
  cost_sharing: boolean;
  applicant_types: Array<{ id: string; description: string }>;
  funding_categories: Array<{ id: string; description: string }>;
}

export interface GrantDetail {
  id: number;
  opportunity_number: string;
  title: string;
  description: string | null;
  agency_name: string | null;
  agency_code: string | null;
  award_floor: number | null;
  award_ceiling: number | null;
  posting_date: string | null;
  close_date: string | null;
  cost_sharing: boolean;
  funding_instruments: Array<{ id: string; description: string }>;
  funding_categories: Array<{ id: string; description: string }>;
  applicant_types: Array<{ id: string; description: string }>;
  agency_contact_name: string | null;
  agency_contact_email: string | null;
  agency_contact_phone: string | null;
  application_url: string | null;
  attachments: Array<{
    fileName: string;
    mimeType: string;
    fileDescription: string;
    folderType: string;
  }>;
  alns: Array<{ alnNumber: string; programTitle: string }>;
}

export interface SearchParams {
  keyword: string;
  eligibilities: string;
  agencies: string;
  opp_statuses: string;
  funding_categories: string;
  rows: number;
  page: number;
  award_floor?: number | null;
  award_ceiling?: number | null;
}

export interface SearchResponse {
  total: number;
  page: number;
  rows: number;
  results: GrantSummary[];
}

export async function searchGrants(params: SearchParams): Promise<SearchResponse> {
  const body: Record<string, unknown> = { ...params };
  if (body.award_floor == null) delete body.award_floor;
  if (body.award_ceiling == null) delete body.award_ceiling;

  const resp = await fetch(`${API_BASE}/api/grants/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Search failed: ${resp.statusText}`);
  return resp.json();
}

export async function fetchGrantDetail(id: number): Promise<GrantDetail> {
  const resp = await fetch(`${API_BASE}/api/grants/detail/${id}`);
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.statusText}`);
  return resp.json();
}

export async function getReferenceData(
  type: 'funding-categories' | 'applicant-types' | 'agencies'
): Promise<Record<string, string>> {
  const resp = await fetch(`${API_BASE}/api/grants/reference/${type}`);
  if (!resp.ok) throw new Error(`Reference data fetch failed: ${resp.statusText}`);
  return resp.json();
}
