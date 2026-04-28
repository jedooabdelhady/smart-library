import React, { useState } from 'react';
import { FiSearch, FiBook, FiInfo, FiChevronLeft } from 'react-icons/fi';
import api from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';

const AdvancedSearch = ({ books, onSelectBook }) => {
  const [query, setQuery] = useState('');
  const [bookId, setBookId] = useState('');
  const [searchType, setSearchType] = useState('thematic'); // 'exact', 'root', 'thematic'
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setSearched(true);
    setResults([]);

    try {
      // Endpoint to be created in the backend
      const res = await api.get('/books/advanced-search', {
        params: {
          q: query.trim(),
          bookId: bookId || '',
          type: searchType
        }
      });
      setResults(res.data || []);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-cream overflow-y-auto">
      {/* Header */}
      <div className="bg-navy p-8 md:p-12 text-white relative overflow-hidden flex-shrink-0"
        style={{
          background: 'linear-gradient(135deg, #0f0f33 0%, #1a1a4e 100%)',
        }}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-gold opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="max-w-4xl mx-auto relative z-10">
          <h1 className="text-3xl md:text-4xl font-bold text-gold mb-4" style={{ fontFamily: "'Amiri', serif" }}>
            البحث المتقدم في الموسوعة
          </h1>
          <p className="text-white/70 text-sm md:text-base max-w-2xl leading-relaxed">
            ابحث بدقة داخل جميع الكتب. يمكنك البحث بالكلمة المتطابقة، أو بجذر الكلمة، أو البحث الموضوعي الشامل لاستخراج الفوائد والفتاوى.
          </p>
        </div>
      </div>

      <div className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 -mt-8 relative z-20">
        <div className="bg-white rounded-2xl shadow-xl shadow-navy/5 border border-gold/10 p-6 md:p-8">
          <form onSubmit={handleSearch} className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <FiSearch className="absolute right-4 top-1/2 -translate-y-1/2 text-navy/40" size={20} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="اكتب كلمة أو جملة للبحث..."
                  className="w-full pl-4 pr-12 py-4 bg-cream/30 border border-navy/10 rounded-xl text-navy placeholder-navy/40 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all text-lg"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || !query.trim()}
                className="px-8 py-4 rounded-xl text-navy font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:shadow-lg"
                style={{ background: 'linear-gradient(135deg, #c9a84c, #e8d48b)' }}
              >
                {isSearching ? 'جاري البحث...' : 'ابحث الآن'}
              </button>
            </div>

            <div className="flex flex-col md:flex-row gap-6 p-4 bg-cream/50 rounded-xl border border-navy/5">
              <div className="flex-1">
                <label className="block text-navy/70 text-sm font-bold mb-2">نطاق البحث</label>
                <select
                  value={bookId}
                  onChange={(e) => setBookId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-navy/10 rounded-lg text-navy text-sm focus:outline-none focus:border-gold"
                >
                  <option value="">جميع الكتب</option>
                  {books.map(b => (
                    <option key={b.id} value={b.id}>{b.title}</option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <label className="block text-navy/70 text-sm font-bold mb-2">نوع البحث</label>
                <div className="flex flex-wrap gap-2">
                  <label className={`cursor-pointer px-4 py-2 rounded-lg text-sm transition-all ${searchType === 'exact' ? 'bg-navy text-white' : 'bg-white text-navy/70 border border-navy/10'}`}>
                    <input type="radio" name="type" value="exact" checked={searchType === 'exact'} onChange={() => setSearchType('exact')} className="hidden" />
                    تطابق تام
                  </label>
                  <label className={`cursor-pointer px-4 py-2 rounded-lg text-sm transition-all ${searchType === 'root' ? 'bg-navy text-white' : 'bg-white text-navy/70 border border-navy/10'}`}>
                    <input type="radio" name="type" value="root" checked={searchType === 'root'} onChange={() => setSearchType('root')} className="hidden" />
                    الجذر والاشتقاق
                  </label>
                  <label className={`cursor-pointer px-4 py-2 rounded-lg text-sm transition-all ${searchType === 'thematic' ? 'bg-navy text-white' : 'bg-white text-navy/70 border border-navy/10'}`}>
                    <input type="radio" name="type" value="thematic" checked={searchType === 'thematic'} onChange={() => setSearchType('thematic')} className="hidden" />
                    بحث موضوعي
                  </label>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Results */}
        <div className="mt-8">
          {isSearching ? (
            <div className="flex justify-center py-12">
              <div className="w-10 h-10 border-4 border-gold border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : searched && results.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-navy/5">
              <FiInfo className="mx-auto text-navy/30 mb-3" size={32} />
              <p className="text-navy/60 font-medium">لم يتم العثور على نتائج مطابقة لبحثك.</p>
              <p className="text-navy/40 text-sm mt-1">جرب استخدام كلمات مفتاحية أخرى أو تغيير نوع البحث.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {searched && (
                <div className="flex items-center justify-between px-2 mb-4">
                  <h3 className="text-navy font-bold text-lg">النتائج ({results.length})</h3>
                </div>
              )}
              
              <AnimatePresence>
                {results.map((result, idx) => {
                  const book = books.find(b => String(b.id) === String(result.metadata.bookId));
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      key={idx}
                      className="bg-white rounded-xl shadow-sm shadow-navy/5 border border-navy/5 p-6 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-cream flex items-center justify-center flex-shrink-0">
                            <FiBook className="text-gold" size={20} />
                          </div>
                          <div>
                            <h4 className="text-navy font-bold text-lg leading-tight">
                              {result.metadata.bookTitle}
                            </h4>
                            <p className="text-navy/50 text-xs mt-1">
                              الصفحة {result.metadata.pageStart}
                            </p>
                          </div>
                        </div>
                        {book && (
                          <button
                            onClick={() => onSelectBook(book)}
                            className="flex items-center gap-1 text-sm text-gold hover:text-navy transition-colors font-bold bg-gold/10 px-3 py-1.5 rounded-lg"
                          >
                            فتح الكتاب
                            <FiChevronLeft />
                          </button>
                        )}
                      </div>
                      
                      <div className="bg-cream/30 p-4 rounded-lg border border-navy/5 relative">
                        <p className="text-navy/80 text-sm leading-loose whitespace-pre-wrap font-arabic">
                          {result.content.length > 500 ? result.content.substring(0, 500) + '...' : result.content}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdvancedSearch;
