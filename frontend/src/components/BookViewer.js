import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiChevronRight, FiChevronLeft, FiMaximize2, FiMinimize2, FiBookmark, FiZoomIn, FiZoomOut } from 'react-icons/fi';
import { getBookPages } from '../services/api';

// صفحات تجريبية للعرض فقط
const DEMO_PAGES = [
  { number: 1, content: 'بسم الله الرحمن الرحيم\n\nمقدمة الكتاب\n\nالحمد لله رب العالمين والصلاة والسلام على أشرف المرسلين سيدنا محمد وعلى آله وصحبه أجمعين.\n\nأما بعد، فهذا كتاب جمعت فيه ما تيسر من العلم النافع والعمل الصالح.' },
  { number: 2, content: 'الباب الأول\n\nفي بيان أصول العلم وفضله\n\nقال الله تعالى: ﴿يَرْفَعِ اللَّهُ الَّذِينَ آمَنُوا مِنكُمْ وَالَّذِينَ أُوتُوا الْعِلْمَ دَرَجَاتٍ﴾' },
  { number: 3, content: 'الفصل الأول\n\nفي آداب طالب العلم\n\nينبغي لطالب العلم أن يتحلى بالإخلاص في طلبه، وأن يجعل نيته خالصة لله تعالى.' },
];

const BookViewer = ({ book, onClose }) => {
  const [pages, setPages] = useState(DEMO_PAGES);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [bookmarks, setBookmarks] = useState([]);
  const [goToInput, setGoToInput] = useState('');

  // تحميل صفحات الكتاب من قاعدة البيانات
  useEffect(() => {
    if (!book?.id) {
      setPages(DEMO_PAGES);
      setCurrentPage(0);
      return;
    }
    
    const initialPageNumber = book.initialPage ? Math.max(0, parseInt(book.initialPage, 10) - 1) : 0;
    
    setLoading(true);
    setCurrentPage(initialPageNumber);
    
    getBookPages(book.id)
      .then(res => {
        if (res.data && res.data.length > 0) {
          setPages(res.data);
          setCurrentPage(initialPageNumber);
        } else {
          setPages(DEMO_PAGES);
        }
      })
      .catch(() => setPages(DEMO_PAGES))
      .finally(() => setLoading(false));
  }, [book?.id, book?.initialPage]);

  const totalPages = pages.length;

  const goToPage = useCallback((direction) => {
    if (isFlipping) return;
    setIsFlipping(true);
    setFlipDirection(direction);
    setTimeout(() => {
      if (direction === 'next' && currentPage < totalPages - 1) {
        setCurrentPage(prev => prev + 1);
      } else if (direction === 'prev' && currentPage > 0) {
        setCurrentPage(prev => prev - 1);
      }
      setIsFlipping(false);
      setFlipDirection(null);
    }, 300);
  }, [currentPage, totalPages, isFlipping]);

  const toggleBookmark = () => {
    setBookmarks(prev =>
      prev.includes(currentPage)
        ? prev.filter(b => b !== currentPage)
        : [...prev, currentPage]
    );
  };

  const handleGoTo = (e) => {
    e.preventDefault();
    const n = parseInt(goToInput, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      setCurrentPage(n - 1);
    }
    setGoToInput('');
  };

  const pageVariants = {
    enter: (direction) => ({ x: direction === 'next' ? -40 : 40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (direction) => ({ x: direction === 'next' ? 40 : -40, opacity: 0 }),
  };

  if (!book) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cream">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center px-6"
        >
          <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-beige flex items-center justify-center">
            <svg className="w-16 h-16 text-gold/40" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/>
            </svg>
          </div>
          <h3 className="text-navy text-xl font-bold mb-2" style={{ fontFamily: "'Amiri', serif" }}>
            اختر كتاباً للقراءة
          </h3>
          <p className="text-navy/40 text-sm">اختر كتاباً من القائمة الجانبية لبدء القراءة</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col bg-cream ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* ─── شريط العنوان ─── */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 bg-white border-b border-beige-dark flex-shrink-0">
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <button
            onClick={onClose}
            className="text-navy/40 hover:text-navy transition-colors text-sm flex-shrink-0"
          >
            ✕ إغلاق
          </button>
          <div className="h-5 w-px bg-beige-dark hidden md:block" />
          <h3 className="text-navy font-bold text-sm truncate" style={{ fontFamily: "'Amiri', serif" }}>
            {book.title}
          </h3>
          <span className="text-navy/30 text-xs truncate hidden md:block">— {book.author}</span>
        </div>

        <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
          {/* تحكم بالتكبير */}
          <button
            onClick={() => setZoom(z => Math.max(0.6, z - 0.1))}
            className="p-1.5 md:p-2 rounded-lg hover:bg-beige transition-colors text-navy/40 hover:text-navy"
            title="تصغير"
          >
            <FiZoomOut size={15} />
          </button>
          <span className="text-xs text-navy/40 min-w-[36px] text-center hidden md:block">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(z => Math.min(2, z + 0.1))}
            className="p-1.5 md:p-2 rounded-lg hover:bg-beige transition-colors text-navy/40 hover:text-navy"
            title="تكبير"
          >
            <FiZoomIn size={15} />
          </button>
          <div className="h-5 w-px bg-beige-dark mx-1" />
          {/* إشارة مرجعية */}
          <button
            onClick={toggleBookmark}
            className={`p-1.5 md:p-2 rounded-lg transition-colors ${bookmarks.includes(currentPage) ? 'text-gold bg-gold/10' : 'text-navy/40 hover:text-navy hover:bg-beige'}`}
            title="إضافة إشارة مرجعية"
          >
            <FiBookmark size={15} />
          </button>
          {/* ملء الشاشة */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 md:p-2 rounded-lg hover:bg-beige transition-colors text-navy/40 hover:text-navy"
            title={isFullscreen ? 'تصغير' : 'ملء الشاشة'}
          >
            {isFullscreen ? <FiMinimize2 size={15} /> : <FiMaximize2 size={15} />}
          </button>
        </div>
      </div>

      {/* ─── محتوى الصفحة ─── */}
      <div
        className="flex-1 flex items-center justify-center p-4 md:p-8 overflow-hidden"
        style={{ perspective: '1200px' }}
      >
        {loading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4 text-navy/40"
          >
            <div className="w-10 h-10 border-2 border-gold/40 border-t-gold rounded-full animate-spin" />
            <p className="text-sm">جاري تحميل الكتاب...</p>
          </motion.div>
        ) : (
          <div className="relative w-full max-w-3xl" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
            <div className="absolute inset-0 rounded-lg shadow-2xl pointer-events-none" />

            <AnimatePresence mode="wait" custom={flipDirection}>
              <motion.div
                key={currentPage}
                custom={flipDirection}
                variants={pageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="bg-white rounded-lg shadow-lg border border-beige-dark min-h-[420px] md:min-h-[500px] relative"
              >
                {/* شريط ذهبي علوي */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-l from-gold/30 via-gold to-gold/30 rounded-t-lg" />

                {/* علامة إشارة مرجعية */}
                {bookmarks.includes(currentPage) && (
                  <div className="absolute top-0 left-8 w-7 h-10 bg-gold rounded-b-sm shadow-md flex items-end justify-center pb-1">
                    <FiBookmark className="text-white" size={11} />
                  </div>
                )}

                {/* نص الصفحة */}
                <div className="p-6 md:p-12 leading-loose text-right" style={{ fontFamily: "'Amiri', serif" }}>
                  <div className="text-navy text-base md:text-lg whitespace-pre-wrap leading-[2.2]">
                    {pages[currentPage]?.content}
                  </div>
                </div>

                {/* رقم الصفحة */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-navy/30 text-sm">
                  {pages[currentPage]?.number || currentPage + 1}
                </div>

                {/* خط الهامش */}
                <div className="absolute top-4 bottom-4 left-0 w-px bg-gradient-to-b from-transparent via-beige-dark to-transparent" />
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ─── شريط التنقل السفلي ─── */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 bg-white border-t border-beige-dark flex-shrink-0">
        {/* زر الصفحة التالية */}
        <button
          onClick={() => goToPage('next')}
          disabled={currentPage >= totalPages - 1 || loading}
          className="flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 rounded-lg bg-navy text-white text-sm hover:bg-navy-light transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          الصفحة التالية
          <FiChevronLeft size={16} />
        </button>

        {/* معلومات الصفحة والتنقل */}
        <div className="flex items-center gap-2 md:gap-3">
          <span className="text-navy/40 text-xs md:text-sm">
            الصفحة {currentPage + 1} من {totalPages}
          </span>
          {/* شريط التمرير - مخفي على الجوال */}
          <input
            type="range"
            min={0}
            max={totalPages - 1}
            value={currentPage}
            onChange={(e) => setCurrentPage(parseInt(e.target.value))}
            className="w-24 md:w-40 accent-gold hidden md:block"
          />
          {/* حقل الانتقال المباشر لرقم الصفحة */}
          <form onSubmit={handleGoTo} className="hidden md:flex items-center gap-1">
            <input
              type="number"
              value={goToInput}
              onChange={e => setGoToInput(e.target.value)}
              placeholder="انتقل..."
              min={1}
              max={totalPages}
              className="w-20 px-2 py-1 text-xs border border-beige-dark rounded-lg text-navy text-center focus:outline-none focus:border-gold/40"
            />
            <button type="submit" className="text-xs text-gold hover:text-gold/80 transition-colors">
              اذهب
            </button>
          </form>
        </div>

        {/* زر الصفحة السابقة */}
        <button
          onClick={() => goToPage('prev')}
          disabled={currentPage <= 0 || loading}
          className="flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 rounded-lg bg-navy text-white text-sm hover:bg-navy-light transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <FiChevronRight size={16} />
          الصفحة السابقة
        </button>
      </div>
    </div>
  );
};

export default BookViewer;
