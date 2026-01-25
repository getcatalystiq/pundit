/**
 * OAuth 2.1 with PKCE implementation for Pundit Admin UI
 */

// Get API base URL from environment or default
const API_BASE = import.meta.env.VITE_API_URL || '';

// OAuth endpoints
const OAUTH_METADATA_URL = `${API_BASE}/.well-known/oauth-authorization-server`;

interface OAuthMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  userinfo_endpoint: string;
  scopes_supported: string[];
  response_types_supported: string[];
  code_challenge_methods_supported: string[];
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

interface UserInfo {
  sub: string;
  email: string;
  name?: string;
  tenant_id: string;
  role: string;
  scopes: string[];
}

// Storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'pundit_access_token',
  REFRESH_TOKEN: 'pundit_refresh_token',
  TOKEN_EXPIRY: 'pundit_token_expiry',
  CODE_VERIFIER: 'pundit_code_verifier',
  CLIENT_ID: 'pundit_client_id',
  CLIENT_SECRET: 'pundit_client_secret',
  USER_INFO: 'pundit_user_info',
};

/**
 * Generate a random string for PKCE
 */
function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => charset[byte % charset.length]).join('');
}

/**
 * Generate PKCE code verifier
 */
export function generateCodeVerifier(): string {
  return generateRandomString(64);
}

/**
 * Generate PKCE code challenge from verifier
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Fetch OAuth metadata
 */
export async function fetchOAuthMetadata(): Promise<OAuthMetadata> {
  const response = await fetch(OAUTH_METADATA_URL);
  if (!response.ok) {
    throw new Error('Failed to fetch OAuth metadata');
  }
  return response.json();
}

/**
 * Register as OAuth client (Dynamic Client Registration)
 */
export async function registerClient(): Promise<{ client_id: string; client_secret: string }> {
  const metadata = await fetchOAuthMetadata();

  const response = await fetch(metadata.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Pundit Admin UI',
      redirect_uris: [window.location.origin + '/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to register OAuth client');
  }

  const data = await response.json();

  // Store client credentials
  localStorage.setItem(STORAGE_KEYS.CLIENT_ID, data.client_id);
  localStorage.setItem(STORAGE_KEYS.CLIENT_SECRET, data.client_secret);

  return { client_id: data.client_id, client_secret: data.client_secret };
}

/**
 * Get or register client credentials
 */
async function getClientCredentials(): Promise<{ client_id: string; client_secret: string }> {
  const clientId = localStorage.getItem(STORAGE_KEYS.CLIENT_ID);
  const clientSecret = localStorage.getItem(STORAGE_KEYS.CLIENT_SECRET);

  if (clientId && clientSecret) {
    return { client_id: clientId, client_secret: clientSecret };
  }

  return registerClient();
}

/**
 * Start OAuth authorization flow
 */
export async function startAuthFlow(): Promise<void> {
  const metadata = await fetchOAuthMetadata();
  const { client_id } = await getClientCredentials();

  // Generate and store PKCE verifier
  const codeVerifier = generateCodeVerifier();
  sessionStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier);

  // Generate code challenge
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Build authorization URL
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client_id,
    redirect_uri: window.location.origin + '/callback',
    scope: 'read write admin',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: generateRandomString(16),
  });

  // Store state for validation
  sessionStorage.setItem('oauth_state', params.get('state')!);

  // Redirect to authorization endpoint
  window.location.href = `${metadata.authorization_endpoint}?${params}`;
}

/**
 * Handle OAuth callback
 */
export async function handleCallback(): Promise<UserInfo> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (error) {
    throw new Error(params.get('error_description') || error);
  }

  if (!code) {
    throw new Error('No authorization code received');
  }

  // Validate state
  const savedState = sessionStorage.getItem('oauth_state');
  if (state !== savedState) {
    throw new Error('Invalid state parameter');
  }

  // Get code verifier
  const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.CODE_VERIFIER);
  if (!codeVerifier) {
    throw new Error('No code verifier found');
  }

  // Exchange code for tokens
  const metadata = await fetchOAuthMetadata();
  const { client_id, client_secret } = await getClientCredentials();

  const response = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${client_id}:${client_secret}`),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: window.location.origin + '/callback',
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error_description || 'Token exchange failed');
  }

  const tokens: TokenResponse = await response.json();

  // Store tokens
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.access_token);
  if (tokens.refresh_token) {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refresh_token);
  }
  localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, String(Date.now() + tokens.expires_in * 1000));

  // Clean up session storage
  sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
  sessionStorage.removeItem('oauth_state');

  // Fetch user info
  const userInfo = await fetchUserInfo();

  return userInfo;
}

/**
 * Fetch user info from OAuth server
 */
export async function fetchUserInfo(): Promise<UserInfo> {
  const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  if (!accessToken) {
    throw new Error('No access token');
  }

  const metadata = await fetchOAuthMetadata();

  const response = await fetch(metadata.userinfo_endpoint, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }

  const userInfo: UserInfo = await response.json();
  localStorage.setItem(STORAGE_KEYS.USER_INFO, JSON.stringify(userInfo));

  return userInfo;
}

/**
 * Refresh access token
 */
export async function refreshToken(): Promise<string> {
  const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  if (!refreshToken) {
    throw new Error('No refresh token');
  }

  const metadata = await fetchOAuthMetadata();
  const { client_id, client_secret } = await getClientCredentials();

  const response = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${client_id}:${client_secret}`),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    // Refresh failed, clear tokens and redirect to login
    logout();
    throw new Error('Session expired');
  }

  const tokens: TokenResponse = await response.json();

  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.access_token);
  if (tokens.refresh_token) {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refresh_token);
  }
  localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, String(Date.now() + tokens.expires_in * 1000));

  return tokens.access_token;
}

/**
 * Get current access token, refreshing if needed
 */
export async function getAccessToken(): Promise<string | null> {
  const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const expiry = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);

  if (!accessToken) {
    return null;
  }

  // Check if token is expired or about to expire (5 min buffer)
  if (expiry && Date.now() > parseInt(expiry) - 5 * 60 * 1000) {
    try {
      return await refreshToken();
    } catch {
      return null;
    }
  }

  return accessToken;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

/**
 * Get stored user info
 */
export function getStoredUserInfo(): UserInfo | null {
  const stored = localStorage.getItem(STORAGE_KEYS.USER_INFO);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Logout and clear all stored data
 */
export function logout(): void {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
  localStorage.removeItem(STORAGE_KEYS.USER_INFO);
  sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
  sessionStorage.removeItem('oauth_state');
}
