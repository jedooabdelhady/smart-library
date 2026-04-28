import React, { useState, useEffect } from 'react';
import { FiHome, FiBook, FiMessageSquare, FiSettings } from 'react-icons/fi';
import Sidebar from '../components/Sidebar';
import BookViewer from '../components/BookViewer';
import ChatPanel from '../components/ChatPanel';
import HomePage from './HomePage';
import AdminDashboard from './AdminDashboard';
import AdvancedSearch from './AdvancedSearch';
import { getBooks } from '../services/api';
import { useAuth } from '../context/AuthContext';


const MainLayout = () => {
  const [currentPage, setCurrentPage] = useState('home');
  const [selectedBook, setSelectedBook] = useState(null);
  const [chatExpanded, setChatExpanded] = useState(true);
  const [books, setBooks] = useState([]);

  // Mobile overlay state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);

  const { isAdmin } = useAuth();

  const fetchBooks = async () => {
    try {
      const res = await getBooks();
      if (res.data && res.data.length > 0) setBooks(res.data);
    } catch (err) {
      // Use local books data
    }
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const handleSelectBook = (book) => {
    setSelectedBook(book);
    setCurrentPage('reader');
    // Close mobile overlays when a book is selected
    setIsMobileSidebarOpen(false);
    setIsMobileChatOpen(false);
  };

  const handleNavigate = (page) => {
    setCurrentPage(page);
    if (page !== 'reader') setSelectedBook(null);
    setIsMobileSidebarOpen(false);
    setIsMobileChatOpen(false);
  };

  const closeMobileOverlays = () => {
    setIsMobileSidebarOpen(false);
    setIsMobileChatOpen(false);
  };

  const renderContent = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage books={books} onSelectBook={handleSelectBook} onNavigate={handleNavigate} />;
      case 'reader':
      case 'library':
        return <BookViewer book={selectedBook} onClose={() => handleNavigate('home')} />;
      case 'search':
        return <AdvancedSearch books={books} onSelectBook={handleSelectBook} />;
      case 'admin':
        return <AdminDashboard />;
      case 'chat':
        return (
          <div className="flex-1 flex items-center justify-center bg-cream">
            <div className="text-center px-6">
              <FiMessageSquare className="mx-auto text-gold mb-3" size={40} />
              <p className="text-navy/60 text-sm">افتح لوحة المحادثة من الزر أدناه</p>
              <button
                onClick={() => setIsMobileChatOpen(true)}
                className="mt-4 px-6 py-2 rounded-full text-sm font-bold text-navy md:hidden"
                style={{ background: 'linear-gradient(135deg, #c9a84c, #e8d48b)' }}
              >
                فتح المساعد الذكي
              </button>
            </div>
          </div>
        );
      default:
        return <HomePage books={books} onSelectBook={handleSelectBook} onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden relative">

      {/* ─── Sidebar (RIGHT in RTL) ─── */}
      <Sidebar
        books={books}
        onSelectBook={handleSelectBook}
        selectedBook={selectedBook}
        onNavigate={handleNavigate}
        currentPage={currentPage}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
        onBooksRefresh={fetchBooks}
      />

      {/* ─── Main content ─── */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
        {renderContent()}
      </main>

      {/* ─── Chat Panel (LEFT in RTL) ─── */}
      <ChatPanel
        selectedBook={selectedBook}
        isExpanded={chatExpanded}
        onToggle={() => setChatExpanded(!chatExpanded)}
        isMobileOpen={isMobileChatOpen}
        onMobileClose={() => setIsMobileChatOpen(false)}
      />

      {/* ─── Mobile: dark backdrop ─── */}
      {(isMobileSidebarOpen || isMobileChatOpen) && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={closeMobileOverlays}
        />
      )}

      {/* ─── Mobile bottom navigation bar ─── */}
      <nav
        className="fixed bottom-0 right-0 left-0 md:hidden z-30 flex items-center justify-around px-2 py-2 border-t border-gold/20"
        style={{ background: 'linear-gradient(180deg, #0f0f33, #1a1a4e)' }}
      >
        {/* Home */}
        <button
          onClick={() => handleNavigate('home')}
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors ${
            currentPage === 'home' ? 'text-gold' : 'text-white/50'
          }`}
        >
          <FiHome size={20} />
          <span className="text-[10px]">الرئيسية</span>
        </button>

        {/* Books sidebar */}
        <button
          onClick={() => { setIsMobileChatOpen(false); setIsMobileSidebarOpen(v => !v); }}
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors ${
            isMobileSidebarOpen ? 'text-gold' : 'text-white/50'
          }`}
        >
          <FiBook size={20} />
          <span className="text-[10px]">الكتب</span>
        </button>

        {/* AI Chat */}
        <button
          onClick={() => { setIsMobileSidebarOpen(false); setIsMobileChatOpen(v => !v); }}
          className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors ${
            isMobileChatOpen ? 'text-gold' : 'text-white/50'
          }`}
        >
          <FiMessageSquare size={20} />
          <span className="text-[10px]">المساعد</span>
        </button>

        {/* Admin (conditional) */}
        {isAdmin && (
          <button
            onClick={() => handleNavigate('admin')}
            className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors ${
              currentPage === 'admin' ? 'text-gold' : 'text-white/50'
            }`}
          >
            <FiSettings size={20} />
            <span className="text-[10px]">التحكم</span>
          </button>
        )}
      </nav>
    </div>
  );
};

export default MainLayout;
