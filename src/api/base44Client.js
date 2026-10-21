// Talks to the Drivez server. Keeps the same shape as the old Base44 client
// (base44.auth.*, base44.entities.*) so the pages didn't need rewriting.

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  patch: (p, b = {}) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
};

function entity(name) {
  const base = `/entities/${name}`;
  return {
    list: (_sort, limit = 100) => api.get(`${base}?limit=${limit}`),
    create: (data) => api.post(base, data),
    update: (id, data) => api.patch(`${base}/${id}`, data),
    delete: (id) => api.del(`${base}/${id}`),
  };
}

export const base44 = {
  entities: { Vehicle: entity('Vehicle'), Trip: entity('Trip'), Route: entity('Route') },
  auth: {
    me: () => api.get('/auth/me'),
    updateMe: (data) => api.patch('/auth/me', data),
    loginViaEmailPassword: (email, password) => api.post('/auth/login', { email, password }),
    register: (data) => api.post('/auth/register', data),
    logout: (redirectTo) => api.post('/auth/logout').catch(() => {}).finally(() => { if (redirectTo) window.location.href = redirectTo; }),
    loginWithProvider: (provider, next = '/') => { window.location.href = `/api/auth/oauth/${provider}/start?next=${encodeURIComponent(next)}`; },
    resetPasswordRequest: (email) => api.post('/auth/forgot', { email }),
    resetPassword: ({ resetToken, newPassword }) => api.post('/auth/reset', { token: resetToken, password: newPassword }),
    redirectToLogin: () => { window.location.href = '/login'; },
  },
};
