# Product Traceability Deployment

**Author:** Manus AI  
**Proposed host:** `trace.lummiincolour.com.au`

The product traceability service runs as two Docker Compose services and shares the existing `/data/lic/LIC_DB.db` database through `DB_PATH`.

| Service | Container port | Local host binding |
|---|---:|---:|
| `traceability-backend` | 3004 | `127.0.0.1:3004` |
| `traceability-frontend` | 80 | `127.0.0.1:8084` |

## Server environment

Create `traceability-backend/.env` on the server. Do not commit it.

```dotenv
NODE_ENV=production
PORT=3004
DB_PATH=/data/lic/LIC_DB.db
FRONTEND_URL=https://trace.lummiincolour.com.au
SUPPORT_EMAIL=admin@lummiincolour.com.au
TRACEABILITY_PUBLIC_URL=https://trace.lummiincolour.com.au
TRACEABILITY_ANALYTICS_SALT=<long-random-secret>
PUBLIC_RATE_LIMIT_MAX=60
PUBLIC_RATE_LIMIT_WINDOW_MS=60000
```

Before the public DNS record exists, the containers can be built and verified through `http://127.0.0.1:8084` on the server. The Platform card links to the authenticated management page and does not depend on public DNS.

## DNS and HTTPS activation

When the public site is ready to be enabled:

1. Add an **A record** named `trace` pointing to the server's public IPv4 address.
2. Copy `deployment/nginx/trace.lummiincolour.com.au.conf.example` to the server's enabled Nginx configuration.
3. Test and reload Nginx.
4. Issue the TLS certificate with Certbot after DNS propagation.

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d trace.lummiincolour.com.au
```

## Build and health checks

```bash
docker compose build traceability-backend traceability-frontend platform-backend platform-frontend
docker compose up -d traceability-backend traceability-frontend platform-backend platform-frontend
curl http://127.0.0.1:3004/api/health
curl -I http://127.0.0.1:8084/
```

The Platform backend initializes the traceability tables and the Product Traceability system entry idempotently on startup.
