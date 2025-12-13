#!/bin/bash

# Automaker - Development Environment Setup and Launch Script

set -e  # Exit on error

echo "╔═══════════════════════════════════════════════════════╗"
echo "║        Automaker Development Environment              ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}Installing dependencies...${NC}"
    npm install
fi

# Install Playwright browsers if needed
echo -e "${YELLOW}Checking Playwright browsers...${NC}"
npx playwright install chromium 2>/dev/null || true

# Kill any existing processes on required ports
echo -e "${YELLOW}Checking for processes on ports 3007 and 3008...${NC}"
lsof -ti:3007 | xargs kill -9 2>/dev/null || true
lsof -ti:3008 | xargs kill -9 2>/dev/null || true

# Start the backend server
echo -e "${BLUE}Starting backend server on port 3008...${NC}"
npm run dev:server > logs/server.log 2>&1 &
SERVER_PID=$!

echo -e "${YELLOW}Waiting for server to be ready...${NC}"

# Wait for server health check
MAX_RETRIES=30
RETRY_COUNT=0
SERVER_READY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:3008/api/health > /dev/null 2>&1; then
        SERVER_READY=true
        break
    fi
    sleep 1
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
done

echo ""

if [ "$SERVER_READY" = false ]; then
    echo -e "${RED}Error: Server failed to start${NC}"
    echo "Check logs/server.log for details"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi

echo -e "${GREEN}✓ Server is ready!${NC}"
echo ""

# Prompt user for application mode
echo "═══════════════════════════════════════════════════════"
echo "  Select Application Mode:"
echo "═══════════════════════════════════════════════════════"
echo "  1) Web Application (Browser)"
echo "  2) Desktop Application (Electron)"
echo "═══════════════════════════════════════════════════════"
echo ""

while true; do
    read -p "Enter your choice (1 or 2): " choice
    case $choice in
        1)
            echo ""
            echo -e "${BLUE}Launching Web Application...${NC}"
            echo "The application will be available at: ${GREEN}http://localhost:3007${NC}"
            echo ""
            npm run dev:web
            break
            ;;
        2)
            echo ""
            echo -e "${BLUE}Launching Desktop Application...${NC}"
            npm run dev:electron
            break
            ;;
        *)
            echo -e "${RED}Invalid choice. Please enter 1 or 2.${NC}"
            ;;
    esac
done

# Cleanup on exit
trap "echo 'Cleaning up...'; kill $SERVER_PID 2>/dev/null || true; exit" INT TERM EXIT
