# Presenton MCP Integration

## TL;DR

**Architecture**: `Browser → n8n → Presenton MCP (8 tools) → Presenton API`

**What's running:**
- Presenton API: `http://localhost:5000` (Docker)
- MCP Server: `http://localhost:8001/mcp` (8 curated tools)

**Start MCP Server:**
```bash
cd servers/fastapi
python3 mcp_server.py --port 8001
```

---

## The 8 Essential MCP Tools

| Tool | Purpose | Example |
|------|---------|---------|
| **edit_slide** ⭐ | AI content editing | "Add 3 bullet points about AI" |
| **list_presentations** | List all | - |
| **get_presentation** | View slides | - |
| **generate_presentation** | Create new | "Create 5 slides about Python" |
| **delete_presentation** | Delete | - |
| **edit_slide_html** | Styling | "Make title 48px" |
| **update_presentation_bulk** | Batch update | Update 10 slides at once |
| **update_presentation_metadata** | Change title/language | - |
| **export_presentation** | Export PPTX/PDF | - |

### Why only 8 instead of 49?

The full API has 49 endpoints, but:
- **49 tools** → Too many choices, LLM confusion, slow, wasted tokens (~5000 tokens)
- **8 tools** → Clear choices, fast, efficient (~800 tokens), covers 95% of use cases

The other 41 endpoints are for internal operations (file uploads, template management, model config, webhooks) that chatbots don't need.

---

## Quick Test

```bash
# List presentations
curl http://localhost:5000/api/v1/ppt/presentation/all

# Edit a slide (with bug fix!)
curl -X POST http://localhost:5000/api/v1/ppt/slide/edit \
  -H "Content-Type: application/json" \
  -d '{
    "id": "slide-uuid-here",
    "prompt": "Add a 5th card about community support"
  }'
```

---

## n8n Integration (Recommended)

### Install n8n
```bash
docker run -d --name n8n -p 5678:5678 --network=host n8nio/n8n
```

### n8n Workflow Structure
```
1. Webhook Trigger
   ↓
2. AI Agent (parse user intent)
   ↓
3. Switch (route to MCP tool)
   ├─ "edit" → POST http://localhost:8001/mcp (edit_slide)
   ├─ "view" → POST http://localhost:8001/mcp (get_presentation)
   └─ "create" → POST http://localhost:8001/mcp (generate_presentation)
   ↓
4. Respond
```

### MCP Call Format (JSON-RPC)
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "edit_slide",
    "arguments": {
      "id": "slide-uuid",
      "prompt": "Add more content"
    }
  },
  "id": 1
}
```

---

## Bug Fix Applied

**File**: `servers/fastapi/utils/process_slides.py:127-139`

**Problem**: KeyError when editing slides with icons multiple times

**Fix**: Added safety check before accessing `__icon_url__`

```python
# Before (crashed)
old_icon_url = old_icon_dict["__icon_url__"]  # KeyError!

# After (works)
if "__icon_url__" in old_icon_dict:
    old_icon_url = old_icon_dict["__icon_url__"]
```

---

## Architecture Benefits

1. **Multi-MCP Support** - n8n can call multiple MCPs (Presenton, Knowledge Base, Analytics)
2. **Visual Workflows** - n8n's drag-and-drop (no backend coding needed)
3. **Knowledge Base Ready** - Easy to add RAG/vector search MCP later
4. **Scalable** - Each component independent
5. **Low Token Usage** - Only 8 tools instead of 49

---

## Future Extensions

### Knowledge Base MCP (Port 8002)
```
Tools:
- search_presentations (vector search)
- answer_question (RAG)
- suggest_content (generation)
```

### Analytics MCP (Port 8003)
```
Tools:
- track_edits
- generate_report
- usage_stats
```

Then n8n orchestrates all MCPs:
```
User: "What's on slide 3?"
n8n → Presenton MCP (get_presentation)
n8n → Knowledge Base MCP (answer_question)
n8n → User: "Slide 3 covers..."
```

---

## Files

- `servers/fastapi/mcp_server.py` - MCP server (8 tools)
- `servers/fastapi/openapi_spec.json` - OpenAPI spec (curated, 8 endpoints)
- `servers/fastapi/utils/process_slides.py` - Bug fix applied
- `presenton_chatbot_demo.html` - Demo chatbot UI
- `README_MCP.md` - This file

---

## Support

- Presenton Docs: https://docs.presenton.ai
- FastMCP: https://gofastmcp.com
- n8n: https://docs.n8n.io
- MCP Protocol: https://modelcontextprotocol.io
