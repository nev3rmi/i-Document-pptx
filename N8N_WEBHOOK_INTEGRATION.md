# n8n Webhook Integration with Presenton MCP

## Your Setup

- **n8n Webhook URL**: `https://n8n.toho.vn/webhook/aa880d96-5f02-42c6-8b3a-273e87c3deda`
- **MCP Server**: `http://192.168.31.174:8001/mcp`
- **Presenton API**: `http://192.168.31.174:5000`

## Architecture Flow

```
User (Browser/Mobile)
  ↓ HTTP POST
n8n Webhook (https://n8n.toho.vn/webhook/...)
  ↓
n8n AI Agent (analyzes user intent)
  ↓
n8n HTTP Request → MCP Server (http://192.168.31.174:8001/mcp)
  ↓
MCP Server → Presenton API (http://192.168.31.174:5000)
  ↓
Response back through n8n to user
```

## n8n Workflow Configuration

### 1. Webhook Trigger Node

**Settings:**
- **HTTP Method**: POST
- **Path**: `aa880d96-5f02-42c6-8b3a-273e87c3deda`
- **Response Mode**: "Respond to Webhook"

**Expected Input:**
```json
{
  "presentation_id": "f489c853-8125-48ff-9a91-8244a3b16878",
  "slide_id": "9661d7ee-7770-47c8-a0fb-78305aa2b8cb",
  "prompt": "Add a 5th card about community support",
  "action": "edit_slide"
}
```

### 2. AI Agent Node (Optional)

**Purpose**: Parse natural language to extract intent

**Input**: User message (natural language)
**Output**: Structured data (action, slide_id, prompt)

Example:
```
User: "Edit slide 3 to add more benefits"
  ↓
AI Agent extracts:
  - action: "edit_slide"
  - slide_number: 3
  - prompt: "add more benefits"
```

### 3. Get Presentation Node (HTTP Request)

**Purpose**: Get all slides to find slide ID from slide number

**Settings:**
- **Method**: GET
- **URL**: `http://192.168.31.174:5000/api/v1/ppt/presentation/{{$json.presentation_id}}`
- **Authentication**: None

**Code to extract slide ID:**
```javascript
// Get slide by index
const slideIndex = $json.slide_number - 1; // Convert to 0-based index
const slides = $('HTTP Request').item.json.slides;
const slideId = slides[slideIndex].id;

return {
  slide_id: slideId,
  prompt: $json.prompt
};
```

### 4. Call MCP Tool Node (HTTP Request)

**Settings:**
- **Method**: POST
- **URL**: `http://192.168.31.174:8001/mcp`
- **Content-Type**: `application/json`
- **Timeout**: 120000 (2 minutes)

**Body:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "edit_slide",
    "arguments": {
      "id": "{{$json.slide_id}}",
      "prompt": "{{$json.prompt}}"
    }
  },
  "id": 1
}
```

### 5. Respond to Webhook Node

**Body:**
```json
{
  "status": "success",
  "message": "Slide updated successfully!",
  "action": "refresh",
  "presentation_id": "{{$json.presentation_id}}",
  "slide_id": "{{$json.slide_id}}",
  "viewer_url": "http://192.168.31.174:5001/presentation?id={{$json.presentation_id}}"
}
```

## Complete n8n Workflow JSON

```json
{
  "name": "Presenton MCP Integration",
  "nodes": [
    {
      "parameters": {
        "path": "aa880d96-5f02-42c6-8b3a-273e87c3deda",
        "responseMode": "responseNode",
        "options": {}
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "position": [250, 300]
    },
    {
      "parameters": {
        "url": "http://192.168.31.174:5000/api/v1/ppt/presentation/{{$json.body.presentation_id}}",
        "options": {}
      },
      "name": "Get Presentation",
      "type": "n8n-nodes-base.httpRequest",
      "position": [450, 300]
    },
    {
      "parameters": {
        "functionCode": "const slideIndex = $input.item.json.body.slide_number - 1;\nconst slides = $('Get Presentation').item.json.slides;\nconst slideId = slides[slideIndex].id;\n\nreturn {\n  json: {\n    slide_id: slideId,\n    prompt: $input.item.json.body.prompt,\n    presentation_id: $input.item.json.body.presentation_id\n  }\n};"
      },
      "name": "Extract Slide ID",
      "type": "n8n-nodes-base.code",
      "position": [650, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://192.168.31.174:8001/mcp",
        "options": {
          "timeout": 120000
        },
        "bodyParametersJson": "={\n  \"jsonrpc\": \"2.0\",\n  \"method\": \"tools/call\",\n  \"params\": {\n    \"name\": \"edit_slide\",\n    \"arguments\": {\n      \"id\": \"{{$json.slide_id}}\",\n      \"prompt\": \"{{$json.prompt}}\"\n    }\n  },\n  \"id\": 1\n}"
      },
      "name": "Call MCP",
      "type": "n8n-nodes-base.httpRequest",
      "position": [850, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={\n  \"status\": \"success\",\n  \"message\": \"Slide updated successfully!\",\n  \"action\": \"refresh\",\n  \"presentation_id\": \"{{$json.presentation_id}}\",\n  \"viewer_url\": \"http://192.168.31.174:5001/presentation?id={{$json.presentation_id}}\"\n}"
      },
      "name": "Respond to Webhook",
      "type": "n8n-nodes-base.respondToWebhook",
      "position": [1050, 300]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [[{"node": "Get Presentation", "type": "main", "index": 0}]]
    },
    "Get Presentation": {
      "main": [[{"node": "Extract Slide ID", "type": "main", "index": 0}]]
    },
    "Extract Slide ID": {
      "main": [[{"node": "Call MCP", "type": "main", "index": 0}]]
    },
    "Call MCP": {
      "main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]
    }
  }
}
```

## Testing the Webhook

### Using curl:

```bash
curl -X POST https://n8n.toho.vn/webhook/aa880d96-5f02-42c6-8b3a-273e87c3deda \
  -H "Content-Type: application/json" \
  -d '{
    "presentation_id": "f489c853-8125-48ff-9a91-8244a3b16878",
    "slide_number": 1,
    "prompt": "Add a 5th card about community support"
  }'
```

### Using JavaScript (Frontend):

```javascript
async function editSlideViaWebhook(slideNumber, prompt) {
  const response = await fetch('https://n8n.toho.vn/webhook/aa880d96-5f02-42c6-8b3a-273e87c3deda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presentation_id: 'f489c853-8125-48ff-9a91-8244a3b16878',
      slide_number: slideNumber,
      prompt: prompt
    })
  });

  return await response.json();
}
```

## Available MCP Tools

You can call any of these 8 tools through the webhook:

| Tool Name | Purpose | Arguments |
|-----------|---------|-----------|
| `edit_slide` | AI content editing | `id` (UUID), `prompt` (string) |
| `list_presentations` | List all | None |
| `get_presentation` | View slides | `id` (UUID) |
| `generate_presentation` | Create new | `topic`, `n_slides`, `language` |
| `delete_presentation` | Delete | `id` (UUID) |
| `edit_slide_html` | Styling | `id` (UUID), `prompt` (string), `html` (optional) |
| `update_presentation_bulk` | Batch update | `presentation_id`, `slides`, `export_as` |
| `export_presentation` | Export PPTX/PDF | `presentation_id`, `export_as` |

## Error Handling

### Timeout Errors
- Slide editing can take 30-60 seconds
- Set n8n HTTP Request timeout to at least 120000ms (2 minutes)

### MCP Server Not Reachable
- Check if MCP server is running: `ps aux | grep mcp_server`
- Check firewall rules allow port 8001
- Verify MCP URL is accessible from n8n server

### API Errors
- Check Presenton Docker is running: `docker ps | grep presenton`
- Verify presentation/slide IDs are valid

## Security Considerations

⚠️ **Important**: Your MCP server is currently exposed to LAN without authentication!

**Recommendations:**
1. Add API key authentication to MCP server
2. Use HTTPS for n8n webhook (already done ✅)
3. Add rate limiting
4. Whitelist n8n server IP in firewall

## Next Steps

1. ✅ n8n webhook created
2. ⏭️ Import workflow JSON to n8n
3. ⏭️ Test with curl command
4. ⏭️ Update smart chatbot to use webhook
5. ⏭️ Add error handling and retries
