import React from 'react';
import { motion } from 'framer-motion';
import { FiBook, FiSearch, FiMessageSquare, FiStar, FiArrowLeft } from 'react-icons/fi';

const HomePage = ({ books, onSelectBook, onNavigate }) => {
  const featuredBooks = books.slice(0, 6);
  const recentBooks = books.slice(0, 4);

  const stats = [
    { label: 'كتاب متوفر', value: books.length || '200+', icon: <FiBook /> },
    { label: 'تصنيف علمي', value: '8', icon: <FiSearch /> },
    { label: 'استعلام ذكي', value: '∞', icon: <FiMessageSquare /> },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Hero Section */}
      <div className="relative overflow-hidden py-16 px-8"
        style={{
          background: 'linear-gradient(135deg, #0f0f33 0%, #1a1a4e 50%, #2d2d7a 100%)',
        }}>
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9a84c' fill-opacity='1'%3E%3Cpath d='M50 50c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10c0 5.523-4.477 10-10 10s-10-4.477-10-10 4.477-10 10-10zM10 10c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10c0 5.523-4.477 10-10 10S0 25.523 0 20s4.477-10 10-10z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4"
              style={{ fontFamily: "'Amiri', serif" }}>
              المكتبة الدينية الذكية
            </h1>
            <p className="text-gold-light/60 text-lg mb-8 max-w-2xl mx-auto leading-relaxed">
              منصة متكاملة للبحث والمعرفة الدينية مدعومة بالذكاء الاصطناعي.
              اكتشف أكثر من 200 كتاب ديني وأكاديمي مع مساعد ذكي يجيب على أسئلتك بالأدلة والمصادر.
            </p>

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => onNavigate('chat')}
                className="px-6 py-3 btn-luxury rounded-xl text-sm font-bold flex items-center gap-2"
              >
                <FiMessageSquare />
                ابدأ محادثة ذكية
              </button>
              <button
                onClick={() => onNavigate('library')}
                className="px-6 py-3 bg-white/10 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors border border-white/10 flex items-center gap-2"
              >
                <FiBook />
                تصفح المكتبة
              </button>
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="flex items-center justify-center gap-8 mt-12"
          >
            {stats.map((stat, idx) => (
              <div key={idx} className="text-center">
                <div className="text-gold text-2xl mb-1">{stat.icon}</div>
                <p className="text-white text-2xl font-bold">{stat.value}</p>
                <p className="text-white/40 text-xs">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Featured Books */}
      <div className="max-w-6xl mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-navy" style={{ fontFamily: "'Amiri', serif" }}>
            كتب مميزة
          </h2>
          <button
            onClick={() => onNavigate('library')}
            className="text-gold text-sm flex items-center gap-1 hover:gap-2 transition-all"
          >
            عرض الكل <FiArrowLeft />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredBooks.map((book, idx) => (
            <motion.div
              key={book.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              onClick={() => onSelectBook(book)}
              className="group cursor-pointer bg-white rounded-2xl border border-beige-dark hover:border-gold/30 hover:shadow-xl transition-all duration-300 overflow-hidden"
            >
              {/* Book Cover */}
              <div className="h-48 relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${['#1a1a4e', '#2d1a4e', '#1a3a4e', '#4e1a1a', '#1a4e2d', '#4e3a1a'][idx % 6]}, ${['#2d2d7a', '#5a2d7a', '#2d5a7a', '#7a2d2d', '#2d7a5a', '#7a5a2d'][idx % 6]})`,
                }}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <FiBook className="text-white/20 group-hover:text-gold/40 transition-colors" size={64} />
                </div>
                <div className="absolute bottom-3 right-3 bg-gold/90 text-navy-dark text-xs px-2 py-1 rounded-md font-bold">
                  {book.category_name || 'عام'}
                </div>
              </div>

              {/* Book Info */}
              <div className="p-5">
                <h3 className="font-bold text-navy mb-1 group-hover:text-gold transition-colors"
                  style={{ fontFamily: "'Amiri', serif" }}>
                  {book.title}
                </h3>
                <p className="text-navy/40 text-sm mb-3">{book.author}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map(s => (
                      <FiStar key={s} size={12} className={s <= 4 ? 'text-gold fill-gold' : 'text-navy/10'} />
                    ))}
                  </div>
                  <span className="text-xs text-navy/30">{book.pages_count || '---'} صفحة</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-beige/50 py-16 px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-navy text-center mb-10" style={{ fontFamily: "'Amiri', serif" }}>
            مميزات المنصة
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: <FiSearch size={28} />,
                title: 'بحث ذكي متقدم',
                desc: 'بحث دلالي عميق في محتوى الكتب باستخدام تقنية المتجهات للوصول للنتائج الأكثر دقة'
              },
              {
                icon: <FiMessageSquare size={28} />,
                title: 'مساعد ذكي موثوق',
                desc: 'إجابات دقيقة مبنية حصرياً على الكتب المتوفرة مع استشهاد كامل بالمصدر ورقم الصفحة'
              },
              {
                icon: <FiBook size={28} />,
                title: 'قراءة تفاعلية',
                desc: 'عارض كتب متطور مع تأثير تقليب واقعي وإمكانية إضافة علامات مرجعية وتكبير'
              },
            ].map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + idx * 0.15 }}
                className="text-center p-6 bg-white rounded-2xl border border-beige-dark"
              >
                <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center text-gold"
                  style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.1), rgba(201,168,76,0.2))' }}>
                  {feature.icon}
                </div>
                <h3 className="font-bold text-navy mb-2">{feature.title}</h3>
                <p className="text-navy/50 text-sm leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 px-8 text-center border-t border-beige-dark">
        <p className="text-navy/30 text-sm" style={{ fontFamily: "'Amiri', serif" }}>
          ﴿ وَقُل رَّبِّ زِدْنِي عِلْمًا ﴾
        </p>
        <p className="text-navy/20 text-xs mt-2">المكتبة الدينية الذكية © {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
};

export default HomePage;
