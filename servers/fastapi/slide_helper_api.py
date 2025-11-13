#!/usr/bin/env python3
"""
FastAPI wrapper that adds a GET /slide/{id} endpoint to complement ADS I-Document-PPTX API.
This provides token-efficient single slide retrieval.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import uvicorn

app = FastAPI(
    title="ADS I-Document-PPTX Slide Helper API",
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


@app.post("/api/v1/ppt/slide")
async def add_slide(
    presentation_id: str,
    title: str,
    description: str = "",
    layout: str = "general:basic-info-slide",
    position: int = -1
):
    """
    Add a new slide to a presentation.

    Creates a new slide with AI-generated content and adds it to the presentation.
    The slide will be inserted at the specified position (or at the end if position=-1).

    Args:
        presentation_id: UUID of the presentation to add the slide to
        title: Title for the new slide
        description: Optional description/content for the slide
        layout: Slide layout template (default: general:basic-info-slide)
        position: Index position to insert the slide (-1 = end, 0 = beginning, etc.)

    Returns:
        Created slide object with the new slide ID and updated presentation

    Raises:
        HTTPException 404: If presentation not found
    """
    import uuid

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Get the presentation
        try:
            response = await client.get(
                f"{PRESENTON_API_URL}/api/v1/ppt/presentation/{presentation_id}"
            )
            response.raise_for_status()
            presentation = response.json()
        except Exception as e:
            raise HTTPException(
                status_code=404,
                detail=f"Presentation {presentation_id} not found: {str(e)}"
            )

        # Create new slide object
        new_slide = {
            "id": str(uuid.uuid4()),
            "presentation": presentation_id,
            "layout_group": layout.split(":")[0] if ":" in layout else "general",
            "layout": layout,
            "content": {
                "title": title,
                "description": description
            },
            "html_content": None,
            "speaker_note": None,
            "properties": None
        }

        # Get current slides
        slides = presentation.get("slides", [])

        # Determine insertion position
        if position == -1 or position >= len(slides):
            # Add to end
            new_slide["index"] = len(slides)
            slides.append(new_slide)
        elif position == 0:
            # Add to beginning
            new_slide["index"] = 0
            slides.insert(0, new_slide)
            # Re-index all slides after insertion
            for idx, slide in enumerate(slides):
                slide["index"] = idx
        else:
            # Insert at specific position
            new_slide["index"] = position
            slides.insert(position, new_slide)
            # Re-index all slides after insertion
            for idx, slide in enumerate(slides):
                slide["index"] = idx

        # Update the presentation with new slides array
        try:
            update_response = await client.patch(
                f"{PRESENTON_API_URL}/api/v1/ppt/presentation/update",
                json={
                    "id": presentation_id,
                    "slides": slides
                }
            )
            update_response.raise_for_status()
            updated_presentation = update_response.json()

            return {
                "message": f"Slide added successfully at position {new_slide['index']}",
                "slide": new_slide,
                "presentation_id": presentation_id,
                "total_slides": len(slides),
                "presentation": updated_presentation
            }

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to add slide to presentation: {str(e)}"
            )


@app.patch("/api/v1/ppt/slide/move")
async def move_slide(
    slide_id: str,
    new_position: int
):
    """
    Move a slide to a new position within its presentation.

    Reorders slides by moving the specified slide to a new position,
    shifting other slides as needed and re-indexing all slides.

    Args:
        slide_id: UUID of the slide to move
        new_position: New index position (0-based)

    Returns:
        Updated presentation with reordered slides

    Raises:
        HTTPException 404: If slide not found
        HTTPException 400: If new_position is invalid
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
        current_index = None

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
                        current_index = idx
                        break

                if target_presentation:
                    break

            except Exception:
                continue

        if not target_presentation or current_index is None:
            raise HTTPException(
                status_code=404,
                detail=f"Slide {slide_id} not found in any presentation"
            )

        slides = target_presentation.get('slides', [])

        # Validate new_position
        if new_position < 0 or new_position >= len(slides):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid position {new_position}. Must be between 0 and {len(slides) - 1}"
            )

        # If already at target position, no change needed
        if current_index == new_position:
            return {
                "message": f"Slide is already at position {new_position}",
                "presentation_id": target_presentation['id'],
                "current_position": current_index,
                "presentation": target_presentation
            }

        # Remove slide from current position
        slide_to_move = slides.pop(current_index)

        # Insert at new position
        slides.insert(new_position, slide_to_move)

        # Re-index all slides
        for idx, slide in enumerate(slides):
            slide['index'] = idx

        # Update the presentation with reordered slides array
        try:
            update_response = await client.patch(
                f"{PRESENTON_API_URL}/api/v1/ppt/presentation/update",
                json={
                    "id": target_presentation['id'],
                    "slides": slides
                }
            )
            update_response.raise_for_status()
            updated_presentation = update_response.json()

            return {
                "message": f"Slide moved from position {current_index} to {new_position}",
                "slide_id": slide_id,
                "presentation_id": target_presentation['id'],
                "old_position": current_index,
                "new_position": new_position,
                "total_slides": len(slides),
                "presentation": updated_presentation
            }

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to update presentation after moving slide: {str(e)}"
            )


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "slide-helper-api"}


if __name__ == "__main__":
    print("=" * 60)
    print("  ADS I-Document-PPTX Slide Helper API")
    print("  Token-Efficient Single Slide Retrieval")
    print("=" * 60)
    print(f"🔗 ADS I-Document-PPTX API: {PRESENTON_API_URL}")
    print(f"🌐 Starting on http://0.0.0.0:5002")
    print("📋 Available endpoints:")
    print("  • GET /api/v1/ppt/slide/{slide_id} - Get single slide")
    print("  • POST /api/v1/ppt/slide - Add new slide to presentation")
    print("  • PATCH /api/v1/ppt/slide/move - Move slide to new position")
    print("  • DELETE /api/v1/ppt/slide/{slide_id} - Delete slide")
    print("  • GET /health - Health check")
    print("\nPress CTRL+C to stop\n")

    uvicorn.run(app, host="0.0.0.0", port=5002)
