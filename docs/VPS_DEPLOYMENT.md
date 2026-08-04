# VPS Deployment Guide (Hostinger)

## Project Structure

```
job-planning/
├── client/          ← React frontend (Vite)
├── server/          ← Node.js backend (Express + MongoDB)
├── backend/         ← Legacy scripts (migrations, seeds)
├── docs/            ← Documentation
├── ecosystem.config.js  ← PM2 config
├── start.sh         ← One-command VPS deployment script
├── start.js         ← Local dev launcher
├── nginx.conf       ← Nginx reverse proxy config
└── package.json     ← Root scripts (dev, build, deploy)
```

## Requirements

- Node.js 18+
- npm
- MongoDB
- PM2 (`npm install -g pm2`)
- Nginx (reverse proxy)

---

## Step 1: Clone from GitHub

```bash
cd /var/www
git clone https://github.com/parthlumos21-boop/Job-planning.git job-planning
cd job-planning
```

## Step 2: Create Environment File

```bash
cp server/.env.example server/.env
nano server/.env
```

Set these values in `server/.env`:
```
PORT=3005
MONGO_URI=mongodb://localhost:27017/job_planning_db
JWT_SECRET=<your-secure-secret-key>
```

## Step 3: Deploy (One Command)

```bash
bash start.sh
```

This will:
1. Install server dependencies
2. Install client dependencies
3. Build the React frontend
4. Start the backend with PM2

## Step 4: Configure Nginx

```bash
sudo cp nginx.conf /etc/nginx/sites-available/job-planning
sudo ln -s /etc/nginx/sites-available/job-planning /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

> **Note:** Edit `nginx.conf` to replace `yourdomain.com` with your actual domain.

---

## PM2 Commands

| Command | Description |
|---------|-------------|
| `pm2 status` | Check if app is running |
| `pm2 logs job-planning-system` | View live logs |
| `pm2 restart job-planning-system` | Restart the app |
| `pm2 stop job-planning-system` | Stop the app |

## Update Deployment (After Git Push)

```bash
cd /var/www/job-planning
git pull origin main
bash start.sh
```

## npm Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | Local development | Runs server + client together |
| `npm run build` | Production build | Builds React frontend |
| `npm start` | PM2 start | Starts server via PM2 |
| `npm run deploy` | Full deploy | Runs `start.sh` |
| `npm run install:all` | Install deps | Installs server + client deps |
