# GeoDetective AI - Deployment Guide

## Prerequisites

- Node.js 18+ (recommend using nvm for isolation)
- MySQL 8.0+
- Nginx (for reverse proxy)

## Server Setup

### 1. Install Node.js with nvm (isolated environment)

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Install and use Node.js 20
nvm install 20
nvm use 20
nvm alias default 20
```

### 2. Clone Repository

```bash
cd /var/www
git clone git@github.com:taranton/geodetective.git
cd geodetective
```

### 3. Setup MySQL Database

```bash
mysql -u root -p
```

```sql
CREATE DATABASE geodetective CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'geodetective'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON geodetective.* TO 'geodetective'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

```bash
mysql -u geodetective -p geodetective < server/db/schema.sql
```

### 4. Configure Server

```bash
cd server
cp .env.example .env
nano .env
```

Edit `.env`:
```
PORT=3050
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_USER=geodetective
DB_PASSWORD=your_secure_password
DB_NAME=geodetective
JWT_SECRET=generate_random_string_here
GEMINI_API_KEY=your_gemini_api_key
CLIENT_URL=https://your-domain.com
ADMIN_PASSWORD=secure_admin_password
```

Generate JWT secret:
```bash
openssl rand -base64 32
```

### 5. Install Dependencies & Build

```bash
# Server dependencies
cd server
npm install

# Frontend dependencies & build
cd ..
npm install
npm run build
```

### 6. Initialize Admin User

```bash
cd server
npx tsx scripts/init-admin.ts
```

### 7. Setup PM2 for Process Management

```bash
npm install -g pm2

# Start server
cd /var/www/geodetective/server
pm2 start npm --name "geodetective-api" -- start

# Save PM2 config
pm2 save
pm2 startup
```

### 8. Nginx Configuration

Create `/etc/nginx/sites-available/geodetective`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Frontend (static files)
    root /var/www/geodetective/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api {
        proxy_pass http://127.0.0.1:3050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Large file uploads for images
        client_max_body_size 50M;
    }
}
```

Enable site:
```bash
ln -s /etc/nginx/sites-available/geodetective /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 9. SSL with Let's Encrypt

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

## Update Deployment

```bash
cd /var/www/geodetective
git pull
npm install
npm run build
cd server
npm install
pm2 restart geodetective-api
```

## Logs

```bash
# PM2 logs
pm2 logs geodetective-api

# Nginx logs
tail -f /var/log/nginx/error.log
```

## Ports

- **3050** - API server (internal, proxied via Nginx)
- **80/443** - Nginx (public)
