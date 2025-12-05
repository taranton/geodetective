# GeoDetective AI Deployment Guide

## Prerequisites

- Node.js 18+
- MySQL 8.0+
- npm or yarn
- Google Gemini API key

## Quick Start (Development)

### 1. Database Setup

```bash
# Connect to MySQL
mysql -u root -p

# Run schema
source server/db/schema.sql;
```

### 2. Server Setup

```bash
cd server

# Copy and edit environment
cp .env.example .env
# Edit .env with your MySQL credentials and Gemini API key

# Install dependencies
npm install

# Initialize admin user
npx tsx scripts/init-admin.ts

# Start server
npm run dev
```

### 3. Client Setup

```bash
# From project root
npm install
npm run dev
```

### 4. Access Application

- Frontend: http://localhost:3000
- API: http://localhost:3001/api
- Default admin: `admin` / `admin123`

---

## Production Deployment

### 1. Build Client

```bash
npm run build
```

This creates `dist/` folder with static files.

### 2. Configure Server

```bash
cd server

# Production environment
cat > .env << EOF
PORT=3001
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_USER=geodetective_user
DB_PASSWORD=strong_password_here
DB_NAME=geodetective
JWT_SECRET=$(openssl rand -base64 32)
GEMINI_API_KEY=your_gemini_api_key
CLIENT_URL=https://yourdomain.com
EOF
```

### 3. Run with PM2

```bash
# Install PM2
npm install -g pm2

# Build server
npm run build

# Start with PM2
pm2 start dist/index.js --name geodetective-api

# Save PM2 config
pm2 save
pm2 startup
```

### 4. Configure Nginx

See `docs/NGINX_SETUP.md` for detailed Nginx configuration.

---

## Environment Variables

### Server (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3001 |
| `NODE_ENV` | Environment | development |
| `DB_HOST` | MySQL host | localhost |
| `DB_PORT` | MySQL port | 3306 |
| `DB_USER` | MySQL user | root |
| `DB_PASSWORD` | MySQL password | - |
| `DB_NAME` | Database name | geodetective |
| `JWT_SECRET` | JWT signing secret | - |
| `GEMINI_API_KEY` | Google Gemini API key | - |
| `CLIENT_URL` | Frontend URL for CORS | http://localhost:3000 |

### Client

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | http://localhost:3001/api |

---

## Commands Reference

### Server

```bash
npm run dev      # Development with hot reload
npm run build    # TypeScript compilation
npm run start    # Run compiled JS
```

### Client

```bash
npm run dev      # Development server
npm run build    # Production build
npm run preview  # Preview production build
```

---

## Troubleshooting

### Database Connection Failed

1. Check MySQL is running: `sudo systemctl status mysql`
2. Verify credentials in `.env`
3. Ensure database exists: `CREATE DATABASE geodetective;`

### API Returns 401

1. Token might be expired - logout and login again
2. Check `JWT_SECRET` hasn't changed

### CORS Errors

1. Verify `CLIENT_URL` in server `.env` matches actual frontend URL
2. Check Nginx is not stripping headers

### Analysis Timeout

1. Increase `proxy_read_timeout` in Nginx
2. Check Gemini API quotas
