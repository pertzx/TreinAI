import axios from "axios";

const api = axios.create({
  baseURL: 'http://localhost:4000', // para Vite
  timeout: 10000, // 10 segundos timeout
  withCredentials: true, // Para cookies de sessão se necessário
});

// Interceptor para adicionar token automaticamente
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para tratar respostas de erro
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Se token expirou, redirecionar para login
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    
    // Log de erros de segurança
    if (error.response?.status === 429) {
      console.warn('Rate limit atingido:', error.response.data);
    }
    
    return Promise.reject(error);
  }
);

export default api;
