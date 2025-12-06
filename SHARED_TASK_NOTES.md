# BibMap - Task Notes

## Current State
All 144 tests pass (14 new media tests added). Media section, tagged media display, and auth toggle have been implemented.

## Quick Commands
```bash
# Start development environment
docker-compose up --build -d

# Run all tests (144 tests)
docker-compose -f docker-compose.test.yml run --rm backend-test

# Run database migration (backs up DB first)
python scripts/migrate_user_ids.py --db-path data/bibmap.db
```

## Recently Completed
- **Media section** - Users can add link/title pairs with optional descriptions and tag support
  - New `Media` model and `media_taxonomies` association table
  - Full CRUD API at `/api/media`
  - Frontend section with filtering, sorting, and pagination
  - Media can be tagged like references
- **Tagged media on node pages** - Node references page now shows both references AND media that share the node's tags
  - Added `/api/nodes/{id}/media` endpoint
  - Node page displays "References (n)" and "Media (n)" sections
- **Login/Logout toggle** - Auth button is now a true toggle (only Login or Logout shows, never both)

## Remaining Work
The original goals have been completed:
- ✅ Connector attachment points
- ✅ Media section with link/title pairs and tagging
- ✅ Tagged media display inline with references
- ✅ Login/Logout button toggle
- ✅ Rate limiting for production (was already implemented)

## Key Files Modified (Media Feature)
- `backend/app/models/models.py` - Added Media model and media_taxonomies table
- `backend/app/schemas.py` - Added MediaBase, MediaCreate, MediaUpdate, Media schemas
- `backend/app/routers/media.py` - New router with CRUD endpoints
- `backend/app/routers/nodes.py` - Added `/api/nodes/{id}/media` endpoint
- `frontend/src/services/api.js` - Added media API methods
- `frontend/src/main.js` - Added media section UI logic
- `frontend/index.html` - Added media section and modal
- `backend/tests/test_media.py` - New test file with 14 tests

## Architecture Notes
- SQLite database at `data/bibmap.db`
- Frontend: Vite + Vanilla JS, served via nginx
- Backend: FastAPI + SQLAlchemy
- Auth: Bearer token, HTTP-only cookie, or Azure Easy Auth headers
- First user becomes admin
- Dark theme support through CSS variables
- Rate limiting: Set `RATE_LIMIT_ENABLED=true` in production
