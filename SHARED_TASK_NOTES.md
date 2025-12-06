# BibMap - Task Notes

## Project Status: VERIFIED COMPLETE
All PRIMARY GOAL items verified - 2025-12-06:
- Backend: 171 tests passing
- Frontend: 181 tests passing

## Architecture Verification

The PRIMARY GOAL requirements have been implemented as follows:

### 1. User-wide References/Media/Tags
- All three models have `user_id` FK (not `bibmap_id`)
- They are owned by users, not BibMaps

### 2. BibMap-specific Tag/Category Application
- **Key insight**: The association is computed at runtime, not stored
- Nodes belong to BibMaps and have Tags
- When viewing a Node's references, `get_node_references` filters by matching Tags
- Result: Same Reference can appear in different BibMaps based on Node Tags
- Legend categories also matched at query time via node's `background_color`

### 3. Export Filtering
- `getLinkedReferences()` filters to only references sharing tags with nodes
- `buildTagMappings()` only exports tags used by nodes
- Note: No explicit warning dialog shown to user (minor UX gap)

### 4. Import Duplicate Prevention
- `references.py:103-109` checks for duplicate `bibtex_key`
- Duplicates are skipped with error message

### 5. Test Coverage
- Comprehensive test suites protect all architecture decisions

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
