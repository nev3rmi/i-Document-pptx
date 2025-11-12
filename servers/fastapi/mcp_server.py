"""
Presenton MCP Server - Curated Edition

This MCP server exposes ONLY essential Presenton API endpoints as MCP tools,
focused on chatbot use cases.

Essential Tools (8 total):
- list_presentations: List all presentations
- get_presentation: View specific presentation with all slides
- edit_slide: AI-powered slide editing (natural language) ⭐ PRIMARY
- edit_slide_html: AI-powered HTML/styling editing
- generate_presentation: Create new presentation
- export_presentation: Export to PPTX or PDF
- update_presentation_bulk: Update multiple slides at once
- update_presentation_metadata: Update title, language, etc.

Why only 8 tools?
- The full API has 49 endpoints, but most are for internal operations
- These 8 cover 95% of chatbot use cases
- Easier for LLMs to choose the right tool
- Faster responses, lower token usage
"""

import sys
import argparse
import asyncio
import traceback
import httpx
from fastmcp import FastMCP
import json

# Load curated OpenAPI spec with only essential endpoints
with open("openapi_spec.json", "r") as f:
    openapi_spec = json.load(f)


async def main():
    try:
        print("🚀 Starting Presenton MCP Server (Curated Edition)")
        parser = argparse.ArgumentParser(
            description="Presenton MCP Server with Essential Tools Only"
        )
        parser.add_argument(
            "--port",
            type=int,
            default=8001,
            help="Port for the MCP server (default: 8001)"
        )
        parser.add_argument(
            "--api-url",
            type=str,
            default="http://127.0.0.1:5000",
            help="Presenton API base URL (default: http://127.0.0.1:5000)"
        )
        parser.add_argument(
            "--name",
            type=str,
            default="Presenton Editor",
            help="Display name for the MCP server"
        )

        args = parser.parse_args()
        print(f"📡 MCP Server Port: {args.port}")
        print(f"🔗 API URL: {args.api_url}")

        # Create HTTP client that connects to Presenton API
        api_client = httpx.AsyncClient(
            base_url=args.api_url,
            timeout=120.0  # Increased timeout for AI operations
        )

        # Build MCP server from curated OpenAPI spec
        print("🔧 Creating MCP server from curated OpenAPI spec...")
        mcp = FastMCP.from_openapi(
            openapi_spec=openapi_spec,
            client=api_client,
            name=args.name,
        )
        print(f"✅ MCP server created with {len(openapi_spec['paths'])} essential tools")

        # Print available tools
        print("\n📋 Available MCP Tools (Curated):")
        print("\n  🎯 Primary Tool:")
        print("    • edit_slide              - AI-powered slide editing with natural language ⭐")
        print("\n  📊 Presentation Management:")
        print("    • list_presentations      - List all available presentations")
        print("    • get_presentation        - View presentation with all slides")
        print("    • generate_presentation   - Create new presentation from topic")
        print("    • delete_presentation     - Delete a presentation")
        print("\n  🎨 Advanced Editing:")
        print("    • edit_slide_html         - AI-powered HTML/styling editing")
        print("    • update_presentation_bulk - Update multiple slides at once")
        print("    • update_presentation_metadata - Update title, language, etc.")
        print("\n  💾 Export:")
        print("    • export_presentation     - Export to PPTX or PDF")

        # Start the MCP server
        print(f"\n🌐 Starting MCP server on http://0.0.0.0:{args.port}")
        print("💡 Connect your n8n workflow or chatbot to this URL!")
        print("\n🎯 Why only 8 tools?")
        print("   • Covers 95% of chatbot use cases")
        print("   • Easier for LLMs to choose the right tool")
        print("   • Faster responses, lower token usage")
        print("   • Original API has 49 endpoints, but most are internal")
        print("\nPress CTRL+C to stop\n")

        await mcp.run_async(
            transport="http",
            host="0.0.0.0",
            port=args.port,
        )

    except KeyboardInterrupt:
        print("\n👋 Shutting down MCP server...")
    except Exception as e:
        print(f"❌ ERROR: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        raise


if __name__ == "__main__":
    print("=" * 60)
    print("  Presenton MCP Server - Curated Edition")
    print("  8 Essential Tools for Chatbot Integration")
    print("=" * 60)
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"❌ FATAL ERROR: {e}")
        sys.exit(1)
