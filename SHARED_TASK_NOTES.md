# BibMap - Task Notes

## Project Status: COMPLETE
All PRIMARY GOAL items verified complete - 2025-12-06:
- Backend: 166 tests passing
- Frontend: 178 tests passing

## Completed Features
1. Legend Categories for References/Media
2. "Link to Tagged References" renamed to "Link to References"
3. "Link to References" available when node has tags OR non-default background color
4. References/media interleaved with match reason indicators

## Quick Commands
```bash
# Run backend tests
docker-compose -f docker-compose.test.yml run --rm backend-test

# Run frontend tests
cd frontend && npm run test:run
```

## Architecture Notes
- SQLite database at `data/bibmap.db`
- Frontend: Vite + Vanilla JS, served via nginx
- Backend: FastAPI + SQLAlchemy
- Legend labels stored in `bibmap.metadata.legendLabels` JSON field
- Legend category on references/media stored as hex color (e.g., "#FF5733")
- Match reasons computed at query time, not stored
- Default node color (#3B82F6) excluded from legend matching
