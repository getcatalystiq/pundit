/**
 * API client with automatic authentication
 */

import { getAccessToken, logout } from '../auth/oauth';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface ApiError {
  error: string;
  status: number;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const token = await getAccessToken();

    if (!token) {
      logout();
      throw new Error('Not authenticated');
    }

    const headers: HeadersInit = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401) {
      logout();
      throw new Error('Session expired');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error: ApiError = {
        error: errorData.error || 'Request failed',
        status: response.status,
      };
      throw error;
    }

    return response.json();
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}

export const api = new ApiClient(API_BASE);

// Database types
export interface Database {
  id: string;
  name: string;
  db_type: string;
  is_default: boolean;
  enabled: boolean;
  created_at: string;
  updated_at?: string;
  training_data?: {
    ddl_count: number;
    documentation_count: number;
    examples_count: number;
  };
}

export interface CreateDatabaseRequest {
  name: string;
  db_type: string;
  connection_config?: Record<string, unknown>;
  credentials_secret_arn?: string;
  is_default?: boolean;
}

// Training data types
export interface DDLEntry {
  id: string;
  ddl: string;
  created_at: string;
}

export interface DocEntry {
  id: string;
  documentation: string;
  created_at: string;
}

export interface ExampleEntry {
  id: string;
  question: string;
  sql: string;
  created_at: string;
}

// User types
export interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  scopes: string[];
  is_active: boolean;
  created_at: string;
  last_login_at?: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  name?: string;
  role?: string;
  scopes?: string[];
}

// API functions

// Databases
export const databases = {
  list: () => api.get<{ databases: Database[] }>('/admin/databases'),
  get: (id: string) => api.get<Database>(`/admin/databases/${id}`),
  create: (data: CreateDatabaseRequest) => api.post<Database>('/admin/databases', data),
  update: (id: string, data: Partial<CreateDatabaseRequest>) =>
    api.put<Database>(`/admin/databases/${id}`, data),
  delete: (id: string) => api.delete<{ deleted: boolean }>(`/admin/databases/${id}`),
};

// DDL
export const ddl = {
  list: (databaseId: string) =>
    api.get<{ ddl: DDLEntry[] }>(`/admin/databases/${databaseId}/ddl`),
  add: (databaseId: string, content: string) =>
    api.post<{ id: string }>(`/admin/databases/${databaseId}/ddl`, { ddl: content }),
  delete: (databaseId: string, id: string) =>
    api.delete<{ deleted: boolean }>(`/admin/databases/${databaseId}/ddl/${id}`),
};

// Documentation
export const docs = {
  list: (databaseId: string) =>
    api.get<{ documentation: DocEntry[] }>(`/admin/databases/${databaseId}/docs`),
  add: (databaseId: string, content: string) =>
    api.post<{ id: string }>(`/admin/databases/${databaseId}/docs`, { documentation: content }),
  delete: (databaseId: string, id: string) =>
    api.delete<{ deleted: boolean }>(`/admin/databases/${databaseId}/docs/${id}`),
};

// Examples
export const examples = {
  list: (databaseId: string) =>
    api.get<{ examples: ExampleEntry[] }>(`/admin/databases/${databaseId}/examples`),
  add: (databaseId: string, question: string, sql: string) =>
    api.post<{ id: string }>(`/admin/databases/${databaseId}/examples`, { question, sql }),
  delete: (databaseId: string, id: string) =>
    api.delete<{ deleted: boolean }>(`/admin/databases/${databaseId}/examples/${id}`),
};

// Users
export const users = {
  list: () => api.get<{ users: User[] }>('/admin/users'),
  create: (data: CreateUserRequest) => api.post<User>('/admin/users', data),
  update: (id: string, data: Partial<CreateUserRequest & { is_active: boolean }>) =>
    api.put<User>(`/admin/users/${id}`, data),
  delete: (id: string) => api.delete<{ deleted: boolean }>(`/admin/users/${id}`),
};

// AI Generation types
export interface PullDDLResponse {
  ddl: string;
  tables: string[];
  schema: string;
  saved: boolean;
}

export interface GenerateDocsResponse {
  documentation: string;
  saved: boolean;
  id?: string;
}

export interface GeneratedExample {
  question: string;
  sql: string;
}

export interface GenerateExamplesResponse {
  examples: GeneratedExample[];
  saved: boolean;
  saved_ids?: string[];
}

export interface SchemaAnalysis {
  tables: string[];
  total_columns: number;
  relationships: Array<{
    from_table: string;
    to_table: string;
    type: string;
  }>;
  indexes_suggested: Array<{
    table: string;
    columns: string[];
    reason: string;
  }>;
  documentation_suggestions: string[];
  query_patterns: string[];
}

export interface AnalyzeResponse {
  analysis: SchemaAnalysis;
  documentation_suggestions: string[];
}

// AI Generation
export const ai = {
  pullDDL: (databaseId: string, options?: { schema?: string; tables?: string[]; auto_save?: boolean }) =>
    api.post<PullDDLResponse>(`/admin/databases/${databaseId}/ai/pull-ddl`, options || {}),

  generateDocs: (databaseId: string, options?: { table_name?: string; auto_save?: boolean }) =>
    api.post<GenerateDocsResponse>(`/admin/databases/${databaseId}/ai/generate-docs`, options || {}),

  generateExamples: (databaseId: string, options?: { count?: number; context?: string; auto_save?: boolean }) =>
    api.post<GenerateExamplesResponse>(`/admin/databases/${databaseId}/ai/generate-examples`, options || {}),

  analyze: (databaseId: string) =>
    api.post<AnalyzeResponse>(`/admin/databases/${databaseId}/ai/analyze`, {}),
};
