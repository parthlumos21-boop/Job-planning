#!/bin/bash

echo "=========================================="
echo "  Job Planning System - VPS Deployment"
echo "=========================================="

# 1. Install dependencies for the server
echo ""
echo "📦 Installing server dependencies..."
cd server
npm install --production
cd ..

# 2. Install dependencies for the client and build it
echo ""
echo "📦 Installing client dependencies and building..."
cd client
npm install
npm run build
cd ..

# 3. Stop any existing PM2 process
echo ""
echo "🔄 Stopping existing PM2 process (if any)..."
pm2 stop ecosystem.config.js 2>/dev/null || true
pm2 delete ecosystem.config.js 2>/dev/null || true

# 4. Start the backend with PM2
echo ""
echo "🚀 Starting backend with PM2..."
pm2 start ecosystem.config.js --env production

# 5. Save PM2 list so it restarts on system reboot
pm2 save

echo ""
echo "=========================================="
echo "✅ Deployment complete!"
echo "   Server running on port 4000"
echo "   PM2 process: job-planning-system"
echo "=========================================="
echo ""
echo "Make sure Nginx is configured to proxy /api to port 4000."
echo ""
