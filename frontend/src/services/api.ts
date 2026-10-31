import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
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
