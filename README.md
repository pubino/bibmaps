# BibMaps

Visual Bibliography Mapping for Researchers

## Overview

BibMap is a visual tool designed to help researchers, academics, and students organize and explore their bibliographic references through interactive mind maps.

## Features

- **Visual Mapping** - Create visual maps to organize your research topics and concepts
- **Reference Management** - Import and manage academic references from BibTeX files
- **Smart Tagging** - Tag nodes and references for easy cross-referencing
- **Linked References** - Connect nodes to relevant references automatically based on tags
- **Export & Share** - Export your BibMaps and share published maps with others
- **User Authentication** - Local accounts, Google OAuth, or Azure Easy Auth
- **Role-Based Access** - Admin and standard user roles with ownership controls
- **User Settings** - Customizable themes, defaults, and preferences

## Quick Start

### Using Docker (Recommended)

```bash
# Start the application
docker-compose up --build -d

# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
```

### Local Development

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (in another terminal)
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
# Run all 128 tests in Docker
docker-compose -f docker-compose.test.yml run --rm backend-test

# Or run locally
cd backend && pytest -v
```

## Project Structure

```
├── frontend/     # Frontend application (Vite + Vanilla JS)
├── backend/      # Backend API (FastAPI + SQLite)
├── data/         # SQLite database storage
├── docs/         # Documentation
└── scripts/      # Utility scripts
```

## Documentation

- [Authentication Guide](docs/AUTHENTICATION.md) - Local, Google OAuth, and Azure Easy Auth setup
- [Deployment Guide](docs/DEPLOYMENT.md) - Docker, production, and Azure deployment

## First User Setup

The first user to register automatically becomes an administrator. This admin can:
- Manage all users
- Create/edit/delete any BibMap or reference
- Create global taxonomies (tags)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SECRET_KEY` | JWT signing key | Yes (production) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | No |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | No |

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full list

