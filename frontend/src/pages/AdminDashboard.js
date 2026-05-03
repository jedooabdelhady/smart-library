import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiUpload, FiBook, FiTrash2, FiDatabase, FiCpu, FiCheckCircle, FiAlertCircle, FiLoader, FiRefreshCw } from 'react-icons/fi';
import { uploadBook, deleteBook, getBooks, getStats } from '../services/api';

const AdminDashboard = () => {
  const [books, setBooks] = useState([]);
  const [stats, setStats] = useState({ totalBooks: 0, totalPages: 0, totalChunks: 0, indexedBooks: 0 });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState(null); // 'success' | { error: string }
  const [dragActive, setDragActive] = useState(false);

  // Form state
  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookCategory, setBookCategory] = useState('quran');
  const [bookFile, setBookFile] = useState(null);

  const categories = [
    { id: 'quran', name: 'علوم القرآن' },
    { id: 'hadith', name: 'الحديث الشريف' },
    { id: 'fiqh', name: 'الفقه الإسلامي' },
    { id: 'aqeedah', name: 'العقيدة' },
    { id: 'seerah', name: 'السيرة النبوية' },
    { id: 'tafsir', name: 'التفسير' },
    { id: 'history', name: 'التاريخ الإسلامي' },
    { id: 'arabic', name: 'اللغة العربية' },
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [booksRes, statsRes] = await Promise.all([getBooks(), getStats()]);
      setBooks(booksRes.data);
      setStats(statsRes.data);
    } catch (err) {
      // Demo data
      setBooks([
        { id: 1, title: 'صحيح البخاري', author: 'الإمام البخاري', category: 'hadith', pages_count: 450, indexed: true },
        { id: 2, title: 'تفسير ابن كثير', author: 'ابن كثير', category: 'tafsir', pages_count: 820, indexed: true },
        { id: 3, title: 'فقه السنة', author: 'سيد سابق', category: 'fiqh', pages_count: 340, indexed: false },
      ]);
      setStats({ totalBooks: 3, totalPages: 1610, totalChunks: 4830, indexedBooks: 2 });
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!bookFile || !bookTitle) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus(null);

    const formData = new FormData();
    formData.append('file', bookFile);
    formData.append('title', bookTitle);
    formData.append('author', bookAuthor);
    formData.append('category', bookCategory);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 500);

    try {
      await uploadBook(formData);
      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadStatus('success');
      setBookTitle('');
      setBookAuthor('');
      setBookFile(null);
      loadData();
    } catch (err) {
      clearInterval(progressInterval);
      setUploadProgress(0);
      const errorMessage = err.response?.data?.error || err.message || 'حدث خطأ غير معروف';
      setUploadStatus({ error: errorMessage });
      console.error('Upload error:', errorMessage);
    } finally {
      setUploading(false);
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  const handleDelete = async (bookId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الكتاب؟')) return;
    try {
      await deleteBook(bookId);
      await loadData();
      alert('تم حذف الكتاب بنجاح');
    } catch (err) {
      console.error('Delete error:', err);
      alert('حدث خطأ أثناء محاولة حذف الكتاب');
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      setBookFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-cream">
      {/* Header */}
      <div className="px-8 py-6 bg-white border-b border-beige-dark">
        <h1 className="text-2xl font-bold text-navy" style={{ fontFamily: "'Amiri', serif" }}>
          لوحة تحكم المسؤول
        </h1>
        <p className="text-navy/40 text-sm mt-1">إدارة الكتب وفهرسة المحتوى</p>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'إجمالي الكتب', value: stats.totalBooks, icon: <FiBook />, color: '#1a1a4e' },
            { label: 'إجمالي الصفحات', value: stats.totalPages, icon: <FiBook />, color: '#2d2d7a' },
            { label: 'أجزاء مفهرسة', value: stats.totalChunks, icon: <FiDatabase />, color: '#c9a84c' },
            { label: 'كتب مفهرسة', value: stats.indexedBooks, icon: <FiCpu />, color: '#4e8a1a' },
          ].map((stat, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white rounded-xl p-5 border border-beige-dark"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                  style={{ backgroundColor: stat.color }}>
                  {stat.icon}
                </div>
              </div>
              <p className="text-2xl font-bold text-navy">{stat.value}</p>
              <p className="text-navy/40 text-xs mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upload Form */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-2xl border border-beige-dark p-6"
          >
            <h2 className="text-lg font-bold text-navy mb-4 flex items-center gap-2">
              <FiUpload className="text-gold" />
              رفع كتاب جديد
            </h2>

            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-navy/60 text-sm mb-1">عنوان الكتاب *</label>
                <input
                  type="text"
                  value={bookTitle}
                  onChange={(e) => setBookTitle(e.target.value)}
                  placeholder="أدخل عنوان الكتاب"
                  className="w-full px-4 py-3 bg-beige/30 border border-beige-dark rounded-xl text-sm text-navy placeholder-navy/30 focus:outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/10"
                  required
                />
              </div>

              <div>
                <label className="block text-navy/60 text-sm mb-1">المؤلف</label>
                <input
                  type="text"
                  value={bookAuthor}
                  onChange={(e) => setBookAuthor(e.target.value)}
                  placeholder="اسم المؤلف"
                  className="w-full px-4 py-3 bg-beige/30 border border-beige-dark rounded-xl text-sm text-navy placeholder-navy/30 focus:outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/10"
                />
              </div>

              <div>
                <label className="block text-navy/60 text-sm mb-1">التصنيف</label>
                <select
                  value={bookCategory}
                  onChange={(e) => setBookCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-beige/30 border border-beige-dark rounded-xl text-sm text-navy focus:outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/10"
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {/* File Drop Zone */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                  dragActive ? 'border-gold bg-gold/5' : 'border-beige-dark hover:border-gold/40'
                }`}
                onClick={() => document.getElementById('fileInput').click()}
              >
                <input
                  id="fileInput"
                  type="file"
                  accept=".pdf,.doc,.docx,.epub"
                  onChange={(e) => setBookFile(e.target.files[0])}
                  className="hidden"
                />
                {bookFile ? (
                  <div>
                    <FiCheckCircle className="mx-auto mb-2 text-green-500" size={32} />
                    <p className="text-navy font-medium text-sm">{bookFile.name}</p>
                    <p className="text-navy/40 text-xs mt-1">
                      {(bookFile.size / 1024 / 1024).toFixed(2)} ميجابايت
                    </p>
                  </div>
                ) : (
                  <div>
                    <FiUpload className="mx-auto mb-2 text-navy/30" size={32} />
                    <p className="text-navy/40 text-sm">اسحب الملف هنا أو انقر للاختيار</p>
                    <p className="text-navy/20 text-xs mt-1">PDF, DOC, DOCX, EPUB</p>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              {uploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-navy/60">
                    <span className="flex items-center gap-1">
                      <FiLoader className="animate-spin" size={12} />
                      جاري المعالجة...
                    </span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-beige-dark rounded-full h-2">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-l from-gold to-gold-light"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <div className="text-xs text-navy/40 space-y-1">
                    <p>{uploadProgress < 30 ? '📄 استخراج النص...' : ''}</p>
                    <p>{uploadProgress >= 30 && uploadProgress < 60 ? '🔍 OCR للصفحات الممسوحة...' : ''}</p>
                    <p>{uploadProgress >= 60 && uploadProgress < 80 ? '✂️ تقسيم النص الذكي...' : ''}</p>
                    <p>{uploadProgress >= 80 ? '🧠 فهرسة في قاعدة المتجهات...' : ''}</p>
                  </div>
                </div>
              )}

              {/* Status Messages */}
              {uploadStatus === 'success' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-3 rounded-xl text-sm"
                >
                  <FiCheckCircle />
                  تم رفع الكتاب وفهرسته بنجاح!
                </motion.div>
              )}

              {uploadStatus && uploadStatus.error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-xl text-sm leading-relaxed"
                >
                  <FiAlertCircle className="flex-shrink-0" />
                  <span>{uploadStatus.error}</span>
                </motion.div>
              )}

              <button
                type="submit"
                disabled={!bookFile || !bookTitle || uploading}
                className="w-full py-3 rounded-xl font-bold text-sm btn-luxury disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {uploading ? 'جاري المعالجة...' : 'رفع وفهرسة الكتاب'}
              </button>
            </form>
          </motion.div>

          {/* Books List */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-2xl border border-beige-dark p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-navy flex items-center gap-2">
                <FiBook className="text-gold" />
                الكتب المرفوعة ({books.length})
              </h2>
              <button
                onClick={loadData}
                className="text-navy/30 hover:text-navy transition-colors p-2"
              >
                <FiRefreshCw size={16} />
              </button>
            </div>

            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {books.map((book) => (
                <div
                  key={book.id}
                  className="flex items-center justify-between p-4 bg-beige/20 rounded-xl border border-beige-dark hover:border-gold/20 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-navy text-sm">{book.title}</h3>
                      {book.indexed ? (
                        <span className="text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full">مفهرس</span>
                      ) : (
                        <span className="text-[10px] bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded-full">قيد الفهرسة</span>
                      )}
                    </div>
                    <p className="text-navy/40 text-xs mt-1">{book.author} — {book.pages_count} صفحة</p>
                    <p className="text-navy/30 text-xs">{categories.find(c => c.id === book.category)?.name || 'عام'}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(book.id)}
                    className="p-2 text-red-400/50 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <FiTrash2 size={16} />
                  </button>
                </div>
              ))}

              {books.length === 0 && (
                <div className="text-center py-12 text-navy/30">
                  <FiBook className="mx-auto mb-3" size={32} />
                  <p className="text-sm">لم يتم رفع أي كتب بعد</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
