Fullstack Todo – Docker

Quick Start

Development

- Start: `docker-compose up -d --build`
- Open: `http://localhost`
- Logs: `docker-compose logs -f`

Production

- Start: `docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
- Update service: `docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps backend`

Health

- Edge: `curl http://localhost/health`
- API: `curl http://localhost/api/health`

Services

- Frontend: React (Vite) served by nginx on port 80 (container)
- Backend: Node.js/Express on port 3000
- MongoDB: 27017 with `mongo-init.js` seed
- Redis: 6379
- Edge Nginx: reverse proxy on 80/443

Env Files

- `.env` (dev), `.env.production` (prod)
- Keys: `NODE_ENV`, `PORT`, `MONGODB_URI`, `REDIS_URL`, `CORS_ORIGIN`, `MAX_FILE_SIZE`, `UPLOAD_DIR`, `LOG_LEVEL`, `ENABLE_ANALYTICS`, `ENABLE_FILE_UPLOAD`, `JWT_SECRET`

Uploads

- Served via `/uploads/*` through edge proxy

Monitoring (optional)

- `docker-compose -f docker-compose.monitoring.yml up -d`
