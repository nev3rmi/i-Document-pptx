"""
Generate layout variants for selected HTML blocks.
This provides visual previews of different layout options for structural containers.
"""
from typing import List, Optional
from pydantic import BaseModel
from fastapi import HTTPException
from services.llm_client import LLMClient
from models.llm_message import LLMSystemMessage, LLMUserMessage, LLMImageContent, LLMTextContent, ImageUrl
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
- Proper sizing within available space

**CRITICAL CONTEXT AWARENESS**:
- You will receive the FULL SLIDE HTML for context (colors, theme, spacing patterns)
- You will receive PARENT CONTAINER information (width, layout constraints)
- You will receive AVAILABLE DIMENSIONS (how much space this block has)
- Your layouts MUST fit within the available space
- Use the full slide context to match the overall design aesthetic

**Layout Changes to Focus On**:
- Column arrangements (2-col ↔ 3-col ↔ single col)
- Grid layouts (2x2, 3x3, flex-wrap) - BUT only if space allows
- List presentations (vertical, horizontal, grid)
- Spacing and alignment variations
- Container arrangements

**SIZING RULES**:
- If available width is < 300px: Use single column layouts only
- If available width is 300-600px: Max 2 columns
- If available width is > 600px: Up to 3 columns allowed
- Always ensure content doesn't overflow
- Grid columns should have minimum 150px width each

Return ONLY the modified HTML for the selected block, not the entire slide."""


def get_user_prompt(
    html: str,
    full_slide_html: str,
    block_type: str,
    available_width: int,
    available_height: int,
    parent_container_info: Optional[str] = None,
) -> str:
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

    # Adjust suggestions based on available width
    if available_width < 300:
        # Too narrow for grid layouts
        layout_suggestions["list-container"] = [
            "Vertical list with generous spacing (space-y-6 or space-y-8)",
            "Compact vertical list (space-y-4)",
            "Vertical list with dividers between items",
        ]
    elif available_width < 600:
        # Can handle 2 columns max
        layout_suggestions["list-container"] = [
            "Vertical list with generous spacing (space-y-6 or space-y-8)",
            "2-column grid layout (grid grid-cols-2 gap-4)",
            "Vertical list with alternating item styles",
        ]

    parent_info_text = f"\n\n**Parent Container**: {parent_container_info}" if parent_container_info else ""

    # Send full slide HTML - no truncation
    # The AI needs complete context to understand colors, spacing, and design patterns
    # Typical slides are 10-30KB (2500-7500 tokens) which is acceptable
    slide_context_note = f"\n\n**Full Slide HTML Context** (for understanding colors, themes, and overall layout):\n```html\n{full_slide_html}\n```" if full_slide_html else ""

    return f"""Generate 3 layout variants for this HTML block.

**CONTEXT**: You will see the complete slide HTML to understand the overall theme, colors, and layout context.

**Block Type**: {block_type}

**Available Space**:
- Width: {available_width}px
- Height: {available_height}px{parent_info_text}

**Selected Block HTML** (to transform):
```html
{html}
```
{slide_context_note}

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
1. **USE THE FULL SLIDE CONTEXT** to match colors, spacing patterns, and design theme
2. **RESPECT THE AVAILABLE WIDTH ({available_width}px)** - layouts must fit
3. Keep the EXACT SAME content (text, images, icons) - DO NOT modify any text
4. Keep all existing Tailwind classes on child elements (colors, padding, text styles, etc.)
5. ONLY change the OUTER container's layout classes (flex, grid, space-y, etc.)
6. For grid layout: Each column needs minimum 150px, so with {available_width}px width, use maximum {min(3, available_width // 150)} columns
7. For flex row, USE: "flex flex-row gap-4" or "flex flex-wrap gap-4"
8. For vertical list, USE: "space-y-6" or "space-y-8" (increase spacing only)
9. DO NOT add new HTML elements except the outer container
10. Return ONLY the modified block HTML, nothing more"""


def generate_static_variants(html: str, block_type: str, available_width: int, variant_count: int = 3) -> List[LayoutVariant]:
    """
    Generate static mock variants for testing without AI.
    Performs simple rule-based layout transformations using regex to preserve exact HTML.
    """
    import re

    variants = []

    # Extract the opening tag with its classes
    tag_match = re.search(r'^<(\w+)([^>]*)>', html, re.DOTALL)
    if not tag_match:
        # Fallback if HTML is invalid
        return [
            LayoutVariant(
                title="Original Layout",
                description="Keeping the current layout unchanged",
                html=html
            )
        ]

    tag_name = tag_match.group(1)
    tag_attrs = tag_match.group(2)

    # Extract class attribute
    class_match = re.search(r'class=["\']([^"\']*)["\']', tag_attrs)
    current_classes = class_match.group(1).split() if class_match else []

    # Remove layout-related classes
    base_classes = [c for c in current_classes if not any(
        layout_keyword in c for layout_keyword in
        ['flex', 'grid', 'space-y', 'space-x', 'gap-', 'cols-']
    )]

    # Get the inner content (everything between opening and closing tags)
    inner_content_match = re.search(r'^<\w+[^>]*>(.*)</\w+>$', html, re.DOTALL)
    inner_content = inner_content_match.group(1) if inner_content_match else ''

    # Get other attributes (preserve them exactly)
    other_attrs = re.sub(r'class=["\']([^"\']*)["\']', '', tag_attrs).strip()

    # Helper function to rebuild HTML with new classes
    def build_html_with_classes(new_classes: list, extra_style: str = '') -> str:
        """Rebuild HTML preserving exact structure but with new classes"""
        class_str = ' '.join(new_classes)

        # Rebuild opening tag
        if other_attrs:
            if extra_style:
                new_opening = f'<{tag_name} class="{class_str}" style="{extra_style}" {other_attrs}>'
            else:
                new_opening = f'<{tag_name} class="{class_str}" {other_attrs}>'
        else:
            if extra_style:
                new_opening = f'<{tag_name} class="{class_str}" style="{extra_style}">'
            else:
                new_opening = f'<{tag_name} class="{class_str}">'

        # Return complete HTML
        return f'{new_opening}{inner_content}</{tag_name}>'

    if block_type == 'list-container' or 'space-y' in ' '.join(current_classes):
        # Variant 1: Vertical list with more spacing
        variant1_classes = base_classes + ['space-y-8']
        variants.append(LayoutVariant(
            title="Spacious Vertical List",
            description="Increased vertical spacing between items using 'space-y-8' for better readability",
            html=build_html_with_classes(variant1_classes)
        ))

        # Variant 2: 2-column grid
        if available_width >= 300:
            variant2_classes = base_classes + ['grid', 'grid-cols-2', 'gap-4']
            variants.append(LayoutVariant(
                title="2-Column Grid",
                description="Arranged items in a 2-column grid layout with 'grid grid-cols-2 gap-4'",
                html=build_html_with_classes(variant2_classes)
            ))

        # Variant 3: 3-column grid (if space allows)
        if available_width >= 600:
            variant3_classes = base_classes + ['grid', 'grid-cols-3', 'gap-6']
            variants.append(LayoutVariant(
                title="3-Column Grid",
                description="Distributed items across 3 columns using 'grid grid-cols-3 gap-6' for better space utilization",
                html=build_html_with_classes(variant3_classes)
            ))
        else:
            # Fallback: horizontal flex
            variant3_classes = base_classes + ['flex', 'flex-row', 'gap-4', 'flex-wrap']
            variants.append(LayoutVariant(
                title="Horizontal Flex Row",
                description="Arranged items horizontally with flex-wrap for responsive layout",
                html=build_html_with_classes(variant3_classes)
            ))

    elif block_type == 'grid-container' or 'grid' in ' '.join(current_classes):
        # Variant 1: 2-column
        variant1_classes = base_classes + ['grid', 'grid-cols-2', 'gap-4']
        variants.append(LayoutVariant(
            title="2-Column Grid",
            description="Simple 2-column grid with even spacing",
            html=build_html_with_classes(variant1_classes)
        ))

        # Variant 2: 3-column
        if available_width >= 600:
            variant2_classes = base_classes + ['grid', 'grid-cols-3', 'gap-6']
            variants.append(LayoutVariant(
                title="3-Column Grid",
                description="Expanded to 3 columns for better content distribution",
                html=build_html_with_classes(variant2_classes)
            ))

        # Variant 3: 4-column or auto-fit
        if available_width >= 800:
            variant3_classes = base_classes + ['grid', 'grid-cols-4', 'gap-4']
            variants.append(LayoutVariant(
                title="4-Column Grid",
                description="Compact 4-column layout for dense information",
                html=build_html_with_classes(variant3_classes)
            ))
        else:
            # Fallback: Auto-fit grid
            variant3_classes = base_classes + ['grid', 'gap-4']
            variants.append(LayoutVariant(
                title="Auto-Fit Grid",
                description="Responsive grid that adapts to available space",
                html=build_html_with_classes(variant3_classes, 'grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));')
            ))

    else:
        # Generic fallback variants
        # Variant 1: Flex column
        variant1_classes = base_classes + ['flex', 'flex-col', 'gap-4']
        variants.append(LayoutVariant(
            title="Vertical Stack",
            description="Stacked vertically with consistent spacing",
            html=build_html_with_classes(variant1_classes)
        ))

        # Variant 2: Flex row
        if available_width >= 400:
            variant2_classes = base_classes + ['flex', 'flex-row', 'gap-6', 'flex-wrap']
            variants.append(LayoutVariant(
                title="Horizontal Flow",
                description="Arranged horizontally with wrapping",
                html=build_html_with_classes(variant2_classes)
            ))

        # Variant 3: Grid
        if available_width >= 500:
            variant3_classes = base_classes + ['grid', 'grid-cols-2', 'gap-6']
            variants.append(LayoutVariant(
                title="Grid Layout",
                description="2-column grid for balanced presentation",
                html=build_html_with_classes(variant3_classes)
            ))

    # Ensure we always return at least one variant
    if not variants:
        variants.append(LayoutVariant(
            title="Original Layout",
            description="Keeping the current layout unchanged",
            html=html
        ))

    return variants[:variant_count]


async def generate_layout_variants(
    html: str,
    full_slide_html: str,
    block_type: str,
    available_width: int,
    available_height: int,
    parent_container_info: Optional[str] = None,
    variant_count: int = 3,
) -> List[LayoutVariant]:
    """
    Generate layout variants for a selected HTML block with full slide context.

    Args:
        html: The HTML content of the selected block to transform
        full_slide_html: The complete HTML of the slide for context
        block_type: Type of block (grid-container, column, list-container, list-item)
        available_width: Available width in pixels for this block
        available_height: Available height in pixels for this block
        parent_container_info: Optional info about parent container (e.g., "flex-1 column within md:w-1/2 parent")
        variant_count: Number of variants to generate (1-3)

    Returns:
        List of LayoutVariant objects with title, description, and modified HTML
    """
    # DEBUG FLAG: Set to True to use static variants for testing
    USE_STATIC_VARIANTS = True

    if USE_STATIC_VARIANTS:
        print("[Layout Variants] Using STATIC variants (AI disabled for testing)")
        variant_count = max(1, min(variant_count, 3))
        return generate_static_variants(html, block_type, available_width, variant_count)

    try:
        variant_count = max(1, min(variant_count, 3))
        llm_client = LLMClient()

        # Log input sizes
        print(f"[Layout Variants] Input sizes:")
        print(f"  - Block HTML: {len(html)} chars")
        print(f"  - Full slide HTML: {len(full_slide_html)} chars")

        # Estimate token count (rough: 1 token ≈ 4 characters)
        estimated_tokens = (len(html) + len(full_slide_html)) // 4
        print(f"  - Estimated input tokens: ~{estimated_tokens}")

        # Build user message with full slide context
        user_prompt = get_user_prompt(
            html,
            full_slide_html,
            block_type,
            available_width,
            available_height,
            parent_container_info
        )

        print(f"  - Final prompt length: {len(user_prompt)} chars (~{len(user_prompt)//4} tokens)")

        messages = [
            LLMSystemMessage(content=get_system_prompt()),
            LLMUserMessage(content=user_prompt),
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
