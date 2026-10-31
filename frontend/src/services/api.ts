import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Authorization Bearer token from localStorage
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('cld_access_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta: {
    timestamp: string;
    request_id?: string;
  };
  error?: {
    code: string;
    message: string;
    details?: Array<{ field?: string; issue: string }>;
  };
}

export interface HealthStatus {
  status: string;
  environment: string;
  version: string;
  project: string;
}

export interface DbHealthStatus {
  status: string;
  database_url: string;
}

export interface SiteMetadata {
  client_name: string;
  contract_value: number;
  budgeted_cost: number;
  currency: string;
}

export interface SiteRecord {
  id: string;
  name: string;
  location: string;
  status: string;
  project_type: string;
  start_date: string;
  target_completion_date: string;
  metadata?: SiteMetadata;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  roles: string[];
  assigned_site_ids: string[];
  has_global_scope: boolean;
}

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserProfile;
}

// Field Operations Interfaces
export interface ProgressItem {
  id?: string;
  work_package: string;
  activity_name: string;
  unit_of_measure: string;
  planned_quantity: number;
  actual_quantity: number;
  cumulative_quantity: number;
  notes?: string;
}

export interface ManpowerItem {
  id?: string;
  trade_category: string;
  contractor_name: string;
  planned_count: number;
  actual_count: number;
  overtime_hours: number;
}

export interface ExpenditureItem {
  id?: string;
  cost_code: string;
  category: string;
  planned_amount: number;
  actual_amount: number;
  vendor_name?: string;
  invoice_ref?: string;
}

export interface ActivityItem {
  id?: string;
  name: string;
  status: string;
  blockers?: string;
  mitigation_steps?: string;
}

export interface DailyReportSummary {
  id: string;
  site_id: string;
  reporting_date: string;
  status: string;
  current_version: number;
  submitted_by?: string;
  submitted_at?: string;
  validated_by?: string;
  validated_at?: string;
  site_manager_remarks?: string;
  flagged_reason?: string;
}

export interface DailyReportDetail extends DailyReportSummary {
  progress_records: ProgressItem[];
  manpower_records: ManpowerItem[];
  expenditure_records: ExpenditureItem[];
  activity_records: ActivityItem[];
}

export interface VersionSnapshot {
  id: string;
  version_number: number;
  snapshot_data: any;
  change_summary?: string;
  submitted_by?: string;
  created_at: string;
}

// Quality & Safety Interfaces
export interface QualityChecklistItem {
  id?: string;
  parameter: string;
  is_compliant: boolean;
  comments?: string;
}

export interface QualityInspection {
  id: string;
  site_id: string;
  inspection_date: string;
  inspector_id: string;
  inspection_type: string;
  wbs_location: string;
  outcome: string;
  remarks?: string;
  checklist_items: QualityChecklistItem[];
}

export interface NCRRecord {
  id: string;
  site_id: string;
  ncr_number: string;
  issued_to: string;
  root_cause?: string;
  corrective_action_required?: string;
  status: string;
  closure_date?: string;
  rework_cost: number;
  delay_days: number;
}

export interface SafetyChecklistItem {
  id?: string;
  category: string;
  item_description: string;
  is_compliant: boolean;
  severity: string;
  corrective_action_required: boolean;
}

export interface SafetyInspection {
  id: string;
  site_id: string;
  inspection_date: string;
  inspector_id: string;
  inspection_type: string;
  compliance_score_pct: number;
  remarks?: string;
  checklist_items: SafetyChecklistItem[];
}

export interface SafetyObservation {
  id: string;
  site_id: string;
  observer_id: string;
  observation_date: string;
  category: string;
  severity: string;
  description: string;
  status: string;
}

export interface SafetyIncident {
  id: string;
  site_id: string;
  incident_date: string;
  severity: string;
  title: string;
  description: string;
  injured_count: number;
  lost_time_hours: number;
  root_cause?: string;
  status: string;
}

export interface CorrectiveActionItem {
  id: string;
  site_id: string;
  source_type: string;
  source_id?: string;
  title: string;
  description: string;
  priority: string;
  due_date: string;
  status: string;
  created_by: string;
  created_at: string;
  status_history: Array<{
    id: string;
    old_status: string;
    new_status: string;
    changed_by: string;
    notes?: string;
    created_at: string;
  }>;
}

// Auth APIs
export const loginApi = async (email: string, password: string): Promise<LoginResult> => {
  const response = await apiClient.post<ApiResponse<LoginResult>>('/auth/login', { email, password });
  const data = response.data.data;
  localStorage.setItem('cld_access_token', data.access_token);
  localStorage.setItem('cld_refresh_token', data.refresh_token);
  return data;
};

export const fetchMeApi = async (): Promise<UserProfile> => {
  const response = await apiClient.get<ApiResponse<UserProfile>>('/auth/me');
  return response.data.data;
};

export const logoutApi = async (): Promise<void> => {
  const refreshToken = localStorage.getItem('cld_refresh_token');
  try {
    if (refreshToken) {
      await apiClient.post('/auth/logout', { refresh_token: refreshToken });
    }
  } finally {
    localStorage.removeItem('cld_access_token');
    localStorage.removeItem('cld_refresh_token');
  }
};

export const fetchHealth = async (): Promise<HealthStatus> => {
  const response = await apiClient.get<ApiResponse<HealthStatus>>('/health');
  return response.data.data;
};

export const fetchDbHealth = async (): Promise<DbHealthStatus> => {
  const response = await apiClient.get<ApiResponse<DbHealthStatus>>('/health/db');
  return response.data.data;
};

export const fetchSites = async (): Promise<SiteRecord[]> => {
  const response = await apiClient.get<ApiResponse<SiteRecord[]>>('/sites');
  return response.data.data;
};

// Operations APIs
export const fetchDailyReports = async (siteId?: string): Promise<DailyReportSummary[]> => {
  const params = siteId && siteId !== 'ALL' ? { site_id: siteId } : {};
  const response = await apiClient.get<ApiResponse<DailyReportSummary[]>>('/daily-reports', { params });
  return response.data.data;
};

export const fetchDailyReportDetail = async (reportId: string): Promise<DailyReportDetail> => {
  const response = await apiClient.get<ApiResponse<DailyReportDetail>>(`/daily-reports/${reportId}`);
  return response.data.data;
};

export const submitDailyReport = async (reportId: string): Promise<DailyReportDetail> => {
  const response = await apiClient.post<ApiResponse<DailyReportDetail>>(`/daily-reports/${reportId}/submit`);
  return response.data.data;
};

export const fetchReportVersions = async (reportId: string): Promise<VersionSnapshot[]> => {
  const response = await apiClient.get<ApiResponse<VersionSnapshot[]>>(`/daily-reports/${reportId}/versions`);
  return response.data.data;
};

// Quality APIs
export const fetchQualityInspections = async (siteId?: string): Promise<QualityInspection[]> => {
  const params = siteId && siteId !== 'ALL' ? { site_id: siteId } : {};
  const response = await apiClient.get<ApiResponse<QualityInspection[]>>('/quality/inspections', { params });
  return response.data.data;
};

export const fetchNCRs = async (siteId?: string): Promise<NCRRecord[]> => {
  const params = siteId && siteId !== 'ALL' ? { site_id: siteId } : {};
  const response = await apiClient.get<ApiResponse<NCRRecord[]>>('/quality/ncrs', { params });
  return response.data.data;
};

// Safety APIs
export const fetchSafetyInspections = async (siteId?: string): Promise<SafetyInspection[]> => {
  const params = siteId && siteId !== 'ALL' ? { site_id: siteId } : {};
  const response = await apiClient.get<ApiResponse<SafetyInspection[]>>('/safety/inspections', { params });
  return response.data.data;
};

export const fetchSafetyObservations = async (siteId?: string): Promise<SafetyObservation[]> => {
  const params = siteId && siteId !== 'ALL' ? { site_id: siteId } : {};
  const response = await apiClient.get<ApiResponse<SafetyObservation[]>>('/safety/observations', { params });
  return response.data.data;
};

export const fetchSafetyIncidents = async (siteId?: string): Promise<SafetyIncident[]> => {
  const params = siteId && siteId !== 'ALL' ? { site_id: siteId } : {};
  const response = await apiClient.get<ApiResponse<SafetyIncident[]>>('/safety/incidents', { params });
  return response.data.data;
};

// Corrective Action APIs
export const fetchCorrectiveActions = async (siteId?: string): Promise<CorrectiveActionItem[]> => {
  const params = siteId && siteId !== 'ALL' ? { site_id: siteId } : {};
  const response = await apiClient.get<ApiResponse<CorrectiveActionItem[]>>('/actions', { params });
  return response.data.data;
};

export const updateActionStatusApi = async (actionId: string, newStatus: string, notes?: string): Promise<CorrectiveActionItem> => {
  const response = await apiClient.put<ApiResponse<CorrectiveActionItem>>(`/actions/${actionId}/status`, {
    new_status: newStatus,
    notes,
  });
  return response.data.data;
};

// ==========================================
// 8-KRA Authoritative Rankings
// ==========================================

export interface KRADefinition {
  id: number;
  code: string;
  name: string;
  description: string;
  is_composite: boolean;
}

export interface RankingWeight {
  kra_id: number;
  weight_pct: number;
  kra?: KRADefinition;
}

export interface RankingMethodology {
  id: string;
  version_code: string;
  name: string;
  is_active: boolean;
  approved_at?: string;
  rationale?: string;
  weights: RankingWeight[];
}

export interface RankingScore {
  kra_id: number;
  raw_score?: number | null;
  weighted_score?: number | null;
  is_missing: boolean;
  details_json?: Record<string, any>;
}

export interface RankingSnapshot {
  id: string;
  site_id: string;
  site_name?: string;
  period_id: string;
  composite_score?: number | null;
  data_completeness_pct: number;
  is_stale: boolean;
  ranking_position?: number | null;
  status: 'OFFICIAL' | 'PROVISIONAL' | 'INSUFFICIENT_DATA';
  calculated_at: string;
  scores: RankingScore[];
}

export const fetchLeaderboard = async (periodId: string = '2026-W44'): Promise<RankingSnapshot[]> => {
  const response = await apiClient.get<RankingSnapshot[]>('/rankings/leaderboard', {
    params: { period_id: periodId }
  });
  return response.data;
};

export const calculateLeaderboard = async (periodId: string = '2026-W44', methodologyId?: string): Promise<RankingSnapshot[]> => {
  const response = await apiClient.post<RankingSnapshot[]>('/rankings/calculate', {
    period_id: periodId,
    methodology_id: methodologyId
  });
  return response.data;
};

export const fetchActiveMethodology = async (): Promise<RankingMethodology> => {
  const response = await apiClient.get<RankingMethodology>('/rankings/methodologies/active');
  return response.data;
};

export const fetchKRADefinitions = async (): Promise<KRADefinition[]> => {
  const response = await apiClient.get<KRADefinition[]>('/rankings/definitions');
  return response.data;
};

export const fetchSiteRankingBreakdown = async (siteId: string, periodId: string = '2026-W44'): Promise<RankingSnapshot> => {
  const response = await apiClient.get<RankingSnapshot>(`/rankings/sites/${siteId}/breakdown`, {
    params: { period_id: periodId }
  });
  return response.data;
};

// ==========================================
// Construction Weekly Insights & Governance
// ==========================================

export interface WeeklyInsightItem {
  id: string;
  category: 'CRITICAL_RISK' | 'MANAGEMENT_PRIORITY' | 'SCHEDULE_SLIPPAGE' | 'MATERIAL_BOTTLENECK' | 'REGULATORY_HOLD';
  title: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  owner_name?: string;
  target_date?: string;
  status: 'OPEN' | 'MITIGATING' | 'RESOLVED';
}

export interface WeeklyDepartmentalInput {
  id: string;
  department: 'SAFETY' | 'QUALITY' | 'PLANNING' | 'COMMERCIAL';
  author_id: string;
  author_name?: string;
  status: string;
  narrative: string;
  metrics_json?: Record<string, any>;
  submitted_at: string;
}

export interface WeeklyReportReview {
  id: string;
  reviewer_id: string;
  reviewer_name?: string;
  decision: 'FLAGGED' | 'VALIDATED';
  discrepancies_found?: string;
  action_items?: string;
  created_at: string;
}

export interface WeeklyReportVersion {
  id: string;
  version_number: number;
  created_by: string;
  creator_name?: string;
  change_summary?: string;
  created_at: string;
}

export interface WeeklyReportSummary {
  id: string;
  site_id: string;
  site_name?: string;
  week_code: string;
  start_date: string;
  end_date: string;
  status: 'DRAFT' | 'INPUTS_PENDING' | 'SUBMITTED' | 'FLAGGED' | 'RESUBMITTED' | 'VALIDATED' | 'PUBLISHED';
  current_version: number;
  site_manager_id: string;
  site_manager_name?: string;
  executive_summary?: string;
  published_at?: string;
  published_by_name?: string;
  created_at: string;
}

export interface WeeklyReportDetail extends WeeklyReportSummary {
  top_achievements?: string;
  critical_concerns?: string;
  corporate_assistance_needed?: string;
  departmental_inputs: WeeklyDepartmentalInput[];
  insight_items: WeeklyInsightItem[];
  reviews: WeeklyReportReview[];
  versions: WeeklyReportVersion[];
}

export const fetchWeeklyReports = async (siteId?: string, weekCode?: string, status?: string): Promise<WeeklyReportSummary[]> => {
  const params: Record<string, any> = {};
  if (siteId && siteId !== 'ALL') params.site_id = siteId;
  if (weekCode) params.week_code = weekCode;
  if (status) params.status = status;
  const response = await apiClient.get<WeeklyReportSummary[]>('/weekly-reports', { params });
  return response.data;
};

export const fetchWeeklyReportById = async (reportId: string): Promise<WeeklyReportDetail> => {
  const response = await apiClient.get<WeeklyReportDetail>(`/weekly-reports/${reportId}`);
  return response.data;
};

export const createWeeklyReportApi = async (data: any): Promise<WeeklyReportDetail> => {
  const response = await apiClient.post<WeeklyReportDetail>('/weekly-reports', data);
  return response.data;
};

export const updateWeeklyReportApi = async (reportId: string, data: any): Promise<WeeklyReportDetail> => {
  const response = await apiClient.put<WeeklyReportDetail>(`/weekly-reports/${reportId}`, data);
  return response.data;
};

export const submitDepartmentalInputApi = async (reportId: string, data: any): Promise<WeeklyDepartmentalInput> => {
  const response = await apiClient.post<WeeklyDepartmentalInput>(`/weekly-reports/${reportId}/departmental-input`, data);
  return response.data;
};

export const submitWeeklyReportApi = async (reportId: string): Promise<WeeklyReportDetail> => {
  const response = await apiClient.post<WeeklyReportDetail>(`/weekly-reports/${reportId}/submit`);
  return response.data;
};

export const reviewWeeklyReportApi = async (
  reportId: string, 
  data: { decision: string; discrepancies_found?: string; action_items?: string }
): Promise<WeeklyReportDetail> => {
  const response = await apiClient.post<WeeklyReportDetail>(`/weekly-reports/${reportId}/review`, data);
  return response.data;
};

export const publishWeeklyReportApi = async (reportId: string): Promise<WeeklyReportDetail> => {
  const response = await apiClient.post<WeeklyReportDetail>(`/weekly-reports/${reportId}/publish`);
  return response.data;
};

export const fetchWeeklyReportVersionsApi = async (reportId: string): Promise<WeeklyReportVersion[]> => {
  const response = await apiClient.get<WeeklyReportVersion[]>(`/weekly-reports/${reportId}/versions`);
  return response.data;
};

// ==========================================
// EVM & Excel Analytics Interfaces
// ==========================================

export interface SCurvePoint {
  period: string;
  pv: number;
  ev?: number | null;
  ac?: number | null;
}

export interface SiteEVMRecord {
  site_id: string;
  site_name: string;
  budget_at_completion: number;
  planned_value: number;
  earned_value: number;
  actual_cost: number;
  schedule_performance_index: number;
  cost_performance_index: number;
  schedule_variance: number;
  cost_variance: number;
  estimate_at_completion: number;
  variance_at_completion: number;
  progress_pct: number;
  health_status: 'EXCELLENT' | 'GOOD' | 'CRITICAL';
  s_curve_points: SCurvePoint[];
}

export interface PortfolioEVMResponse {
  portfolio_bac: number;
  portfolio_pv: number;
  portfolio_ev: number;
  portfolio_ac: number;
  portfolio_spi: number;
  portfolio_cpi: number;
  site_breakdown: SiteEVMRecord[];
}

export const fetchPortfolioEvm = async (): Promise<PortfolioEVMResponse> => {
  const response = await apiClient.get<PortfolioEVMResponse>('/analytics/evm/portfolio');
  return response.data;
};

export const fetchSiteEvm = async (siteId: string): Promise<SiteEVMRecord> => {
  const response = await apiClient.get<SiteEVMRecord>(`/analytics/evm/sites/${siteId}`);
  return response.data;
};

export const importExcelApi = async (file: File, siteId: string, dryRun: boolean): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('site_id', siteId);
  formData.append('dry_run', dryRun ? 'true' : 'false');
  const response = await apiClient.post('/analytics/excel/import', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};



