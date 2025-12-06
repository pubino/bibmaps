const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
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
    getReferences: (id) => request(`/nodes/${id}/references`)
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
  }
};
