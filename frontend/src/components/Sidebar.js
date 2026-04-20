import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiSearch, FiBook, FiGrid, FiLogOut, FiChevronDown,
  FiHome, FiSettings, FiMessageSquare, FiX, FiUpload,
  FiCheckCircle, FiAlertCircle, FiLoader, FiPlus,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { uploadBook } from '../services/api';

// ─── مكوّن رفع الكتاب ───────────────────────────────────
const UploadModal = ({ onClose, onSuccess }) => {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('fiqh');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState(null); // null | 'success' | 'error'
  const [message, setMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const categories = [
    { slug: 'fiqh',    name: 'الفقه الإسلامي' },
    { slug: 'hadith',  name: 'الحديث الشريف' },
    { slug: 'quran',   name: 'علوم القرآن' },
    { slug: 'tafsir',  name: 'التفسير' },
    { slug: 'aqeedah', name: 'العقيدة' },
    { slug: 'seerah',  name: 'السيرة النبوية' },
    { slug: 'history', name: 'التاريخ الإسلامي' },
    { slug: 'arabic',  name: 'اللغة العربية' },
  ];

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    // تعبئة الاسم تلقائياً من اسم الملف
    if (!title) {
      const name = f.name.replace(/\.(epub|pdf|docx?)$/i, '').replace(/[-_]/g, ' ').trim();
      setTitle(name);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    setUploading(true);
    setStatus(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title.trim());
    formData.append('author', author.trim() || 'غير محدد');
    formData.append('category', category);
    formData.append('description', description.trim());

    try {
      const res = await uploadBook(formData);
      setStatus('success');
      setMessage(`تم رفع "${title}" بنجاح! (${res.data.book?.pagesCount || '?'} صفحة)`);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 2500);
    } catch (err) {
      setStatus('error');
      setMessage(err.response?.data?.error || 'حدث خطأ أثناء رفع الكتاب');
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'linear-gradient(180deg, #0f0f33, #1a1a4e)', border: '1px solid rgba(201,168,76,0.3)' }}
      >
        {/* رأس النافذة */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gold/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #c9a84c, #e8d48b)' }}>
              <FiUpload className="text-navy-dark" size={14} />
            </div>
            <h3 className="text-white font-bold text-sm">إضافة كتاب جديد</h3>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <FiX size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* منطقة رفع الملف */}
          <div
            className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              dragOver ? 'border-gold bg-gold/10' : file ? 'border-gold/60 bg-gold/5' : 'border-white/10 hover:border-gold/30'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".epub,.pdf,.docx,.doc"
              className="hidden"
              onChange={(e) => handleFile(e.target.files[0])}
            />
            {file ? (
              <div>
                <FiCheckCircle className="mx-auto text-gold mb-2" size={28} />
                <p className="text-gold text-sm font-medium truncate">{file.name}</p>
                <p className="text-white/40 text-xs mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            ) : (
              <div>
                <FiUpload className="mx-auto text-white/30 mb-2" size={28} />
                <p className="text-white/60 text-sm">اسحب الملف هنا أو انقر للاختيار</p>
                <p className="text-white/30 text-xs mt-1">EPUB • PDF • DOCX</p>
              </div>
            )}
          </div>

          {/* عنوان الكتاب */}
          <div>
            <label className="block text-white/50 text-xs mb-1.5">عنوان الكتاب *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="أدخل عنوان الكتاب..."
              required
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-white/20 focus:outline-none focus:border-gold/50 transition-colors"
            />
          </div>

          {/* اسم المؤلف */}
          <div>
            <label className="block text-white/50 text-xs mb-1.5">المؤلف</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="اسم المؤلف..."
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-white/20 focus:outline-none focus:border-gold/50 transition-colors"
            />
          </div>

          {/* التصنيف */}
          <div>
            <label className="block text-white/50 text-xs mb-1.5">التصنيف</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-gold/50 transition-colors"
              style={{ backgroundColor: '#1a1a4e' }}
            >
              {categories.map(c => (
                <option key={c.slug} value={c.slug} style={{ background: '#1a1a4e' }}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* رسالة الحالة */}
          <AnimatePresence>
            {status && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
                  status === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}
              >
                {status === 'success' ? <FiCheckCircle size={16} /> : <FiAlertCircle size={16} />}
                <span>{message}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* أزرار */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm text-white/50 hover:text-white border border-white/10 hover:border-white/20 transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={!file || !title.trim() || uploading || status === 'success'}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #c9a84c, #e8d48b)', color: '#0f0f33' }}
            >
              {uploading ? (
                <><FiLoader className="animate-spin" size={14} /><span>جاري الرفع...</span></>
              ) : (
                <><FiUpload size={14} /><span>رفع الكتاب</span></>
              )}
            </button>
          </div>

          {/* تحذير وقت المعالجة */}
          {uploading && (
            <p className="text-white/30 text-xs text-center">
              قد يستغرق رفع الكتب الكبيرة عدة دقائق...
            </p>
          )}
        </form>
      </div>
    </motion.div>
  );
};

// ─── بناء قائمة التصنيفات ─────────────────────────────
const buildCategories = (books) => {
  const cats = [{ id: 'all', name: 'جميع الكتب', icon: <FiGrid /> }];
  const seen = new Set();
  books.forEach(book => {
    if (book.category && !seen.has(book.category)) {
      seen.add(book.category);
      cats.push({ id: book.category, name: book.category_name || book.category, icon: <FiBook /> });
    }
  });
  return cats;
};

// ─── السايدبار الرئيسي ───────────────────────────────
const Sidebar = ({ books, onSelectBook, selectedBook, onNavigate, currentPage, isMobileOpen, onMobileClose, onBooksRefresh }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const { logout, isAdmin } = useAuth();

  const categories = buildCategories(books);

  const filteredBooks = books.filter(book => {
    const matchesSearch = !searchQuery || book.title.includes(searchQuery) || (book.author || '').includes(searchQuery);
    const matchesCategory = selectedCategory === 'all' || book.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const sidebarContent = (collapsed) => (
    <>
      {/* Header */}
      <div className="p-5 border-b border-gold/10 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #c9a84c, #e8d48b)' }}>
              <FiBook className="text-navy-dark" size={18} />
            </div>
            {!collapsed && (
              <div>
                <h2 className="text-white font-bold text-sm" style={{ fontFamily: "'Amiri', serif" }}>
                  المكتبة الدينية
                </h2>
                <p className="text-gold/50 text-xs">{books.length} كتاب</p>
              </div>
            )}
          </div>
          <button
            onClick={onMobileClose}
            className="md:hidden text-white/50 hover:text-white p-1 transition-colors"
          >
            <FiX size={20} />
          </button>
        </div>

        {!collapsed && (
          <div className="relative">
            <FiSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-gold/40" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن كتاب..."
              className="w-full pr-9 pl-4 py-2.5 bg-white/5 border border-gold/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-gold/40 transition-colors"
            />
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="px-3 py-2 border-b border-gold/10 flex-shrink-0">
        <button
          onClick={() => onNavigate('home')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${currentPage === 'home' ? 'bg-gold/20 text-gold' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
        >
          <FiHome size={16} />
          {!collapsed && <span>الرئيسية</span>}
        </button>
        <button
          onClick={() => onNavigate('chat')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${currentPage === 'chat' ? 'bg-gold/20 text-gold' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
        >
          <FiMessageSquare size={16} />
          {!collapsed && <span>المساعد الذكي</span>}
        </button>
        {isAdmin && (
          <button
            onClick={() => onNavigate('admin')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${currentPage === 'admin' ? 'bg-gold/20 text-gold' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
          >
            <FiSettings size={16} />
            {!collapsed && <span>لوحة التحكم</span>}
          </button>
        )}
      </div>

      {/* Categories & Books */}
      <div className="flex-1 overflow-y-auto py-3 px-3 min-h-0">
        {!collapsed && (
          <p className="text-gold/40 text-xs font-medium px-3 mb-2">التصنيفات</p>
        )}

        {categories.map((cat) => (
          <div key={cat.id}>
            <button
              onClick={() => {
                setSelectedCategory(cat.id);
                setExpandedCategory(expandedCategory === cat.id ? null : cat.id);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all mb-1 ${
                selectedCategory === cat.id
                  ? 'bg-gold/15 text-gold border border-gold/20'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{cat.icon}</span>
                {!collapsed && <span>{cat.name}</span>}
              </div>
              {!collapsed && cat.id !== 'all' && (
                <FiChevronDown
                  className={`transition-transform flex-shrink-0 ${expandedCategory === cat.id ? 'rotate-180' : ''}`}
                  size={14}
                />
              )}
            </button>

            <AnimatePresence>
              {(expandedCategory === cat.id || cat.id === 'all') && !collapsed && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mr-4"
                >
                  {filteredBooks
                    .filter(b => cat.id === 'all' || b.category === cat.id)
                    .map((book) => (
                      <button
                        key={book.id}
                        onClick={() => onSelectBook(book)}
                        className={`w-full text-right px-3 py-2 rounded-lg text-xs transition-all mb-0.5 ${
                          selectedBook?.id === book.id
                            ? 'bg-gold/20 text-gold'
                            : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                        }`}
                      >
                        <p className="truncate font-medium">{book.title}</p>
                        <p className="text-[10px] opacity-50 mt-0.5 truncate">{book.author}</p>
                      </button>
                    ))}
                  {filteredBooks.filter(b => cat.id === 'all' || b.category === cat.id).length === 0 && (
                    <p className="text-white/30 text-xs px-3 py-2">لا توجد كتب</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* ─── زر إضافة كتاب ─── */}
      <div className="px-3 py-3 border-t border-gold/10 flex-shrink-0">
        <button
          onClick={() => setShowUpload(true)}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
            collapsed ? 'justify-center' : 'justify-center'
          }`}
          style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.15), rgba(232,212,139,0.1))', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c' }}
          title="إضافة كتاب جديد"
        >
          <FiPlus size={16} />
          {!collapsed && <span>إضافة كتاب</span>}
        </button>
      </div>

      {/* Footer - تسجيل الخروج */}
      <div className="px-3 pb-4 flex-shrink-0">
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-400/10 transition-colors text-sm"
        >
          <FiLogOut size={15} />
          {!collapsed && <span>تسجيل الخروج</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* ═══ Desktop sidebar ═══ */}
      <motion.aside
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className={`hidden md:flex h-screen sticky top-0 flex-col transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-80'}`}
        style={{
          background: 'linear-gradient(180deg, #0f0f33, #1a1a4e)',
          borderLeft: '1px solid rgba(201, 168, 76, 0.2)',
        }}
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -left-3 top-20 w-6 h-6 rounded-full flex items-center justify-center z-10 border border-gold/30 text-gold hover:bg-gold/20 transition-colors"
          style={{ background: '#1a1a4e' }}
        >
          <FiChevronDown size={12} className={`transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-90'}`} />
        </button>
        {sidebarContent(isCollapsed)}
      </motion.aside>

      {/* ═══ Mobile sidebar overlay ═══ */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.aside
            key="mobile-sidebar"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="md:hidden fixed top-0 right-0 h-full w-80 z-50 flex flex-col"
            style={{
              background: 'linear-gradient(180deg, #0f0f33, #1a1a4e)',
              borderLeft: '1px solid rgba(201, 168, 76, 0.2)',
            }}
          >
            {sidebarContent(false)}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ═══ نافذة رفع الكتاب ═══ */}
      <AnimatePresence>
        {showUpload && (
          <UploadModal
            onClose={() => setShowUpload(false)}
            onSuccess={() => {
              setShowUpload(false);
              onBooksRefresh?.(); // تحديث قائمة الكتب
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;
