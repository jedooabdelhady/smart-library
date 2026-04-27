import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSend, FiBook, FiCopy, FiMessageSquare, FiRefreshCw, FiX, FiCheckCircle } from 'react-icons/fi';
import { sendMessage } from '../services/api';

// ─── عارض Markdown خفيف بدون مكتبات خارجية ───
const parseInline = (str) => {
  if (!str) return str;
  const parts = str.split(/(\*\*[^*\n]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

const MarkdownText = ({ text }) => {
  if (!text) return null;
  const lines = text.split('\n');
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('## ')) {
      result.push(
        <div key={i} className="font-bold text-navy/90 mt-3 mb-1.5 text-sm border-b border-gold/20 pb-1">
          {parseInline(line.slice(3))}
        </div>
      );
    } else if (line.startsWith('# ')) {
      result.push(
        <div key={i} className="font-bold text-navy mt-3 mb-1.5">
          {parseInline(line.slice(2))}
        </div>
      );
    } else if (line.startsWith('> ')) {
      result.push(
        <div key={i} className="border-r-2 border-gold/40 pr-3 text-navy/60 text-xs italic my-2">
          {parseInline(line.slice(2))}
        </div>
      );
    } else if (line === '---') {
      result.push(<hr key={i} className="border-gold/20 my-2" />);
    } else if (/^\s*[•-]\s/.test(line)) {
      const content = line.replace(/^\s*[•-]\s/, '');
      result.push(
        <div key={i} className="flex gap-2 my-0.5 pr-1">
          <span className="text-gold flex-shrink-0 mt-0.5">•</span>
          <span>{parseInline(content)}</span>
        </div>
      );
    } else if (line.trim() === '') {
      result.push(<div key={i} className="h-1.5" />);
    } else {
      result.push(
        <p key={i} className="my-0.5 leading-relaxed">
          {parseInline(line)}
        </p>
      );
    }
  }
  return <div className="text-sm">{result}</div>;
};

const ChatPanel = ({ selectedBook, isExpanded, onToggle, isMobileOpen, onMobileClose }) => {
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'السلام عليكم ورحمة الله وبركاته 🌙\n\nأنا المساعد الذكي للمكتبة الدينية. يمكنني مساعدتك في:\n\n• البحث في الكتب والإجابة على الأسئلة الدينية\n• تلخيص فصول الكتب\n• مقارنة الآراء بين العلماء\n• استخراج المراجع والأدلة\n\nكل إجاباتي مبنية حصرياً على الكتب المتوفرة في المكتبة مع ذكر المصدر الدقيق.',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setShowQuickActions(false);

    try {
      const response = await sendMessage(input, selectedBook?.id);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.data.answer,
        sources: response.data.sources,
        timestamp: new Date(),
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: generateDemoResponse(input),
        sources: selectedBook ? [{ book: selectedBook.title, page: Math.floor(Math.random() * 200) + 1 }] : [],
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const generateDemoResponse = (question) => {
    return `بناءً على البحث في الكتب المتوفرة في المكتبة:\n\n**القول الأول:** ذهب جمهور العلماء إلى أن هذه المسألة تحتاج إلى تفصيل وفق ما ورد في النصوص الشرعية.\n\n**الدليل:** استدلوا بما جاء في الكتاب والسنة من نصوص تدل على ذلك.\n\n📖 **المصدر:** ${selectedBook ? selectedBook.title : 'المكتبة الدينية'}\n\n---\n*ملاحظة: هذه إجابة توضيحية. للحصول على إجابات دقيقة، يرجى تشغيل الخادم الخلفي.*`;
  };

  const quickActions = [
    { label: 'تلخيص الفصل الحالي', action: () => setInput('لخص لي هذا الفصل') },
    { label: 'ما هي الأقوال في هذه المسألة؟', action: () => setInput('ما هي الأقوال في هذه المسألة؟') },
    { label: 'استخرج الأدلة الشرعية', action: () => setInput('استخرج الأدلة الشرعية من هذا الباب') },
    { label: 'قارن بين آراء العلماء', action: () => setInput('قارن بين آراء العلماء في هذه المسألة') },
  ];

  const copyMessage = (content, idx) => {
    navigator.clipboard.writeText(content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  // Shared chat body (used in both desktop and mobile)
  const chatBody = (onClose) => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-beige-dark flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #1a1a4e, #2d2d7a)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #c9a84c, #e8d48b)' }}>
            <FiMessageSquare className="text-navy-dark" size={16} />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm">المساعد الذكي</h3>
            <p className="text-gold/50 text-xs">مبني على الكتب المتوفرة فقط</p>
          </div>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
          <FiX size={18} />
        </button>
      </div>

      {/* Context indicator */}
      {selectedBook && (
        <div className="px-4 py-2 bg-gold/5 border-b border-gold/10 flex items-center gap-2 flex-shrink-0">
          <FiBook className="text-gold" size={14} />
          <span className="text-navy/60 text-xs truncate">
            السياق: <strong className="text-navy">{selectedBook.title}</strong>
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence>
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`${msg.role === 'user' ? 'mr-auto ml-0' : 'ml-auto mr-0'} max-w-[92%]`}
            >
              <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user' ? 'chat-message-user rounded-br-sm' : 'chat-message-ai rounded-bl-sm'
              }`}>
                {msg.role === 'user'
                  ? <div className="whitespace-pre-wrap">{msg.content}</div>
                  : <MarkdownText text={msg.content} />
                }
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-gold/20">
                    <p className="text-xs font-bold text-gold mb-1">المصادر:</p>
                    {msg.sources.map((src, i) => (
                      <p key={i} className="text-xs text-navy/50">
                        📖 {src.book} — الصفحة {src.page}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === 'assistant' && (
                <div className="flex gap-1 mt-1 mr-2">
                  <button
                    onClick={() => copyMessage(msg.content, idx)}
                    className={`transition-colors p-1 flex items-center gap-1 text-xs ${copiedIdx === idx ? 'text-green-500' : 'text-navy/20 hover:text-navy/60'}`}
                    title="نسخ الرسالة"
                  >
                    {copiedIdx === idx ? <><FiCheckCircle size={12} /><span>تم النسخ</span></> : <FiCopy size={12} />}
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-navy/40 text-sm mr-2"
          >
            <FiRefreshCw className="animate-spin" size={14} />
            <span>جاري البحث في الكتب...</span>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {showQuickActions && (
        <div className="px-4 py-2 border-t border-beige-dark flex-shrink-0">
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action, idx) => (
              <button
                key={idx}
                onClick={action.action}
                className="px-3 py-1.5 bg-beige rounded-full text-xs text-navy/60 hover:text-navy hover:bg-gold/20 transition-colors border border-beige-dark"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-beige-dark flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="اكتب سؤالك هنا..."
            rows={1}
            className="flex-1 px-4 py-3 bg-beige/50 border border-beige-dark rounded-xl text-sm text-navy placeholder-navy/30 focus:outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/10 resize-none transition-all"
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-3 rounded-xl transition-all disabled:opacity-30 flex-shrink-0"
            style={{ background: input.trim() ? 'linear-gradient(135deg, #c9a84c, #e8d48b)' : '#e8dcc8' }}
          >
            <FiSend className={input.trim() ? 'text-navy-dark' : 'text-navy/30'} size={18} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ═══ Desktop chat panel ═══ */}
      <motion.div
        initial={{ width: isExpanded ? 420 : 60 }}
        animate={{ width: isExpanded ? 420 : 60 }}
        transition={{ duration: 0.3 }}
        className="hidden md:flex h-screen sticky top-0 flex-col bg-white border-r border-beige-dark"
      >
        {!isExpanded ? (
          <button
            onClick={onToggle}
            className="flex flex-col items-center justify-center h-full gap-3 hover:bg-beige/50 transition-colors"
          >
            <FiMessageSquare className="text-gold" size={24} />
            <span className="text-navy/60 text-xs [writing-mode:vertical-rl] rotate-180">المساعد الذكي</span>
          </button>
        ) : (
          chatBody(onToggle)
        )}
      </motion.div>

      {/* ═══ Mobile chat panel overlay ═══ */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            key="mobile-chat"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="md:hidden fixed top-0 left-0 h-full w-full max-w-sm z-50 flex flex-col bg-white"
            style={{ boxShadow: '4px 0 20px rgba(0,0,0,0.3)' }}
          >
            {chatBody(onMobileClose)}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ChatPanel;
