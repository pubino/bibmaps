# BibMap Deployment Guide

This guide covers deploying BibMap in different environments.

## Table of Contents

- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Production Deployment](#production-deployment)
- [Azure Container Apps](#azure-container-apps)
- [Environment Variables](#environment-variables)
- [Database Management](#database-management)

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 20+
- SQLite 3

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run the backend
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:5173` and will proxy API requests to the backend.

### Running Tests

```bash
# Backend tests
cd backend
pytest -v

# Or use Docker for isolated testing
docker-compose -f docker-compose.test.yml run --rm backend-test
```

## Docker Deployment

### Docker Compose (Recommended for Development)

This runs the frontend and backend as separate containers:

```bash
# Start all services
docker-compose up --build -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

Services:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

### Single Container Deployment

For simpler deployments, use the combined Dockerfile in the project root:

```bash
# Build the image
docker build -t bibmap .

# Run the container
docker run -d \
  -p 8000:8000 \
  -v $(pwd)/data:/data \
  -e SECRET_KEY=your-secret-key \
  bibmap
```

The application will be available at http://localhost:8000

## Production Deployment

### Security Checklist

Before deploying to production:

1. **Set a strong SECRET_KEY** - Generate a random key:
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

2. **Enable HTTPS** - Use a reverse proxy (nginx, Traefik) or cloud load balancer

3. **Configure CORS** - Update `backend/app/main.py` if needed for your domain

4. **Set up database backups** - Create regular SQLite backups:
   ```bash
   sqlite3 /data/bibmap.db ".backup /backup/bibmap-$(date +%Y%m%d).db"
   ```

5. **Enable logging** - Set `LOG_LEVEL=INFO` or `LOG_LEVEL=WARNING`

### Reverse Proxy Configuration (nginx)

If running behind nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name bibmap.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Azure Container Apps

### Quick Deployment

1. **Build and push the Docker image:**
   ```bash
   # Login to Azure Container Registry
   az acr login --name <your-acr-name>

   # Build and push
   docker build -t <your-acr-name>.azurecr.io/bibmap:latest .
   docker push <your-acr-name>.azurecr.io/bibmap:latest
   ```

2. **Create the Container App:**
   ```bash
   az containerapp create \
     --name bibmap \
     --resource-group <your-rg> \
     --environment <your-environment> \
     --image <your-acr-name>.azurecr.io/bibmap:latest \
     --target-port 8000 \
     --ingress external \
     --min-replicas 1 \
     --max-replicas 3 \
     --secrets "secret-key=<your-secret-key>" \
     --env-vars "SECRET_KEY=secretref:secret-key"
   ```

3. **Configure persistent storage for SQLite:**
   ```bash
   az containerapp storage mount \
     --name bibmap \
     --resource-group <your-rg> \
     --path /data \
     --account-name <storage-account> \
     --share-name bibmap-data \
     --access-mode ReadWrite
   ```

### Azure Easy Auth Configuration

To use Azure Active Directory for authentication:

1. Go to your Container App in Azure Portal
2. Navigate to **Authentication**
3. Click **Add identity provider**
4. Select **Microsoft**
5. Configure the following:
   - Application (client) ID: Create or select an app registration
   - Client secret: Create a secret for the app registration
   - Allowed token audiences: Your app URL
6. Save the configuration

When Easy Auth is enabled, Azure passes authentication headers to your app:
- `X-MS-CLIENT-PRINCIPAL-ID`: User's unique ID
- `X-MS-CLIENT-PRINCIPAL-NAME`: User's display name

BibMap automatically reads these headers and authenticates users.

### Google OAuth on Azure

To enable Google OAuth alongside Azure Easy Auth:

1. Create OAuth credentials at [Google Cloud Console](https://console.cloud.google.com)
2. Set the redirect URI to: `https://your-app.azurecontainerapps.io/api/auth/google/callback`
3. Add environment variables to your Container App:
   ```bash
   az containerapp update \
     --name bibmap \
     --resource-group <your-rg> \
     --secrets "google-client-id=<your-id>" "google-client-secret=<your-secret>" \
     --env-vars \
       "GOOGLE_CLIENT_ID=secretref:google-client-id" \
       "GOOGLE_CLIENT_SECRET=secretref:google-client-secret" \
       "GOOGLE_REDIRECT_URI=https://your-app.azurecontainerapps.io/api/auth/google/callback"
   ```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | JWT signing key (change in production!) | `dev-secret-key-change-in-production` |
| `DATABASE_URL` | SQLite database path | `sqlite:////data/bibmap.db` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiration in minutes | `1440` (24 hours) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | - |
| `GOOGLE_REDIRECT_URI` | Google OAuth callback URL | `http://localhost:8000/api/auth/google/callback` |
| `LOG_LEVEL` | Logging verbosity | `INFO` |

## Database Management

### Migrations

If upgrading from an older version, run the migration script:

```bash
# Backs up the database automatically before migrating
python scripts/migrate_user_ids.py --db-path data/bibmap.db
```

### Backup and Restore

```bash
# Backup
cp data/bibmap.db data/bibmap-backup-$(date +%Y%m%d).db

# Or use SQLite's backup command (works even if DB is in use)
sqlite3 data/bibmap.db ".backup data/bibmap-backup.db"

# Restore
cp data/bibmap-backup.db data/bibmap.db
```

### Using PostgreSQL (Optional)

For production deployments with high traffic, consider PostgreSQL:

1. Update `DATABASE_URL`:
   ```bash
   DATABASE_URL=postgresql://user:password@host:5432/bibmap
   ```

2. Install the PostgreSQL driver:
   ```bash
   pip install psycopg2-binary
   ```

Note: SQLite works well for small to medium deployments (hundreds of users).

## Troubleshooting

### Container won't start

1. Check logs: `docker logs <container-id>`
2. Verify the data directory is writable
3. Ensure SECRET_KEY is set

### Database errors

1. Check file permissions on `/data/bibmap.db`
2. Run migrations if upgrading: `python scripts/migrate_user_ids.py`
3. Verify SQLite is not corrupted: `sqlite3 data/bibmap.db "PRAGMA integrity_check;"`

### Authentication issues

1. Verify SECRET_KEY matches between restarts
2. Check token expiration settings
3. For Google OAuth: verify redirect URI matches exactly
4. For Azure Easy Auth: check headers are being passed through

### Performance issues

1. Enable connection pooling for high traffic
2. Consider PostgreSQL for > 1000 concurrent users
3. Add caching layer (Redis) if needed
