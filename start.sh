#!/bin/bash
echo "╔══════════════════════════════════════════╗"
echo "║     المكتبة الدينية الذكية              ║"
echo "║     Smart Religious Library              ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Start backend
echo "📦 بدء تشغيل الخادم الخلفي..."
cd backend && node server.js &
BACKEND_PID=$!

# Start frontend
echo "🎨 بدء تشغيل الواجهة الأمامية..."
cd ../frontend && npm start &
FRONTEND_PID=$!

echo ""
echo "✅ الخادم الخلفي: http://localhost:5000"
echo "✅ الواجهة الأمامية: http://localhost:3000"
echo ""
echo "اضغط Ctrl+C للإيقاف"

wait $BACKEND_PID $FRONTEND_PID
