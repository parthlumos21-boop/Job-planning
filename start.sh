#!/bin/bash

echo "=========================================="
echo "  Job Planning System - VPS Deployment"
echo "=========================================="

# 1. Install server dependencies
echo ""
echo "📦 Installing server dependencies..."
cd server
npm install --production
cd ..

# 2. Install client dependencies and build
echo ""
echo "📦 Installing client dependencies and building..."
cd client
npm install
npm run build
cd ..

# 3. Start the server
echo ""
echo "🚀 Starting server..."

# Check if PM2 is available
if command -v pm2 &> /dev/null; then
    echo "Using PM2..."
    pm2 stop ecosystem.config.js 2>/dev/null || true
    pm2 delete ecosystem.config.js 2>/dev/null || true
    pm2 start ecosystem.config.js --env production
    pm2 save
    echo "✅ Started with PM2"
else
    echo "PM2 not found, starting with node directly..."
    cd server
    node server.js &
    cd ..
    echo "✅ Started with node"
fi

echo ""
echo "=========================================="
echo "✅ Deployment complete!"
echo "   Server running on port 3005"
echo "=========================================="
