const API_BASE = '/api';

// Store token in memory (will be lost on page refresh, but cookies persist)
let authToken = null;

function setAuthToken(token) {
  authToken = token;
}

function getAuthToken() {
  return authToken;
}

function clearAuthToken() {
  authToken = null;
}

async function request(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  // Add auth token if available
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers,
    credentials: 'include', // Include cookies for auth
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));

    // Handle 401 Unauthorized - clear token and redirect to login
    if (response.status === 401) {
      clearAuthToken();
    }

    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  // Health & User
  health: () => request('/health'),
  user: () => request('/user'),

  // Authentication
  auth: {
    register: async (data) => {
      const result = await request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
      return result;
    },
    login: async (username, password) => {
      const result = await request('/auth/login/json', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      if (result.access_token) {
        setAuthToken(result.access_token);
      }
      return result;
    },
    logout: async () => {
      clearAuthToken();
      return request('/auth/logout', { method: 'POST' });
    },
    me: () => request('/auth/me'),
    updateProfile: (data) => request('/auth/me', { method: 'PUT', body: JSON.stringify(data) }),
    changePassword: (currentPassword, newPassword) => request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    }),
    // Admin endpoints
    listUsers: (skip = 0, limit = 100, search = null) => {
      const params = new URLSearchParams({ skip, limit });
      if (search) params.append('search', search);
      return request(`/auth/users?${params}`);
    },
    createUser: (data) => request('/auth/users', { method: 'POST', body: JSON.stringify(data) }),
    getUser: (id) => request(`/auth/users/${id}`),
    updateUser: (id, data) => request(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteUser: (id) => request(`/auth/users/${id}`, { method: 'DELETE' }),
    resetPassword: (id, newPassword) => request(`/auth/users/${id}/reset-password?new_password=${encodeURIComponent(newPassword)}`, { method: 'POST' }),
    // Google OAuth
    googleEnabled: () => request('/auth/google/enabled'),
    googleLogin: () => {
      // Redirect to Google OAuth login endpoint
      window.location.href = `${API_BASE}/auth/google/login`;
    }
  },

  // BibMaps
  bibmaps: {
    list: () => request('/bibmaps/'),
    create: (data) => request('/bibmaps/', { method: 'POST', body: JSON.stringify(data) }),
    get: (id) => request(`/bibmaps/${id}`),
    getPublic: (id) => request(`/bibmaps/public/${id}`),
    update: (id, data) => request(`/bibmaps/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/bibmaps/${id}`, { method: 'DELETE' }),
    publish: (id) => request(`/bibmaps/${id}/publish`, { method: 'PUT' }),
    unpublish: (id) => request(`/bibmaps/${id}/unpublish`, { method: 'PUT' })
  },

  // Nodes
  nodes: {
    create: (data) => request('/nodes/', { method: 'POST', body: JSON.stringify(data) }),
    get: (id) => request(`/nodes/${id}`),
    update: (id, data) => request(`/nodes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/nodes/${id}`, { method: 'DELETE' }),
    updatePosition: (id, x, y) => request(`/nodes/${id}/position?x=${x}&y=${y}`, { method: 'PUT' }),
    updateSize: (id, width, height) => request(`/nodes/${id}/size?width=${width}&height=${height}`, { method: 'PUT' }),
    getReferences: (id) => request(`/nodes/${id}/references`),
    getMedia: (id) => request(`/nodes/${id}/media`)
  },

  // Connections
  connections: {
    create: (data) => request('/connections/', { method: 'POST', body: JSON.stringify(data) }),
    get: (id) => request(`/connections/${id}`),
    update: (id, data) => request(`/connections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/connections/${id}`, { method: 'DELETE' })
  },

  // Taxonomies
  taxonomies: {
    list: () => request('/taxonomies/'),
    create: (data) => request('/taxonomies/', { method: 'POST', body: JSON.stringify(data) }),
    get: (id) => request(`/taxonomies/${id}`),
    update: (id, data) => request(`/taxonomies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/taxonomies/${id}`, { method: 'DELETE' }),
    getReferences: (id) => request(`/taxonomies/${id}/references`),
    getNodes: (id) => request(`/taxonomies/${id}/nodes`)
  },

  // References
  references: {
    list: (taxonomyId = null) => {
      const params = taxonomyId ? `?taxonomy_id=${taxonomyId}` : '';
      return request(`/references/${params}`);
    },
    create: (data) => request('/references/', { method: 'POST', body: JSON.stringify(data) }),
    get: (id) => request(`/references/${id}`),
    update: (id, data) => request(`/references/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updateBibtex: (id, bibtexContent) => request(`/references/${id}/bibtex`, {
      method: 'PUT',
      body: JSON.stringify({ bibtex_content: bibtexContent })
    }),
    delete: (id) => request(`/references/${id}`, { method: 'DELETE' }),
    import: (bibtexContent, taxonomyIds = []) => request('/references/import', {
      method: 'POST',
      body: JSON.stringify({ bibtex_content: bibtexContent, taxonomy_ids: taxonomyIds })
    })
  },

  // Media
  media: {
    list: (taxonomyId = null) => {
      const params = taxonomyId ? `?taxonomy_id=${taxonomyId}` : '';
      return request(`/media/${params}`);
    },
    create: (data) => request('/media/', { method: 'POST', body: JSON.stringify(data) }),
    get: (id) => request(`/media/${id}`),
    update: (id, data) => request(`/media/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/media/${id}`, { method: 'DELETE' })
  },

  // Settings
  settings: {
    get: () => request('/settings'),
    update: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
    reset: () => request('/settings/reset', { method: 'POST' })
  }
};
