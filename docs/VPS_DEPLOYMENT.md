# VPS Deployment

## Runtime

- Node.js 18 or newer
- npm
- MongoDB
- A process manager such as PM2
- Optional reverse proxy: Nginx

## Setup

```bash
cd /var/www/job-planning
npm run install-backend
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set:

- `MONGO_URI`
- `JWT_SECRET`
- `PORT`
- `HOST`

Run the workflow migration once after uploading new code:

```bash
cd backend
npm run migrate:workflow
npm run seed:accounts
```

Start the app:

```bash
npm start
```

The Node server serves both API routes and the frontend on `PORT`.

## PM2

```bash
cd /var/www/job-planning/backend
pm2 start src/server.js --name job-planning
pm2 save
```

Or from the project root:

```bash
pm2 start ecosystem.config.js
pm2 save
```

## Nginx Reverse Proxy

```nginx
server {
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Keep MongoDB backed up before imports or migrations.
