# BibMap - Task Notes

## Current State
All primary goals from the initial task list are now **complete**. The app is fully functional with publishing, preview mode, and link-to-references features.

## Completed Features (This Iteration)
- **Published/Unpublished status**: Mind maps now have `is_published` boolean field
- **Publish toggle**: Checkbox in editor toolbar to publish/unpublish maps
- **Copy link button**: Appears when map is published; copies shareable URL to clipboard
- **Preview mode**: Button in toolbar to view map as read-only (hides edit controls)
- **Link Node to References toggle**: Checkbox in node properties panel (default enabled) with "View All References" button that opens a modal with aggregated references

## Key Implementation Details

### Publishing System
- Backend: `MindMap.is_published` field in `backend/app/models/models.py:30`
- Endpoints: `/api/mindmaps/{id}/publish`, `/api/mindmaps/{id}/unpublish`, `/api/mindmaps/public/{id}`
- Public endpoint allows unauthenticated access to published maps only

### Preview Mode
- Frontend-only feature in `frontend/src/main.js` functions `enterPreviewMode()` and `exitPreviewMode()`
- Hides edit controls (Add Node, Connect, Publish toggle)
- Sets canvas to read-only mode via `mindmapCanvas.setReadOnly(true)`

### Link Node to References
- Backend: `Node.link_to_references` field in `backend/app/models/models.py:58`
- Frontend: Toggle in properties panel, "View All References" button opens `node-refs-modal`
- References are fetched via existing `/api/nodes/{id}/references` endpoint

## Quick Commands
```bash
# Local dev (hot reload)
docker-compose up --build

# Production image
docker build -t bibmap .
docker run -p 8000:8000 -v ./data:/data bibmap

# Run tests
docker-compose -f docker-compose.test.yml run --rm backend-test
docker-compose -f docker-compose.test.yml run --rm frontend-test
```

## Remaining Work
No remaining tasks from the primary goal list. All features have been implemented.

Potential future enhancements (not in original scope):
- Actual shareable URL route (e.g., `/share/{id}`) that renders the public view
- Email/social sharing options
- User authentication improvements
