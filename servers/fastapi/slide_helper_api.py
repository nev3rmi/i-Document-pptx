#!/usr/bin/env python3
"""
FastAPI wrapper that adds a GET /slide/{id} endpoint to complement Presenton API.
This provides token-efficient single slide retrieval.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import uvicorn

app = FastAPI(
    title="Presenton Slide Helper API",
    description="Token-efficient single slide retrieval for MCP integration"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PRESENTON_API_URL = "http://127.0.0.1:5000"


@app.get("/api/v1/ppt/slide/{slide_id}")
async def get_slide_by_id(slide_id: str):
    """
    Get a single slide by ID (token-efficient).

    More efficient than fetching the entire presentation.
    Fetches all presentations, finds the one containing the slide,
    and returns only that slide's data.

    Args:
        slide_id: UUID of the slide to retrieve

    Returns:
        Slide object with content, layout, and metadata

    Raises:
        HTTPException 404: If slide not found
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Get all presentations
        try:
            response = await client.get(f"{PRESENTON_API_URL}/api/v1/ppt/presentation/all")
            response.raise_for_status()
            presentations = response.json()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch presentations: {str(e)}")

        # Search for the slide across all presentations
        for pres in presentations:
            try:
                pres_response = await client.get(
                    f"{PRESENTON_API_URL}/api/v1/ppt/presentation/{pres['id']}"
                )
                pres_response.raise_for_status()
                pres_data = pres_response.json()

                # Look for the slide in this presentation
                for slide in pres_data.get('slides', []):
                    if slide['id'] == slide_id:
                        # Found it! Return only this slide
                        return slide

            except Exception:
                # Skip presentations that fail to load
                continue

        # Slide not found in any presentation
        raise HTTPException(
            status_code=404,
            detail=f"Slide {slide_id} not found in any presentation"
        )


@app.delete("/api/v1/ppt/slide/{slide_id}")
async def delete_slide(slide_id: str):
    """
    Delete a slide by ID.

    This finds the presentation containing the slide, removes it from the
    slides array, and updates the presentation.

    Args:
        slide_id: UUID of the slide to delete

    Returns:
        Updated presentation with the slide removed

    Raises:
        HTTPException 404: If slide not found
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Get all presentations to find which one contains this slide
        try:
            response = await client.get(f"{PRESENTON_API_URL}/api/v1/ppt/presentation/all")
            response.raise_for_status()
            presentations = response.json()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch presentations: {str(e)}")

        # Find the presentation containing this slide
        target_presentation = None
        slide_index = None

        for pres in presentations:
            try:
                pres_response = await client.get(
                    f"{PRESENTON_API_URL}/api/v1/ppt/presentation/{pres['id']}"
                )
                pres_response.raise_for_status()
                pres_data = pres_response.json()

                # Look for the slide in this presentation
                for idx, slide in enumerate(pres_data.get('slides', [])):
                    if slide['id'] == slide_id:
                        target_presentation = pres_data
                        slide_index = idx
                        break

                if target_presentation:
                    break

            except Exception:
                continue

        if not target_presentation or slide_index is None:
            raise HTTPException(
                status_code=404,
                detail=f"Slide {slide_id} not found in any presentation"
            )

        # Remove the slide from the slides array
        updated_slides = [
            slide for idx, slide in enumerate(target_presentation['slides'])
            if idx != slide_index
        ]

        # Re-index the remaining slides
        for idx, slide in enumerate(updated_slides):
            slide['index'] = idx

        # Update the presentation with the new slides array
        try:
            update_response = await client.patch(
                f"{PRESENTON_API_URL}/api/v1/ppt/presentation/update",
                json={
                    "id": target_presentation['id'],
                    "slides": updated_slides
                }
            )
            update_response.raise_for_status()
            updated_presentation = update_response.json()

            return {
                "message": f"Slide {slide_id} deleted successfully",
                "presentation_id": target_presentation['id'],
                "slides_remaining": len(updated_slides),
                "presentation": updated_presentation
            }

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to update presentation after deleting slide: {str(e)}"
            )


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "slide-helper-api"}


if __name__ == "__main__":
    print("=" * 60)
    print("  Presenton Slide Helper API")
    print("  Token-Efficient Single Slide Retrieval")
    print("=" * 60)
    print(f"🔗 Presenton API: {PRESENTON_API_URL}")
    print(f"🌐 Starting on http://0.0.0.0:5002")
    print("📋 Available endpoints:")
    print("  • GET /api/v1/ppt/slide/{slide_id} - Get single slide")
    print("  • DELETE /api/v1/ppt/slide/{slide_id} - Delete slide")
    print("  • GET /health - Health check")
    print("\nPress CTRL+C to stop\n")

    uvicorn.run(app, host="0.0.0.0", port=5002)
