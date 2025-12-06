#!/bin/bash
set -e

echo "Running backend tests..."
cd backend
python -m pytest -v --tb=short
cd ..

echo ""
echo "Running frontend tests..."
cd frontend
npm run test:run
cd ..

echo ""
echo "All tests passed!"
