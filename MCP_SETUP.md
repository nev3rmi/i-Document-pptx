# Presenton MCP Setup Guide

Complete Docker Compose setup for Presenton with MCP (Model Context Protocol) integration.

## Architecture

The system consists of **2 Docker containers**:

1. **presenton** - Main application (Frontend + Backend API)
   - Port: 5000 → 80 (internal)
   - Next.js frontend + Flask/FastAPI backend
   - Handles presentation generation, editing, export

2. **mcp-services** - MCP integration services
   - Port 5002: Slide Helper API (token-efficient slide operations)
   - Port 8001: MCP Server (12 essential tools for AI agents)
   - Depends on presenton container

## Quick Start

### 1. Start All Services

```bash
cd /home/nev3r/projects/presenton/presenton
docker-compose -f docker-compose-mcp.yml up -d
```

### 2. Check Status

```bash
docker-compose -f docker-compose-mcp.yml ps
```

Expected output:
```
NAME              STATUS    PORTS
presenton         Up        0.0.0.0:5000->80/tcp
presenton-mcp     Up        0.0.0.0:5002->5002/tcp, 0.0.0.0:8001->8001/tcp
```

### 3. View Logs

```bash
# All services
docker-compose -f docker-compose-mcp.yml logs -f

# Presenton only
docker-compose -f docker-compose-mcp.yml logs -f presenton

# MCP services only
docker-compose -f docker-compose-mcp.yml logs -f mcp-services
```

### 4. Test Services

```bash
# Test Presenton API
curl http://localhost:5000/health

# Test Slide Helper API
curl http://localhost:5002/health

# Test MCP Server (list tools)
curl http://localhost:8001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

## Stop Services

```bash
# Stop all containers
docker-compose -f docker-compose-mcp.yml down

# Stop and remove volumes
docker-compose -f docker-compose-mcp.yml down -v
```

## Rebuild After Changes

```bash
# Rebuild MCP services after code changes
docker-compose -f docker-compose-mcp.yml build mcp-services
docker-compose -f docker-compose-mcp.yml up -d mcp-services

# Rebuild everything
docker-compose -f docker-compose-mcp.yml build
docker-compose -f docker-compose-mcp.yml up -d
```

## Service Details

### Presenton (Port 5000)
- Frontend: Next.js web interface
- Backend: Flask/FastAPI for AI operations
- Database: SQLite (stored in app_data volume)
- Features: Generate, edit, export presentations

### Slide Helper API (Port 5002)
Token-efficient slide operations:
- `GET /api/v1/ppt/slide/{id}` - Get single slide
- `POST /api/v1/ppt/slide` - Add new slide
- `PATCH /api/v1/ppt/slide/move` - Move slide position
- `DELETE /api/v1/ppt/slide/{id}` - Delete slide
- `GET /health` - Health check

### MCP Server (Port 8001)
12 essential tools for AI agents:

**Primary Tools:**
- `edit_slide` - AI-powered slide editing
- `get_slide` - Token-efficient slide retrieval
- `add_slide` - Add new slide
- `move_slide` - Reorder slides
- `delete_slide` - Remove slide

**Presentation Management:**
- `list_presentations` - List all presentations
- `get_presentation` - Get full presentation
- `generate_presentation` - Create from topic
- `delete_presentation` - Delete presentation

**Advanced:**
- `edit_slide_html` - HTML/CSS styling
- `update_presentation_bulk` - Bulk updates
- `update_presentation_metadata` - Update metadata

**Export:**
- `export_presentation` - Export to PPTX/PDF

## Environment Variables

Create a `.env` file in the presenton directory:

```bash
# LLM Configuration
LLM=openai  # or: google, anthropic, ollama, custom
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4

# Optional: Other LLM providers
GOOGLE_API_KEY=
GOOGLE_MODEL=gemini-pro
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-sonnet
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# Image API
PEXELS_API_KEY=your_pexels_key

# Features
EXTENDED_REASONING=false
TOOL_CALLS=true
DISABLE_THINKING=false
WEB_GROUNDING=false
DISABLE_ANONYMOUS_TRACKING=false

# Database
DATABASE_URL=sqlite:///app_data/presenton.db

# Security
CAN_CHANGE_KEYS=true
```

## Networking

All services run in the `presenton-network` bridge network:
- Containers can communicate using service names (e.g., `http://presenton:80`)
- External access via published ports (5000, 5002, 8001)

## Health Checks

The compose file includes health checks:
- **presenton**: Waits for Flask API to respond
- **mcp-services**: Depends on presenton being healthy before starting

## Troubleshooting

### Services won't start
```bash
# Check logs
docker-compose -f docker-compose-mcp.yml logs

# Check if ports are already in use
lsof -i :5000 -i :5002 -i :8001

# Force recreate
docker-compose -f docker-compose-mcp.yml up -d --force-recreate
```

### MCP Server can't connect to Presenton
```bash
# Check network
docker network ls
docker network inspect presenton-network

# Verify presenton is healthy
docker-compose -f docker-compose-mcp.yml ps
curl http://localhost:5000/health
```

### Code changes not reflecting
```bash
# Rebuild and restart
docker-compose -f docker-compose-mcp.yml build --no-cache mcp-services
docker-compose -f docker-compose-mcp.yml up -d mcp-services
```

## File Structure

```
presenton/
├── docker-compose-mcp.yml          # MCP-enabled compose file
├── docker-compose.yml              # Original compose file
├── Dockerfile                      # Main app dockerfile
├── .env                            # Environment variables
├── app_data/                       # Data volume
└── servers/
    └── fastapi/
        ├── Dockerfile              # MCP services dockerfile
        ├── requirements.txt        # Python dependencies
        ├── slide_helper_api.py     # Slide operations API
        ├── mcp_server.py           # MCP server
        └── openapi_spec.json       # API specification
```

## Production Deployment

For production, update the compose file to:
1. Use pre-built images from container registry
2. Add resource limits
3. Configure proper logging
4. Set up SSL/TLS termination
5. Use external database (PostgreSQL)
6. Add monitoring (Prometheus, Grafana)

Example resource limits:
```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
    reservations:
      cpus: '1'
      memory: 512M
```

## Integration with Claude Code

To use with Claude Code MCP:

1. Start all services: `docker-compose -f docker-compose-mcp.yml up -d`
2. In Claude Code, connect to: `http://localhost:8001`
3. The MCP server will expose 12 tools for presentation management

## Support

For issues or questions:
- GitHub: https://github.com/presenton/presenton
- Documentation: Check project README.md
