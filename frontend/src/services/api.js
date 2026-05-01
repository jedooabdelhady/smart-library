import axios from 'axios';

// In production (on Render), the backend serves the frontend, so use relative /api
// In development, use the env variable or default to localhost:5000/api
const API_BASE = process.env.REACT_APP_API_URL || (
  window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : '/api'
);

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds default timeout
});

// Instance with longer timeout for AI operations (multi-pass verification)
const aiApi = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 120000, // 120 seconds for AI multi-pass verification
});

// كتب
export const getBooks = () => api.get('/books');
export const getBook = (id) => api.get(`/books/${id}`);
export const getBookPages = (id) => api.get(`/books/${id}/pages`);
export const searchBooks = (query) => api.get(`/books/search?q=${query}`);
export const getCategories = () => api.get('/books/categories/all');

// رفع كتاب (مسؤول) — timeout 10 دقائق للملفات الكبيرة
export const uploadBook = (formData) =>
  api.post('/admin/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 600000, // 10 minutes for large file uploads
  });

export const deleteBook = (id) => api.delete(`/admin/books/${id}`);

// المحادثة الذكية
export const sendMessage = (message, bookId = null) =>
  aiApi.post('/chat', { message, bookId });

// تلخيص فصل
export const summarizeChapter = (bookId, chapter) =>
  aiApi.post('/chat/summarize', { bookId, chapter });

// مقارنة آراء
export const compareOpinions = (topic, bookIds) =>
  aiApi.post('/chat/compare', { topic, bookIds });

// إحصائيات المسؤول
export const getStats = () => api.get('/admin/stats');

export default api;
