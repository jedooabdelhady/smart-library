import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// كتب
export const getBooks = () => api.get('/books');
export const getBook = (id) => api.get(`/books/${id}`);
export const getBookPages = (id) => api.get(`/books/${id}/pages`);
export const searchBooks = (query) => api.get(`/books/search?q=${query}`);
export const getCategories = () => api.get('/categories');

// رفع كتاب (مسؤول)
export const uploadBook = (formData) =>
  api.post('/admin/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const deleteBook = (id) => api.delete(`/admin/books/${id}`);

// المحادثة الذكية
export const sendMessage = (message, bookId = null) =>
  api.post('/chat', { message, bookId });

// تلخيص فصل
export const summarizeChapter = (bookId, chapter) =>
  api.post('/chat/summarize', { bookId, chapter });

// مقارنة آراء
export const compareOpinions = (topic, bookIds) =>
  api.post('/chat/compare', { topic, bookIds });

// إحصائيات المسؤول
export const getStats = () => api.get('/admin/stats');

export default api;
