from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
import os

from .database import init_db
from .routers import bibmaps, nodes, connections, taxonomies, references

app = FastAPI(
    title="BibMap & References",
    description="Hybrid bib-mapping and academic reference web application",
    version="1.0.0"
)

# CORS configuration for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers - API routes have priority
app.include_router(bibmaps.router)
app.include_router(nodes.router)
app.include_router(connections.router)
app.include_router(taxonomies.router)
app.include_router(references.router)


@app.on_event("startup")
async def startup_event():
    init_db()


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/api/user")
async def get_current_user(request: Request):
    """Get current user info from Azure Easy Auth headers."""
    user_id = request.headers.get("X-MS-CLIENT-PRINCIPAL-ID")
    user_name = request.headers.get("X-MS-CLIENT-PRINCIPAL-NAME")

    if user_id:
        return {
            "authenticated": True,
            "user_id": user_id,
            "user_name": user_name
        }
    return {"authenticated": False}


# Determine static path for SPA
# In production container, frontend/dist is at /app/frontend/dist
# In development, it may be relative to this file
_static_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if not os.path.exists(_static_path):
    _static_path = "/app/frontend/dist"

# Check if static files exist
_has_static = os.path.exists(_static_path) and os.path.isdir(_static_path)

if _has_static:
    # Mount assets directory
    assets_path = os.path.join(_static_path, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")


# Custom exception handler to serve SPA for non-API 404s
@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request: Request, exc: StarletteHTTPException):
    # For 404s on non-API routes, serve the SPA
    if exc.status_code == 404 and not request.url.path.startswith("/api"):
        if _has_static:
            index_path = os.path.join(_static_path, "index.html")
            if os.path.exists(index_path):
                return FileResponse(index_path)
    # For API routes or other errors, return JSON error
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )


# Root route serves SPA
@app.get("/", response_class=HTMLResponse)
async def serve_root():
    """Serve the SPA index page."""
    if _has_static:
        index_path = os.path.join(_static_path, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
    return HTMLResponse("<h1>BibMap API</h1><p>Frontend not available.</p>")
