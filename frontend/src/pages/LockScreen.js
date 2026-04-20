import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

const LockScreen = () => {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const { login, adminLogin } = useAuth();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (login(passcode)) {
      setError('');
    } else {
      setError('رمز الدخول غير صحيح');
      setPasscode('');
    }
  };

  const handleAdminSubmit = (e) => {
    e.preventDefault();
    if (adminLogin(adminUser, adminPass)) {
      setError('');
    } else {
      setError('بيانات المسؤول غير صحيحة');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0f0f33 0%, #1a1a4e 40%, #2d2d7a 100%)',
      }}>

      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #c9a84c, transparent)' }} />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #c9a84c, transparent)' }} />

        {/* Islamic geometric pattern overlay */}
        <div className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9a84c' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-10 border border-gold/20 shadow-2xl">

          {/* Logo / Icon */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
              className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #c9a84c, #e8d48b)',
                boxShadow: '0 0 40px rgba(201, 168, 76, 0.3)',
              }}
            >
              <svg className="w-12 h-12 text-navy-dark" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/>
              </svg>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-3xl font-bold text-white mb-2"
              style={{ fontFamily: "'Amiri', serif" }}
            >
              المكتبة الدينية الذكية
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-gold-light/70 text-sm"
            >
              منصة البحث والمعرفة الدينية
            </motion.p>
          </div>

          <AnimatePresence mode="wait">
            {!showAdmin ? (
              <motion.form
                key="user"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleSubmit}
                className="space-y-6"
              >
                <div>
                  <label className="block text-gold-light/80 text-sm mb-2 font-medium">
                    رمز الدخول
                  </label>
                  <input
                    type="password"
                    value={passcode}
                    onChange={(e) => { setPasscode(e.target.value); setError(''); }}
                    placeholder="أدخل رمز الدخول"
                    className="w-full px-5 py-4 bg-white/10 border border-gold/30 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 transition-all text-center text-lg tracking-widest"
                    autoFocus
                  />
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-red-400 text-sm text-center"
                  >
                    {error}
                  </motion.p>
                )}

                <button
                  type="submit"
                  className="w-full py-4 rounded-xl text-lg font-bold btn-luxury transition-all"
                >
                  دخول المكتبة
                </button>

                <button
                  type="button"
                  onClick={() => { setShowAdmin(true); setError(''); }}
                  className="w-full text-center text-gold/50 hover:text-gold text-sm transition-colors"
                >
                  دخول المسؤول
                </button>
              </motion.form>
            ) : (
              <motion.form
                key="admin"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleAdminSubmit}
                className="space-y-5"
              >
                <div>
                  <label className="block text-gold-light/80 text-sm mb-2 font-medium">
                    اسم المستخدم
                  </label>
                  <input
                    type="text"
                    value={adminUser}
                    onChange={(e) => { setAdminUser(e.target.value); setError(''); }}
                    placeholder="اسم المسؤول"
                    className="w-full px-5 py-3 bg-white/10 border border-gold/30 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 transition-all"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-gold-light/80 text-sm mb-2 font-medium">
                    كلمة المرور
                  </label>
                  <input
                    type="password"
                    value={adminPass}
                    onChange={(e) => { setAdminPass(e.target.value); setError(''); }}
                    placeholder="كلمة المرور"
                    className="w-full px-5 py-3 bg-white/10 border border-gold/30 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 transition-all"
                  />
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-red-400 text-sm text-center"
                  >
                    {error}
                  </motion.p>
                )}

                <button
                  type="submit"
                  className="w-full py-4 rounded-xl text-lg font-bold btn-luxury transition-all"
                >
                  دخول لوحة التحكم
                </button>

                <button
                  type="button"
                  onClick={() => { setShowAdmin(false); setError(''); }}
                  className="w-full text-center text-gold/50 hover:text-gold text-sm transition-colors"
                >
                  ← العودة للدخول العادي
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom decoration */}
        <div className="text-center mt-6">
          <p className="text-white/20 text-xs" style={{ fontFamily: "'Amiri', serif" }}>
            ﴿ اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ ﴾
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default LockScreen;
