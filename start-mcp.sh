#!/bin/bash

# Presenton MCP - One-command startup script
# This script starts all required services using Docker Compose

set -e

COMPOSE_FILE="docker-compose-mcp.yml"
PROJECT_DIR="/home/nev3r/projects/presenton/presenton"

cd "$PROJECT_DIR"

echo "============================================================"
echo "  Presenton MCP - Complete Stack Startup"
echo "============================================================"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating template..."
    cat > .env << 'EOF'
# LLM Configuration (Required)
LLM=openai
OPENAI_API_KEY=your_openai_key_here
OPENAI_MODEL=gpt-4

# Image API (Optional but recommended)
PEXELS_API_KEY=your_pexels_key_here

# Database
DATABASE_URL=sqlite:///app_data/presenton.db

# Features
CAN_CHANGE_KEYS=true
EXTENDED_REASONING=false
TOOL_CALLS=true
DISABLE_THINKING=false
WEB_GROUNDING=false
DISABLE_ANONYMOUS_TRACKING=false
EOF
    echo "✅ Created .env template. Please edit it with your API keys."
    echo ""
fi

echo "🔨 Building Docker images..."
docker-compose -f "$COMPOSE_FILE" build

echo ""
echo "🚀 Starting all services..."
docker-compose -f "$COMPOSE_FILE" up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

echo ""
echo "============================================================"
echo "  ✅ All Services Started Successfully!"
echo "============================================================"
echo ""
echo "📊 Service Status:"
docker-compose -f "$COMPOSE_FILE" ps

echo ""
echo "🌐 Access Points:"
echo "  • Presenton Web UI:     http://localhost:5000"
echo "  • Slide Helper API:     http://localhost:5002"
echo "  • MCP Server:           http://localhost:8001"
echo ""
echo "🔍 Health Checks:"
echo "  • Presenton:   curl http://localhost:5000/health"
echo "  • Slide API:   curl http://localhost:5002/health"
echo ""
echo "📋 Available MCP Tools: 12"
echo "  - edit_slide, get_slide, add_slide, move_slide, delete_slide"
echo "  - generate_presentation, list_presentations, get_presentation"
echo "  - export_presentation, update_presentation_bulk"
echo "  - update_presentation_metadata, delete_presentation"
echo ""
echo "📝 View logs:"
echo "  docker-compose -f $COMPOSE_FILE logs -f"
echo ""
echo "🛑 Stop services:"
echo "  docker-compose -f $COMPOSE_FILE down"
echo ""
echo "============================================================"
