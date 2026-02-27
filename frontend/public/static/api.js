/* ══════════════════════════════════════════════════════════
   AI Financial Co-Pilot – API Service Layer
   Handles all communication with the FastAPI backend
   ══════════════════════════════════════════════════════════ */

// Auto-detect API base: localhost → dev backend, otherwise → Railway production URL
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : 'https://financial-copilot-production.up.railway.app';

const SUPABASE_URL = 'https://zgvrxemqivsojaqkukwu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpndnJ4ZW1xaXZzb2phcWt1a3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNzk5MTAsImV4cCI6MjA4Nzc1NTkxMH0.7Xl2Wghmtyn-v5_y-JM78SgGrwS-jpCReavd0kTFhnc';

// ─── Supabase Auth Client (lightweight) ────────────────────

class SupabaseAuth {
  constructor(url, key) {
    this.url = url;
    this.key = key;
    this.session = null;
    this.user = null;
    this._listeners = [];
  }

  async initialize() {
    // Check for existing session in localStorage
    const stored = localStorage.getItem('sb-session');
    if (stored) {
      try {
        const session = JSON.parse(stored);
        // Verify token is not expired
        if (session.expires_at && session.expires_at * 1000 > Date.now()) {
          this.session = session;
          this.user = session.user;
          this._notify('SIGNED_IN');
          // Try to refresh the session
          await this._refreshSession(session.refresh_token);
          return;
        }
        // Token expired, try refresh
        if (session.refresh_token) {
          await this._refreshSession(session.refresh_token);
          return;
        }
      } catch (e) {
        console.error('Failed to restore session:', e);
      }
    }

    // Check URL for OAuth callback tokens
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      await this._handleOAuthCallback(hash);
      return;
    }

    this._notify('SIGNED_OUT');
  }

  async _handleOAuthCallback(hash) {
    const params = new URLSearchParams(hash.substring(1));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    const expires_in = parseInt(params.get('expires_in') || '3600');

    if (access_token) {
      // Get user info
      const userResp = await fetch(`${this.url}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'apikey': this.key,
        }
      });

      if (userResp.ok) {
        const user = await userResp.json();
        this.session = {
          access_token,
          refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + expires_in,
          user,
        };
        this.user = user;
        localStorage.setItem('sb-session', JSON.stringify(this.session));
        // Clean URL
        window.history.replaceState(null, '', window.location.pathname);
        this._notify('SIGNED_IN');
        return;
      }
    }
    this._notify('SIGNED_OUT');
  }

  async _refreshSession(refreshToken) {
    try {
      const resp = await fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.key,
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (resp.ok) {
        const data = await resp.json();
        this.session = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
          user: data.user,
        };
        this.user = data.user;
        localStorage.setItem('sb-session', JSON.stringify(this.session));
        this._notify('SIGNED_IN');
      } else {
        this._signOut();
      }
    } catch (e) {
      console.error('Token refresh failed:', e);
      this._signOut();
    }
  }

  async signInWithOAuth(provider) {
    const redirectTo = window.location.origin + '/';
    const url = `${this.url}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}`;
    window.location.href = url;
  }

  async signOut() {
    if (this.session?.access_token) {
      try {
        await fetch(`${this.url}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'apikey': this.key,
          },
        });
      } catch (e) {
        console.error('Logout error:', e);
      }
    }
    this._signOut();
  }

  _signOut() {
    this.session = null;
    this.user = null;
    localStorage.removeItem('sb-session');
    this._notify('SIGNED_OUT');
  }

  getAccessToken() {
    return this.session?.access_token || null;
  }

  getUser() {
    return this.user;
  }

  onAuthStateChange(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(l => l !== callback);
    };
  }

  _notify(event) {
    this._listeners.forEach(cb => cb(event, this.session));
  }
}

// ─── API Client ───────────────────────────────────────────────

class ApiClient {
  constructor(auth) {
    this.auth = auth;
    this.currentBusinessId = null;
  }

  async _fetch(path, options = {}) {
    const token = this.auth.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const url = `${API_BASE}${path}`;
    const resp = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      throw new Error(errBody.detail || `API error: ${resp.status}`);
    }

    return resp.json();
  }

  // ── Businesses ──
  async listBusinesses() {
    return this._fetch('/api/businesses');
  }

  async createBusiness(name) {
    return this._fetch('/api/businesses', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  // ── Transactions ──
  async listTransactions(businessId) {
    return this._fetch(`/api/transactions?business_id=${businessId}`);
  }

  async createTransaction(data) {
    return this._fetch('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async uploadCSVText(businessId, csvText) {
    return this._fetch('/api/transactions/process-csv-text', {
      method: 'POST',
      body: JSON.stringify({
        business_id: businessId,
        csv_text: csvText,
      }),
    });
  }

  async deleteTransaction(transactionId) {
    return this._fetch(`/api/transactions/${transactionId}`, {
      method: 'DELETE',
    });
  }

  // ── Analytics ──
  async getDashboard(businessId) {
    return this._fetch(`/api/analytics/dashboard/${businessId}`);
  }

  async getSummary(businessId) {
    return this._fetch(`/api/analytics/summary/${businessId}`);
  }

  async getInsights(businessId) {
    return this._fetch(`/api/analytics/insights/${businessId}`);
  }

  // ── Chat ──
  async sendChat(businessId, message, history = []) {
    return this._fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        business_id: businessId,
        message,
        history,
      }),
    });
  }
}

// ─── Initialize ───────────────────────────────────────────────

const supabaseAuth = new SupabaseAuth(SUPABASE_URL, SUPABASE_ANON_KEY);
const apiClient = new ApiClient(supabaseAuth);

// Export globally
window.supabaseAuth = supabaseAuth;
window.apiClient = apiClient;
window.API_BASE = API_BASE;
