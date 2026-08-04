import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Automatically retry network errors or 502/504 Bad Gateway (backend starting up)
    if (!error.response || error.response.status === 502 || error.response.status === 504) {
      const config = error.config;
      config.__retryCount = config.__retryCount || 0;
      
      // Retry up to 5 times, waiting 1 second between each try
      if (config.__retryCount < 5) {
        config.__retryCount += 1;
        await new Promise(resolve => setTimeout(resolve, 1000));
        return api(config);
      }
    }

    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
