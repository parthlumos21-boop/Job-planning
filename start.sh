#!/bin/bash

echo "Starting deployment process..."

# 1. Install dependencies for the server
echo "Installing server dependencies..."
cd server
npm install
cd ..

# 2. Install dependencies for the client and build it
echo "Installing client dependencies and building..."
cd client
npm install
npm run build
cd ..

# 3. Start the backend with PM2
echo "Starting backend with PM2..."
pm2 start ecosystem.config.js --env production

# 4. Save the PM2 list so it restarts on system reboot (optional but recommended)
pm2 save

echo "Deployment complete! Make sure Nginx is configured to serve client/dist and proxy /api to port 4000."
