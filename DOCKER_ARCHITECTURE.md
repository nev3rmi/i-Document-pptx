# Presenton MCP - Docker Architecture

## Complete System with 2 Containers

```
┌─────────────────────────────────────────────────────────────────┐
│                     Docker Compose Setup                        │
│                  (docker-compose-mcp.yml)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ├───────────────────┬──────────────────
                              │                   │
                              ▼                   ▼
        ┌─────────────────────────────┐  ┌──────────────────────────────┐
        │  Container 1: presenton     │  │  Container 2: mcp-services   │
        │  ────────────────────────   │  │  ─────────────────────────   │
        │                             │  │                              │
        │  Port 5000 → 80 (internal) │  │  Port 5002 (Slide Helper)   │
        │                             │  │  Port 8001 (MCP Server)     │
        │  ┌───────────────────────┐ │  │                              │
        │  │   Next.js Frontend    │ │  │  ┌────────────────────────┐ │
        │  │   (Presentation UI)   │ │  │  │  Slide Helper API      │ │
        │  └───────────────────────┘ │  │  │  ──────────────────    │ │
        │                             │  │  │  - get_slide           │ │
        │  ┌───────────────────────┐ │  │  │  - add_slide           │ │
        │  │   Flask Backend API   │ │  │  │  - move_slide          │ │
        │  │   ─────────────────   │ │  │  │  - delete_slide        │ │
        │  │  - Generate PPTs      │ │  │  └────────────────────────┘ │
        │  │  - Edit slides (AI)   │ │  │            ▲                 │
        │  │  - Export PPTX/PDF    │ │  │            │ calls           │
        │  │  - Manage DB          │ │  │            │                 │
        │  └───────────────────────┘ │  │  ┌────────▼───────────────┐ │
        │            ▲                │  │  │  MCP Server            │ │
        │            │                │  │  │  ──────────            │ │
        │  ┌─────────▼──────────────┐│  │  │  12 Essential Tools:   │ │
        │  │   SQLite Database      ││  │  │  - edit_slide          │ │
        │  │   (app_data volume)    ││  │  │  - generate_pres       │ │
        │  └────────────────────────┘│  │  │  - export_pres         │ │
        └─────────────────────────────┘  │  │  - list_pres           │ │
                                         │  │  - etc...              │ │
                                         │  └────────────────────────┘ │
                                         └──────────────────────────────┘
```

## Service Communication

```
External User/Agent
       │
       │ HTTP Requests
       ▼
┌─────────────────────────────────────────────────────────┐
│  Host Machine                                           │
│                                                         │
│  Port 5000  ──────────────────┐                       │
│  Port 5002  ──────────────┐   │                       │
│  Port 8001  ──────────┐   │   │                       │
│                        │   │   │                       │
└────────────────────────┼───┼───┼───────────────────────┘
                         │   │   │
        Docker Network: presenton-network (bridge)
                         │   │   │
         ┌───────────────┘   │   └───────────────┐
         ▼                   ▼                   ▼
    ┌─────────┐        ┌──────────┐       ┌──────────┐
    │   MCP   │        │  Slide   │       │Presenton │
    │ Server  │───────▶│  Helper  │──────▶│   API    │
    │  :8001  │ calls  │   :5002  │ calls │   :80    │
    └─────────┘        └──────────┘       └──────────┘
         │                   │                   │
         └───────────────────┴───────────────────┘
                    Same Container Network
```

## Data Flow Example: Edit Slide

```
1. AI Agent sends request to MCP Server
   ─────────────────────────────────────────────▶
   POST http://localhost:8001/mcp
   {
     "method": "tools/call",
     "params": {
       "name": "edit_slide",
       "arguments": {
         "id": "slide-uuid",
         "prompt": "Add 3 bullet points"
       }
     }
   }

2. MCP Server processes and forwards to Presenton API
   ────────────────────────────────────────────────────▶
   POST http://presenton:80/api/v1/ppt/slide/edit
   {
     "id": "slide-uuid",
     "prompt": "Add 3 bullet points"
   }

3. Presenton API uses AI to generate content
   ◄─────────────────────────────────────────────────────
   {
     "slide": { ...updated slide data... }
   }

4. MCP Server returns result to AI Agent
   ◄────────────────────────────────────────────
   {
     "result": { ...slide data... }
   }
```

## Volume Mounts

```
Host: ./app_data
  │
  └─▶ Container: /app_data
        │
        ├── presenton.db (SQLite)
        ├── presentations/
        ├── exports/
        └── temp/
```

## Environment Variables Flow

```
Host: .env file
  │
  ├─▶ presenton container
  │     ├── LLM=openai
  │     ├── OPENAI_API_KEY=***
  │     ├── DATABASE_URL=sqlite:///app_data/presenton.db
  │     └── ... (all env vars)
  │
  └─▶ mcp-services container
        └── PRESENTON_API_URL=http://presenton:80
```

## Health Check Flow

```
docker-compose up -d
       │
       ▼
Start presenton container
       │
       ├─▶ Every 30s: curl http://localhost:80/health
       │       │
       │       ├─ Success? Mark as healthy
       │       └─ Fail? Retry (max 3 times)
       ▼
presenton marked as healthy
       │
       ▼
Start mcp-services container (depends_on presenton healthy)
       │
       ├─▶ Start Slide Helper API (:5002)
       │
       ├─▶ Wait 3 seconds
       │
       ├─▶ Start MCP Server (:8001)
       │
       └─▶ Every 30s: curl both health endpoints
```

## Container Lifecycle

```
┌──────────────────────────────────────────────────────────┐
│  docker-compose -f docker-compose-mcp.yml up -d          │
└──────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
┌────────────────┐            ┌──────────────────┐
│ Build Images   │            │ Create Network   │
│ (if needed)    │            │ presenton-net    │
└───────┬────────┘            └────────┬─────────┘
        │                              │
        └──────────┬───────────────────┘
                   ▼
        ┌────────────────────┐
        │ Start presenton    │
        │ Wait for healthy   │
        └─────────┬──────────┘
                  ▼
        ┌────────────────────┐
        │ Start mcp-services │
        └─────────┬──────────┘
                  ▼
        ┌────────────────────┐
        │   All Running ✓    │
        └────────────────────┘
```

## Resource Usage

```
┌───────────────────────────────────────────┐
│  presenton Container                      │
│  ─────────────────────                    │
│  CPU: ~1-2 cores (AI operations)         │
│  RAM: ~1-2 GB (base + AI models)         │
│  Disk: ~500MB (app) + data volume        │
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│  mcp-services Container                   │
│  ──────────────────────                   │
│  CPU: ~0.5 cores (lightweight)           │
│  RAM: ~256-512 MB                         │
│  Disk: ~100MB                             │
└───────────────────────────────────────────┘

Total System Requirements:
  - CPU: 2-3 cores recommended
  - RAM: 2-3 GB minimum
  - Disk: 1 GB + space for presentations
```

## Network Ports

```
Host                Container          Service
─────────────────  ──────────────     ─────────────────────
5000            →  80                 Presenton Web + API
5002            →  5002               Slide Helper API
8001            →  8001               MCP Server
```

## Startup Order & Dependencies

```
1. Docker Network Created
   └─▶ presenton-network (bridge)

2. presenton Container
   ├─▶ Pull/Build image
   ├─▶ Mount volumes
   ├─▶ Set environment variables
   ├─▶ Start services
   ├─▶ Health check passes
   └─▶ Status: healthy

3. mcp-services Container (waits for presenton)
   ├─▶ Pull/Build image
   ├─▶ Start Slide Helper API
   ├─▶ Start MCP Server
   ├─▶ Health check passes
   └─▶ Status: healthy

4. System Ready ✓
```

## Quick Commands Reference

```bash
# Start everything
./start-mcp.sh
# or
docker-compose -f docker-compose-mcp.yml up -d

# Check status
docker-compose -f docker-compose-mcp.yml ps

# View logs (all)
docker-compose -f docker-compose-mcp.yml logs -f

# View logs (specific service)
docker-compose -f docker-compose-mcp.yml logs -f presenton
docker-compose -f docker-compose-mcp.yml logs -f mcp-services

# Restart a service
docker-compose -f docker-compose-mcp.yml restart mcp-services

# Stop everything
docker-compose -f docker-compose-mcp.yml down

# Rebuild and restart
docker-compose -f docker-compose-mcp.yml build --no-cache
docker-compose -f docker-compose-mcp.yml up -d
```

## Advantages of This Architecture

1. **Isolation**: Each service runs in its own container
2. **Scalability**: Can scale MCP services independently
3. **Easy Deployment**: One command starts everything
4. **Health Monitoring**: Built-in health checks
5. **Network Isolation**: Services communicate via internal network
6. **Volume Persistence**: Data survives container restarts
7. **Clean Shutdown**: Graceful stop of all services
8. **Easy Updates**: Rebuild specific containers without affecting others
