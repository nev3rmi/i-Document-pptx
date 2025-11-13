# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Presenton is an open-source AI presentation generator that runs locally. It consists of two main servers:
- **FastAPI Backend** (`servers/fastapi/`) - Python-based API server handling LLM interactions, presentation generation, and document processing
- **Next.js Frontend** (`servers/nextjs/`) - React-based web interface for creating and editing presentations

The application supports multiple LLM providers (OpenAI, Google Gemini, Anthropic Claude, Ollama, custom OpenAI-compatible APIs) and image providers (DALL-E 3, Gemini Flash, Pexels, Pixabay).

## Development Commands

### Running the Application

**Development mode** (with hot reload):
```bash
# From presenton/ directory
node start.js --dev
```
This starts:
- FastAPI backend on port 8000
- Next.js frontend on port 3000
- MCP server on port 8001
- Ollama service (if available)
- Nginx reverse proxy

**Production mode** (using Docker):
```bash
docker run -it --name presenton -p 5000:80 -v "./app_data:/app_data" ghcr.io/presenton/presenton:latest
```

**Docker Compose** (for development):
```bash
docker compose up development
```

**Docker Compose with GPU** (for Ollama models):
```bash
docker compose up development-gpu
```

### Backend (FastAPI)

**Location**: `servers/fastapi/`

**Run server directly**:
```bash
cd servers/fastapi
python server.py --port 8000 --reload true
```

**Run tests**:
```bash
cd servers/fastapi
pytest
```

**Run specific test**:
```bash
cd servers/fastapi
pytest tests/test_presentation_generation_api.py -v
```

**Install dependencies** (uses uv):
```bash
cd servers/fastapi
uv sync
```

### Frontend (Next.js)

**Location**: `servers/nextjs/`

**Install dependencies**:
```bash
cd servers/nextjs
npm install
```

**Run development server**:
```bash
cd servers/nextjs
npm run dev
```

**Build for production**:
```bash
cd servers/nextjs
npm run build
```

**Lint**:
```bash
cd servers/nextjs
npm run lint
```

## Architecture

### Backend Architecture (FastAPI)

**Core Service Layer**:
- `services/llm_client.py` - Unified LLM client supporting OpenAI, Google, Anthropic, Ollama, and custom providers
- `services/pptx_presentation_creator.py` - Creates PowerPoint files from structured models
- `services/documents_loader.py` - Handles document uploads and processing
- `services/docling_service.py` - Converts documents to structured format
- `services/image_generation_service.py` - Handles image generation across providers
- `services/database.py` - SQLModel-based database operations

**API Structure** (`api/v1/ppt/`):
- `/presentation` - Main presentation generation endpoints
- `/outlines` - Outline creation and editing
- `/files` - File upload and management
- `/pptx_slides` - PPTX template processing
- `/pdf_slides` - PDF export functionality
- `/slide_to_html` - HTML/React slide rendering
- `/images`, `/icons`, `/fonts` - Asset management
- Provider-specific endpoints: `/openai`, `/google`, `/anthropic`, `/ollama`

**Models** (`models/`):
- Pydantic models for API requests/responses
- `models/sql/` - SQLModel database models for presentations, slides, templates
- `models/pptx_models.py` - Structured models for PowerPoint generation

**Key Flows**:
1. **Presentation Generation**: User prompt → LLM generates outline → LLM generates slide content → HTML templates rendered → PPTX/PDF export
2. **Template Creation**: Upload PPTX → Extract styles/layouts → Convert to HTML templates → Store in database
3. **MCP Server**: Exposes presentation generation via Model Context Protocol (`mcp_server.py`)

### Frontend Architecture (Next.js)

**Route Structure** (`app/(presentation-generator)/`):
- `/dashboard` - Home page with prompt input
- `/outline` - Review and edit presentation outline
- `/presentation` - Slide editor and presentation view
- `/custom-template` - Template creation from PPTX files
- `/upload` - Document upload for context
- `/settings` - API key and provider configuration

**State Management**:
- Redux Toolkit (`@reduxjs/toolkit`) for global state
- Presentation data, slides, and configuration stored in Redux

**Key Components**:
- HTML template renderer with live preview
- Slide editor with drag-and-drop reordering
- PPTX/PDF export functionality
- Markdown editor for slide content

### Template System

Templates are HTML/Tailwind CSS files that define presentation layouts:
- Located in `servers/nextjs/presentation-templates/`
- Each template has multiple layout types (title slide, content, image+text, etc.)
- Templates can be created from existing PPTX files
- Rendered server-side and embedded in PPTX via `pptx_presentation_creator.py`

### LLM Integration

The `LLMClient` class (`services/llm_client.py`) provides:
- Unified interface across providers
- Streaming support for real-time generation
- Tool calling for structured outputs
- Web grounding (search) for OpenAI, Google, Anthropic
- Automatic schema conversion between providers

### Configuration

User configuration is stored in `app_data/userConfig.json` and includes:
- LLM provider and API keys
- Model selection
- Image provider settings
- Feature flags (tool calls, thinking, web grounding)

Environment variables are set via Docker or `start.js` and can be made immutable by setting `CAN_CHANGE_KEYS=false`.

## Important Notes

### Python Environment
- Requires Python 3.11 (specifically 3.11, not 3.12+)
- Uses `uv` for dependency management (`pyproject.toml`)

### Database
- SQLite by default (`container.db`)
- PostgreSQL and MySQL supported via `DATABASE_URL` environment variable

### MCP Server
- FastAPI also runs an MCP server on port 8001
- Allows Claude Desktop and other MCP clients to generate presentations
- Started automatically via `start.js`

### Testing
- Backend tests use pytest
- Tests cover: presentation generation, LLM schema compatibility, image generation, PPTX creation

### Common Pitfalls
- The working directory when running via Docker is `/app`, but when running via `start.js` it's the `presenton/` directory
- The `app_data/` directory is mounted as a volume and persists user data, templates, and generated presentations
- Template HTML must be valid and use Tailwind CSS classes (compiled during template processing)
- When modifying LLM schemas, test against all supported providers as they have different requirements
