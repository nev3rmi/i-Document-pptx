from typing import Annotated, Optional
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from services.database import get_async_session
from services.image_generation_service import ImageGenerationService
from utils.asset_directory_utils import get_images_directory
from utils.llm_calls.edit_slide import get_edited_slide_content
from utils.llm_calls.edit_slide_html import get_edited_slide_html
from utils.llm_calls.select_slide_type_on_edit import get_slide_layout_from_prompt
from utils.llm_calls.generate_text_variants import generate_text_variants
from utils.llm_calls.generate_layout_variants import generate_layout_variants
from utils.process_slides import process_old_and_new_slides_and_fetch_assets
import uuid


SLIDE_ROUTER = APIRouter(prefix="/slide", tags=["Slide"])


@SLIDE_ROUTER.get("/{slide_id}", response_model=SlideModel)
async def get_slide(
    slide_id: uuid.UUID,
    sql_session: AsyncSession = Depends(get_async_session),
):
    """Get a single slide by ID"""
    slide = await sql_session.get(SlideModel, slide_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    return slide


@SLIDE_ROUTER.post("/edit")
async def edit_slide(
    id: Annotated[uuid.UUID, Body()],
    prompt: Annotated[str, Body()],
    sql_session: AsyncSession = Depends(get_async_session),
):
    slide = await sql_session.get(SlideModel, id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    presentation = await sql_session.get(PresentationModel, slide.presentation)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    presentation_layout = presentation.get_layout()
    slide_layout = await get_slide_layout_from_prompt(
        prompt, presentation_layout, slide
    )

    edited_slide_content = await get_edited_slide_content(
        prompt, slide, presentation.language, slide_layout
    )

    image_generation_service = ImageGenerationService(get_images_directory())

    # This will mutate edited_slide_content
    new_assets = await process_old_and_new_slides_and_fetch_assets(
        image_generation_service,
        slide.content,
        edited_slide_content,
    )

    # Always assign a new unique id to the slide
    slide.id = uuid.uuid4()

    sql_session.add(slide)
    slide.content = edited_slide_content
    slide.layout = slide_layout.id
    slide.speaker_note = edited_slide_content.get("__speaker_note__", "")
    sql_session.add_all(new_assets)
    await sql_session.commit()

    return slide


@SLIDE_ROUTER.post("/edit-html", response_model=SlideModel)
async def edit_slide_html(
    id: Annotated[uuid.UUID, Body()],
    prompt: Annotated[str, Body()],
    html: Annotated[Optional[str], Body()] = None,
    sql_session: AsyncSession = Depends(get_async_session),
):
    slide = await sql_session.get(SlideModel, id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")

    html_to_edit = html or slide.html_content
    if not html_to_edit:
        raise HTTPException(status_code=400, detail="No HTML to edit")

    edited_slide_html = await get_edited_slide_html(prompt, html_to_edit)

    # Always assign a new unique id to the slide
    # This is to ensure that the nextjs can track slide updates
    slide.id = uuid.uuid4()

    sql_session.add(slide)
    slide.html_content = edited_slide_html
    await sql_session.commit()

    return slide


@SLIDE_ROUTER.post("/text-variants")
async def get_text_variants(
    selected_text: Annotated[str, Body()],
    variant_count: Annotated[int, Body()] = 3,
):
    """
    Generate alternative versions of selected text.

    This endpoint uses LLM to create variations of the provided text
    while maintaining the core meaning and message.

    Args:
        selected_text: The text to generate variants for
        variant_count: Number of variants to generate (default: 3, max: 5)

    Returns:
        Dictionary with 'variants' key containing list of alternative texts
    """
    if not selected_text or not selected_text.strip():
        raise HTTPException(status_code=400, detail="Selected text cannot be empty")

    # Ensure variant_count is within valid range
    variant_count = max(1, min(variant_count, 5))

    variants = await generate_text_variants(selected_text, variant_count)

    return {"variants": variants}


@SLIDE_ROUTER.post("/layout-variants")
async def get_layout_variants(
    html: Annotated[str, Body()],
    full_slide_html: Annotated[str, Body()],
    block_type: Annotated[str, Body()],
    available_width: Annotated[int, Body()],
    available_height: Annotated[int, Body()],
    parent_container_info: Annotated[str | None, Body()] = None,
    variant_count: Annotated[int, Body()] = 3,
    transformation_scope: Annotated[str | None, Body()] = 'block',
):
    """
    Generate layout variants for a selected HTML block with full slide context.

    This endpoint generates alternative layout arrangements for structural
    containers like grids, columns, and list containers. It uses the full slide
    HTML for context and dimensional constraints to ensure generated layouts will
    render correctly.

    Args:
        html: The HTML content of the selected block to transform
        full_slide_html: The complete HTML of the slide for context
        block_type: Type of block (grid-container, column, list-container, list-item)
        available_width: Available width in pixels for this block
        available_height: Available height in pixels for this block
        parent_container_info: Optional info about parent container constraints
        variant_count: Number of variants to generate (default: 3, max: 3)

    Returns:
        Dictionary with 'variants' key containing list of layout variants,
        each with title, description, and modified HTML
    """
    if not html or not html.strip():
        raise HTTPException(status_code=400, detail="HTML content cannot be empty")

    if not block_type:
        raise HTTPException(status_code=400, detail="Block type is required")

    if available_width <= 0 or available_height <= 0:
        raise HTTPException(status_code=400, detail="Available dimensions must be positive")

    # Ensure variant_count is within valid range
    variant_count = max(1, min(variant_count, 3))

    variants = await generate_layout_variants(
        html=html,
        full_slide_html=full_slide_html,
        block_type=block_type,
        available_width=available_width,
        available_height=available_height,
        parent_container_info=parent_container_info,
        variant_count=variant_count,
        transformation_scope=transformation_scope or 'block',
    )

    return {"variants": [v.model_dump() for v in variants]}


@SLIDE_ROUTER.post("/save-html-variant", response_model=SlideModel)
async def save_html_variant(
    id: Annotated[uuid.UUID, Body()],
    html_content: Annotated[str, Body()],
    sql_session: AsyncSession = Depends(get_async_session),
):
    """
    Save custom HTML variant for a slide, or clear it to revert to template.

    This endpoint allows saving a rendered HTML version of the slide that will
    be displayed instead of the template-based JSON rendering. This enables
    custom layouts while keeping the JSON content intact.

    Pass an empty string to clear html_content and revert to template rendering.

    Args:
        id: UUID of the slide to update
        html_content: The HTML content to save (rendered from frontend), or empty string to clear

    Returns:
        Updated slide with new ID and html_content set or cleared
    """
    slide = await sql_session.get(SlideModel, id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")

    # Always assign a new unique id to the slide
    # This ensures that the frontend can track slide updates
    slide.id = uuid.uuid4()

    sql_session.add(slide)
    # Allow empty string to clear html_content (revert to template)
    slide.html_content = html_content if html_content.strip() else None
    await sql_session.commit()

    return slide
