"""
ADS I-Document-PPTX MCP Server - Curated Edition

This MCP server exposes ONLY essential ADS I-Document-PPTX API endpoints as MCP tools,
focused on chatbot use cases.

Essential Tools (9 total):
- list_presentations: List all presentations
- get_presentation: View specific presentation with all slides
- get_slide: Get single slide by ID (token-efficient) ⭐ NEW
- edit_slide: AI-powered slide editing (natural language) ⭐ PRIMARY
- edit_slide_html: AI-powered HTML/styling editing
- generate_presentation: Create new presentation
- export_presentation: Export to PPTX or PDF
- update_presentation_bulk: Update multiple slides at once
- update_presentation_metadata: Update title, language, etc.

Why only 9 tools?
- The full API has 49 endpoints, but most are for internal operations
- These 9 cover 95% of chatbot use cases
- Easier for LLMs to choose the right tool
- Faster responses, lower token usage
- get_slide saves ~7,000 tokens vs get_presentation for single slide ops
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
        print("🚀 Starting ADS I-Document-PPTX MCP Server (Curated Edition)")
        parser = argparse.ArgumentParser(
            description="ADS I-Document-PPTX MCP Server with Essential Tools Only"
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
            help="ADS I-Document-PPTX API base URL (default: http://127.0.0.1:5000)"
        )
        parser.add_argument(
            "--slide-helper-url",
            type=str,
            default="http://127.0.0.1:5002",
            help="Slide Helper API base URL (default: http://127.0.0.1:5002)"
        )
        parser.add_argument(
            "--name",
            type=str,
            default="ADS I-Document-PPTX Editor",
            help="Display name for the MCP server"
        )

        args = parser.parse_args()
        print(f"📡 MCP Server Port: {args.port}")
        print(f"🔗 API URL: {args.api_url}")
        print(f"🔗 Slide Helper API URL: {args.slide_helper_url}")

        # Create HTTP clients
        api_client = httpx.AsyncClient(
            base_url=args.api_url,
            timeout=120.0  # Increased timeout for AI operations
        )
        slide_helper_client = httpx.AsyncClient(
            base_url=args.slide_helper_url,
            timeout=120.0
        )

        # Remove get_slide and delete_slide from OpenAPI spec (we'll add them manually)
        filtered_spec = openapi_spec.copy()
        filtered_spec["paths"] = {k: v for k, v in openapi_spec["paths"].items()
                                  if k != "/api/v1/ppt/slide/{id}"}

        # Build MCP server from curated OpenAPI spec
        print("🔧 Creating MCP server from curated OpenAPI spec...")
        mcp = FastMCP.from_openapi(
            openapi_spec=filtered_spec,
            client=api_client,
            name=args.name,
        )

        # Add custom tools for Slide Helper API
        @mcp.tool()
        async def get_slide(id: str) -> dict:
            """Get a single slide by ID (token-efficient).

            Retrieve a specific slide without fetching the entire presentation.
            More token-efficient than get_presentation for single slide operations.
            Use this before editing a slide to get the latest content.

            Args:
                id: Slide UUID

            Returns:
                Slide object with content, layout, and metadata
            """
            response = await slide_helper_client.get(f"/api/v1/ppt/slide/{id}")
            response.raise_for_status()
            return response.json()

        @mcp.tool()
        async def delete_slide(id: str) -> dict:
            """Delete a slide by ID.

            Delete a specific slide from its presentation. This removes the slide
            from the slides array and re-indexes remaining slides.
            Use this to permanently remove a slide.

            Args:
                id: Slide UUID to delete

            Returns:
                Deletion confirmation with slides_remaining count
            """
            response = await slide_helper_client.delete(f"/api/v1/ppt/slide/{id}")
            response.raise_for_status()
            return response.json()

        @mcp.tool()
        async def add_slide(
            presentation_id: str,
            title: str,
            description: str = "",
            layout: str = "general:basic-info-slide",
            position: int = -1
        ) -> dict:
            """Add a new slide to a presentation.

            Creates a new slide and inserts it at the specified position.
            The slide can be added at the beginning, end, or any position in between.

            Args:
                presentation_id: UUID of the presentation to add the slide to
                title: Title for the new slide
                description: Optional description/content for the slide (default: empty)
                layout: Slide layout template (default: general:basic-info-slide)
                position: Index position to insert (-1 = end, 0 = beginning)

            Returns:
                Created slide object with new slide ID and updated presentation
            """
            response = await slide_helper_client.post(
                "/api/v1/ppt/slide",
                params={
                    "presentation_id": presentation_id,
                    "title": title,
                    "description": description,
                    "layout": layout,
                    "position": position
                }
            )
            response.raise_for_status()
            return response.json()

        @mcp.tool()
        async def move_slide(
            slide_id: str,
            new_position: int
        ) -> dict:
            """Move a slide to a new position within its presentation.

            Reorders slides by moving the specified slide to a new position,
            shifting other slides as needed and re-indexing all slides.
            Use this to reorder slides in a presentation.

            Args:
                slide_id: UUID of the slide to move
                new_position: New index position (0-based, 0 = first position)

            Returns:
                Updated presentation with reordered slides and position change info
            """
            response = await slide_helper_client.patch(
                "/api/v1/ppt/slide/move",
                params={
                    "slide_id": slide_id,
                    "new_position": new_position
                }
            )
            response.raise_for_status()
            return response.json()

        print(f"✅ MCP server created with {len(filtered_spec['paths']) + 4} essential tools")

        # Print available tools
        print("\n📋 Available MCP Tools (Curated):")
        print("\n  🎯 Primary Tools:")
        print("    • edit_slide              - AI-powered slide editing with natural language ⭐")
        print("    • get_slide               - Get single slide by ID (token-efficient) ⭐")
        print("    • add_slide               - Add new slide to presentation ⭐")
        print("    • move_slide              - Move slide to new position ⭐ NEW")
        print("    • delete_slide            - Delete a slide by ID ⭐")
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
        print("\n🎯 Why only 12 tools?")
        print("   • Covers 95% of chatbot use cases")
        print("   • Easier for LLMs to choose the right tool")
        print("   • Faster responses, lower token usage")
        print("   • Original API has 49 endpoints, but most are internal")
        print("   • get_slide saves ~7,000 tokens vs get_presentation ⭐")
        print("   • add_slide, move_slide & delete_slide for full slide management ⭐")
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
    print("  ADS I-Document-PPTX MCP Server - Curated Edition")
    print("  12 Essential Tools for Chatbot Integration")
    print("=" * 60)
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"❌ FATAL ERROR: {e}")
        sys.exit(1)
