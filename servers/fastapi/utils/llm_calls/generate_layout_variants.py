"""
Generate layout variants for selected HTML blocks.
This provides visual previews of different layout options for structural containers.
"""
from typing import List
from pydantic import BaseModel
from fastapi import HTTPException
from services.llm_client import LLMClient
from models.llm_message import LLMSystemMessage, LLMUserMessage
from utils.llm_provider import get_model
import traceback


class LayoutVariant(BaseModel):
    """Represents a layout variant with HTML and description"""
    title: str
    description: str
    html: str


class LayoutVariants(BaseModel):
    """Collection of layout variants"""
    variants: List[LayoutVariant]


def get_system_prompt() -> str:
    return """You are an expert HTML/CSS layout designer specializing in presentation slides.

Your task is to generate alternative layout variations for selected HTML blocks while maintaining:
- Visual hierarchy and readability
- Responsive design principles
- Professional presentation aesthetics
- Content integrity (don't change the text)

Focus on structural changes like:
- Column arrangements (2-col ↔ 3-col ↔ single col)
- Grid layouts (2x2, 3x3, flex-wrap)
- List presentations (vertical, horizontal, grid)
- Spacing and alignment variations
- Container arrangements

Return ONLY the modified HTML for the selected block, not the entire slide."""


def get_user_prompt(html: str, block_type: str) -> str:
    layout_suggestions = {
        "grid-container": [
            "2-column grid layout with equal spacing",
            "3-column grid layout for better content distribution",
            "4-column grid layout for compact display",
        ],
        "column": [
            "Single centered column for focused content",
            "Two-column layout with 60-40 split",
            "Three-column layout with equal distribution",
        ],
        "list-container": [
            "Vertical list with generous spacing (space-y-6 or space-y-8)",
            "2-column grid layout (grid grid-cols-2 gap-4) - wrap items in grid container",
            "Horizontal flex layout (flex flex-row gap-4) for compact display",
        ],
        "list-item": [
            "Compact inline layout with icon on left",
            "Card-style layout with prominent visual",
            "Minimal layout with icon and title only",
        ],
    }

    suggestions = layout_suggestions.get(block_type, [
        "Improved spacing and visual hierarchy",
        "Alternative column arrangement",
        "Reorganized content structure",
    ])

    # Provide concrete examples for list-container
    examples = ""
    if block_type == "list-container":
        examples = """

**IMPORTANT EXAMPLES**:

For VERTICAL LAYOUT (Option 1):
```html
<div class="space-y-6">
  <!-- Each child item here with increased spacing -->
  <div class="flex items-start space-x-4">...</div>
  <div class="flex items-start space-x-4">...</div>
</div>
```

For GRID LAYOUT (Option 2) - USE THIS EXACT PATTERN:
```html
<div class="grid grid-cols-2 gap-4">
  <!-- Wrap each child item in a grid cell -->
  <div class="flex items-start space-x-4">...</div>
  <div class="flex items-start space-x-4">...</div>
  <div class="flex items-start space-x-4">...</div>
</div>
```

For HORIZONTAL LAYOUT (Option 3):
```html
<div class="flex flex-row gap-4">
  <!-- Each child item here in a row -->
  <div class="flex items-start space-x-4">...</div>
  <div class="flex items-start space-x-4">...</div>
</div>
```"""

    return f"""Generate 3 layout variants for this HTML block.

**Block Type**: {block_type}

**Current HTML**:
```html
{html}
```

**Required Variants**:
1. {suggestions[0]}
2. {suggestions[1]}
3. {suggestions[2] if len(suggestions) > 2 else "Creative alternative layout"}
{examples}

For each variant provide:
- **title**: Short name (e.g., "2-Column Grid", "Vertical List", "Horizontal Flex")
- **description**: Brief explanation of the layout change (mention the CSS classes used)
- **html**: The complete modified HTML with ONLY the selected block changed

**CRITICAL RULES**:
1. Keep the EXACT SAME content (text, images, icons) - DO NOT modify any text
2. Keep all existing Tailwind classes on child elements (colors, padding, text styles, etc.)
3. ONLY change the OUTER container's layout classes (flex, grid, space-y, etc.)
4. For grid layout, USE: "grid grid-cols-2 gap-4" or "grid grid-cols-3 gap-4"
5. For flex row, USE: "flex flex-row gap-4" or "flex flex-wrap gap-4"
6. For vertical list, USE: "space-y-6" or "space-y-8" (increase spacing only)
7. DO NOT add new HTML elements except the outer container
8. Return ONLY the modified block HTML, nothing more"""


async def generate_layout_variants(
    html: str,
    block_type: str,
    variant_count: int = 3,
) -> List[LayoutVariant]:
    """
    Generate layout variants for a selected HTML block.

    Args:
        html: The HTML content of the selected block
        block_type: Type of block (grid-container, column, list-container, list-item)
        variant_count: Number of variants to generate (1-3)

    Returns:
        List of LayoutVariant objects with title, description, and modified HTML
    """
    try:
        variant_count = max(1, min(variant_count, 3))
        llm_client = LLMClient()

        messages = [
            LLMSystemMessage(content=get_system_prompt()),
            LLMUserMessage(content=get_user_prompt(html, block_type)),
        ]

        # Use structured output to get consistent JSON response
        response_dict = await llm_client.generate_structured(
            model=get_model(),
            messages=messages,
            response_format=LayoutVariants.model_json_schema(),
            strict=True,
        )

        response = LayoutVariants(**response_dict)
        return response.variants[:variant_count]

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate layout variants: {str(e)}"
        )
