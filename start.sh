#!/bin/bash
set -e

MM_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$MM_DIR/backend"
FRONTEND_DIR="$MM_DIR/frontend"

echo "================================================"
echo "  MM&RJD Attendance Report Automation"
echo "================================================"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed. Please install Python 3.11+ first."
    exit 1
fi

# Check Node
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Install Python dependencies
echo "[1/4] Installing Python dependencies..."
cd "$BACKEND_DIR"
pip install -r requirements.txt --quiet 2>/dev/null || pip3 install -r requirements.txt --quiet 2>/dev/null || true

# Install Node dependencies
echo "[2/4] Installing Node.js dependencies..."
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    npm install --quiet 2>/dev/null || true
fi

# Start backend
echo "[3/4] Starting backend API on http://127.0.0.1:8000..."
cd "$BACKEND_DIR"
nohup python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 > "$MM_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

# Wait for backend to be ready
echo "   Waiting for backend to start..."
for i in $(seq 1 30); do
    if curl -s http://127.0.0.1:8000/api/health > /dev/null 2>&1; then
        echo "   Backend is ready."
        break
    fi
    sleep 1
done

if ! curl -s http://127.0.0.1:8000/api/health > /dev/null 2>&1; then
    echo "   WARNING: Backend may not be ready yet. Check backend.log"
fi

# Start frontend
echo "[4/4] Starting frontend on http://localhost:3000..."
cd "$FRONTEND_DIR"
nohup npx next dev -p 3000 > "$MM_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

echo ""
echo "================================================"
echo "  MM&RJD Attendance Report Automation is running!"
echo "================================================"
echo ""
echo "  Frontend (browser):  http://localhost:3000"
echo "  Backend API:         http://127.0.0.1:8000"
echo "  API docs:            http://127.0.0.1:8000/docs"
echo ""
echo "  Backend PID: $BACKEND_PID"
echo "  Frontend PID: $FRONTEND_PID"
echo ""
echo "  Logs:"
echo "    Backend:  $MM_DIR/backend.log"
echo "    Frontend: $MM_DIR/frontend.log"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo ""

# Wait for user to stop
trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo "Servers stopped."; exit 0' INT TERM
wait
