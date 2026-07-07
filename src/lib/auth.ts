// Google Identity Services (GIS) wrapper for client-side OAuth 2.0

const CLIENT_ID_KEY = 'jhatpat_google_client_id';
const ACCESS_TOKEN_KEY = 'jhatpat_google_access_token';
const EXPIRY_KEY = 'jhatpat_google_token_expiry';

// Default Client ID if user wants to use a pre-configured one, 
// otherwise they can configure their own in the UI.
const DEFAULT_CLIENT_ID = ''; 

export function getGoogleClientId(): string {
  return localStorage.getItem(CLIENT_ID_KEY) || DEFAULT_CLIENT_ID;
}

export function setGoogleClientId(id: string): void {
  if (id) {
    localStorage.setItem(CLIENT_ID_KEY, id.trim());
  } else {
    localStorage.removeItem(CLIENT_ID_KEY);
  }
}

export function getAccessToken(): string | null {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  const expiry = localStorage.getItem(EXPIRY_KEY);
  
  if (!token || !expiry) return null;
  
  // If token is expired (or close to expiring, e.g., within 2 minutes), return null
  const now = Date.now();
  if (now > parseInt(expiry, 10) - 120 * 1000) {
    clearAuth();
    return null;
  }
  
  return token;
}

export function isAuthorized(): boolean {
  return getAccessToken() !== null;
}

export function clearAuth(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

export function logout(): void {
  clearAuth();
}

declare global {
  interface Window {
    google?: any;
  }
}

export function initiateAuth(
  onSuccess: (token: string) => void,
  onError?: (error: any) => void
): void {
  const clientId = getGoogleClientId();
  if (!clientId) {
    if (onError) onError(new Error('No Google Client ID configured. Please configure one in Settings.'));
    return;
  }

  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    if (onError) onError(new Error('Google Identity Services SDK not loaded yet. Check your internet connection.'));
    return;
  }

  try {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/tasks',
      callback: (response: any) => {
        if (response.error) {
          if (onError) onError(response);
          return;
        }
        
        if (response.access_token) {
          const expiryTime = Date.now() + parseInt(response.expires_in, 10) * 1000;
          localStorage.setItem(ACCESS_TOKEN_KEY, response.access_token);
          localStorage.setItem(EXPIRY_KEY, expiryTime.toString());
          onSuccess(response.access_token);
        }
      },
    });

    // Request access token with a popup window
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } catch (err) {
    if (onError) onError(err);
  }
}
