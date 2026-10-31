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

export const loginApi = async (email: string, password: string): Promise<LoginResult> => {
  const response = await apiClient.post<ApiResponse<LoginResult>>('/auth/login', {
    email,
    password,
  });
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
