import axios from 'axios';

let BASE_URL = import.meta.env.VITE_API_URL || '/api';
// HTTPS pages cannot call http:// APIs (mixed content). Auto-upgrade in production.
if (typeof window !== 'undefined' && window.location.protocol === 'https:' && BASE_URL.startsWith('http://')) {
  BASE_URL = BASE_URL.replace(/^http:\/\//, 'https://');
}

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tss_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/')) {
      localStorage.removeItem('tss_token');
      localStorage.removeItem('tss_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  requestOtp: (email) => api.post('/auth/request-otp', { email }),
  verifyOtp: (email, otp) => api.post('/auth/verify-otp', { email, otp }),
};

export const storesApi = {
  getAll: () => api.get('/stores'),
  getOne: (id) => api.get(`/stores/${id}`),
  bulkUpload: (stores) => api.post('/stores/bulk', { stores }),
  create: (data) => api.post('/stores', data),
  update: (id, data) => api.put(`/stores/${id}`, data),
  delete: (id) => api.delete(`/stores/${id}`)
};

export const pincodesApi = {
  getNearby: (storeId, range, { refresh = false, cacheOnly = false, signal } = {}) =>
    api.get('/pincodes/nearby', {
      params: {
        store_id: storeId,
        range,
        ...(refresh && { refresh: '1' }),
        ...(cacheOnly && { cache_only: '1' }),
      },
      signal,
      timeout: 90000,
    }),
};
