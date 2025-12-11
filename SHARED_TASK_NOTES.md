# BibMap - Task Notes

## Project Status: PRODUCTION SECURITY REFACTOR COMPLETE ✓
All PRIMARY GOAL items implemented and verified - 2025-12-11:
- Backend: 171 tests passing (verified)
- Frontend: 299 tests passing (verified)

## Production Security Features Implemented

### Goal 1: Authentication Required for Content Creation
- Added `get_current_user_for_write` dependency in `backend/app/auth.py:342-358`
- When `AZURE_EASY_AUTH_ENABLED=true`, all write operations require authentication
- Affected routers: bibmaps, references, media, taxonomies, nodes, connections
- Returns 401 if anonymous user attempts to create/modify content in production

### Goal 2: Profile Button Hidden in Production
- Added `profile_enabled` flag to auth-methods endpoint (`backend/app/routers/auth.py:72`)
- Frontend respects `authMethods.profile_enabled` in `updateAuthUI()` (`frontend/src/main.js:228`)
- Profile and Settings navigation hidden when in production mode

### Goal 3: Azure SQL Support with Migrations
- Updated `backend/app/database.py` to support MSSQL connection strings
- Added `alembic` and `pyodbc` packages to requirements.txt
- Created Alembic migration framework in `backend/alembic/`
- Initial migration: `backend/alembic/versions/20241211_0001_initial_schema.py`
- Added `drop_db()` function for teardown support

### Goal 4: Microsoft-Only Sign-In in Production
- Implemented via auth-methods logic
- When `AZURE_EASY_AUTH_ENABLED=true`:
  - `local_login: false` - hides username/password form
  - `google_oauth: false` - hides Google OAuth button
  - `azure_easy_auth: true` - shows Microsoft sign-in button only

### Goal 5: Deployment Script Handles Setup and Teardown
- `scripts/deploy-azure.sh` - main deployment script
- `--destroy` flag for teardown (deletes resource group and optionally Entra ID app)
- `--update` flag for updating existing deployment
- `--dry-run` flag to preview changes
- Step 8 sets `AZURE_EASY_AUTH_ENABLED=true` when Entra ID is configured

## Quick Commands
```bash
# Run backend tests
docker-compose -f docker-compose.test.yml run --rm backend-test

# Run frontend tests
cd frontend && npm run test:run

# Deploy to Azure (interactive)
./scripts/deploy-azure.sh

# Update existing deployment
./scripts/deploy-azure.sh --update

# Teardown Azure resources
./scripts/deploy-azure.sh --destroy

# Run Alembic migrations (for Azure SQL)
cd backend && alembic upgrade head

# Rollback migrations (teardown)
cd backend && alembic downgrade base
```

## Environment Variables for Production
```bash
# Enable production mode (triggers all security features)
AZURE_EASY_AUTH_ENABLED=true

# Azure SQL connection string format
DATABASE_URL=mssql+pyodbc://user:password@server/database?driver=ODBC+Driver+18+for+SQL+Server
```

## Architecture Notes
- SQLite database at `data/bibmap.db` (local dev)
- Azure SQL supported via pyodbc driver (production)
- Frontend: Vite + Vanilla JS, served via nginx
- Backend: FastAPI + SQLAlchemy
- Production mode controlled by `AZURE_EASY_AUTH_ENABLED` env var
