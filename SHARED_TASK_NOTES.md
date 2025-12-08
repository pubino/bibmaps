# BibMap - Task Notes

## Project Status: HTML EXPORT FEATURE COMPLETE ✓
All PRIMARY GOAL items verified complete - 2025-12-08:
- Backend: 171 tests passing
- Frontend: 277 tests passing (96 tests for HTML export)
- CI test suite integration confirmed working

## HTML Export Feature Implementation

### What was implemented:
1. **Export HTML button** - Added next to Copy Link button in editor toolbar
2. **Self-contained HTML export** - ZIP file containing:
   - `index.html` - Main BibMap canvas view with D3.js rendering
   - `styles.css` - Complete styling for offline viewing
   - `app.js` - Canvas rendering, zoom/pan, node interaction
   - `references/{nodeId}.html` - Reference list pages for nodes with `link_to_references`
   - `references/{bibtexKey}.html` - Individual reference detail pages
3. **Relative links** - All links use relative paths for portable re-hosting
4. **Legend support** - Exports legend if enabled in BibMap settings
5. **Full visual fidelity** - Node styles (flat/bevel/emboss/outline), shapes, connections preserved

### Key files:
- `frontend/src/services/htmlExport.js` - HTML/CSS/JS generation module
- `frontend/src/services/htmlExport.test.js` - 96 comprehensive tests
- `frontend/index.html:91-93` - Export HTML button
- `frontend/src/main.js:1242-1313` - `exportBibMapAsHtml()` function
- `frontend/src/main.js:2619-2623` - Button event listener

### Usage:
1. Open a BibMap in the editor
2. Click the package icon (📦) next to Copy Link
3. Downloads `{bibmap_title}_html_export.zip`
4. Extract and open `index.html` in any browser

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
- Legend labels stored in `bibmap.settings_json` JSON field
- Node-to-reference linking computed at runtime via shared tags
- Default node color (#3B82F6) excluded from legend matching
