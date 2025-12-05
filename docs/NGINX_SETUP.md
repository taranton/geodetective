# Nginx Configuration for GeoDetective AI

## Basic Setup

Create a new Nginx site configuration:

```bash
sudo nano /etc/nginx/sites-available/geodetective
```

## Configuration Example

```nginx
server {
    listen 80;
    server_name geodetective.yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name geodetective.yourdomain.com;

    # SSL certificates (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/geodetective.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/geodetective.yourdomain.com/privkey.pem;

    # Frontend (React app built with Vite)
    location / {
        root /var/www/geodetective/dist;
        try_files $uri $uri/ /index.html;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Increase timeout for long AI analysis requests
        proxy_read_timeout 120s;
        proxy_connect_timeout 120s;

        # Increase body size limit for image uploads
        client_max_body_size 50M;
    }
}
```

## Enable the site

```bash
sudo ln -s /etc/nginx/sites-available/geodetective /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d geodetective.yourdomain.com
```

## Production Notes

1. **Client URL**: Update `CLIENT_URL` in server `.env` to match your domain
2. **API URL**: Update `VITE_API_URL` in client build or use relative path `/api`
3. **JWT Secret**: Generate a strong random secret for production
4. **Database**: Use a strong password and consider remote MySQL or managed DB
