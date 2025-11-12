# Token-Efficient Slide Retrieval

## Problem

When editing a single slide, using `get_presentation` to fetch the entire presentation wastes tokens:

- **~367 tokens per slide**
- **~7,340 tokens for 20-slide presentation**
- Only need 1 slide but fetching all of them

## Solution

Created a **Slide Helper API** that provides token-efficient single slide retrieval:

### 1. Slide Helper API (`slide_helper_api.py`)

**Location**: `/home/nev3r/projects/presenton/presenton/servers/fastapi/slide_helper_api.py`

**Port**: 5002

**Endpoint**: `GET /api/v1/ppt/slide/{slide_id}`

**How it works**:
1. Fetches all presentations from Presenton API
2. Searches for the slide across presentations
3. Returns ONLY the requested slide

**Example**:
```bash
curl http://localhost:5002/api/v1/ppt/slide/3dcda9d0-3112-4da7-bd7d-84aea9793a08
```

**Response**: Single slide object (saves ~7,000 tokens vs full presentation)

### 2. MCP Integration

**Updated Files**:
- `openapi_spec.json` - Added GET `/api/v1/ppt/slide/{id}` endpoint
- `mcp_server.py` - Updated to show 9 tools (was 8)

**New MCP Tool**: `get_slide`
- **Summary**: "Get single slide by ID (token-efficient)"
- **Description**: "Retrieve a specific slide without fetching the entire presentation. More token-efficient than get_presentation for single slide operations. Use this before editing a slide to get the latest content."
- **Server**: Routes to Slide Helper API on port 5002

### 3. Architecture

```
MCP Client (n8n/Claude Code)
    ↓
MCP Server (port 8001)
    ↓
get_slide tool
    ↓
Slide Helper API (port 5002)
    ↓
Presenton API (port 5000)
```

## Usage Recommendations

### Before editing a slide:

**BAD** (wastes tokens):
```javascript
// Fetches entire presentation (~7,340 tokens for 20 slides)
const pres = await get_presentation(presentation_id);
const slide = pres.slides.find(s => s.id === slide_id);
await edit_slide(slide_id, "Change title to...");
```

**GOOD** (token-efficient):
```javascript
// Fetches only the target slide (~367 tokens)
const slide = await get_slide(slide_id);
await edit_slide(slide_id, "Change title to...");
```

### Workflow:

1. **List presentations**: `list_presentations()` - Get all presentation IDs
2. **Get specific slide**: `get_slide(slide_id)` - Token-efficient retrieval
3. **Edit slide**: `edit_slide(slide_id, prompt)` - AI-powered editing
4. **Export**: `export_presentation(presentation_id, "pptx")` - Generate final file

## Token Savings

| Operation | Tokens (20 slides) | Savings |
|-----------|-------------------|---------|
| get_presentation | ~7,340 | Baseline |
| get_slide | ~367 | **95% reduction** |

## Running the Services

### Start Slide Helper API:
```bash
cd /home/nev3r/projects/presenton/presenton/servers/fastapi
python3 slide_helper_api.py
```

### Start MCP Server:
```bash
cd /home/nev3r/projects/presenton/presenton/servers/fastapi
python3 mcp_server.py --port 8001 --api-url http://127.0.0.1:5000
```

### Verify:
```bash
# Check Slide Helper API
curl http://localhost:5002/health

# Check MCP Server
curl -X POST http://localhost:8001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

## Alternative: Standalone Script

A standalone Python script is also available for direct use:

**Location**: `/home/nev3r/projects/presenton/presenton/servers/fastapi/get_slide_by_id.py`

**Usage**:
```bash
python3 get_slide_by_id.py <slide_id> [--api-url http://localhost:5000]
```

**Example**:
```bash
python3 get_slide_by_id.py 3dcda9d0-3112-4da7-bd7d-84aea9793a08 | jq '.content.title'
# Output: "Welcome to Our Presentation!"
```

## Future Enhancement

**Ideal solution**: Request Presenton team to add native `GET /api/v1/ppt/slide/{id}` endpoint to the main API.

Until then, the Slide Helper API provides a lightweight proxy solution.
