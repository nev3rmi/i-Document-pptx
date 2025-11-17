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
    return """You are a professional presentation designer who creates beautiful, consistent layouts.

**Your Mission**: Transform layouts to be more visually interesting while maintaining the slide's design integrity.

**Core Design Principles**:

1. **Spacing Discipline** (8px Grid System)
   - ONLY use: gap-4 (16px), gap-6 (24px), gap-8 (32px), gap-12 (48px)
   - NEVER use: gap-3, gap-5, gap-7, gap-10, or arbitrary values
   - Preserve original spacing values from template
   - Maintain visual rhythm with consistent spacing

2. **Preserve Template DNA**
   - Extract shadows, borders, backgrounds from ORIGINAL
   - Keep them EXACTLY the same in variants
   - Don't add new visual decorations (shadows, borders, bg-white)
   - Only modify layout structure (flex, grid, spacing, alignment)

3. **Intentional Asymmetry** (Golden Ratio)
   - Use ONLY these splits: 50/50, 60/40, 62/38 (golden ratio), 70/30
   - Implement with Tailwind: grid-cols-5 → col-span-3/col-span-2 for 60/40
   - NEVER use random splits like 55/45, 65/35

4. **Count-Aware Layouts**
   - 2-3 items: Single column (space-y-8) OR horizontal row (flex space-x-12)
   - 4 items: grid-cols-2 (equal weight) OR hero grid (1 featured)
   - 5 items: Bento grid OR single column (avoid equal 5-column grid)
   - 6 items: grid-cols-3 (preferred for equal weight)
   - 7+ items: grid-cols-4 (compact) OR masonry

5. **3-Level Hierarchy Maximum**
   - DOMINANT: 1 element (largest/boldest) - primary focal point
   - SUB-DOMINANT: 1-2 elements (medium emphasis)
   - SUBORDINATE: All remaining (least emphasis)
   - NEVER create 4+ different emphasis levels

6. **Visual Balance**
   - Large element + multiple small elements = balanced
   - Symmetric grids need equal spacing
   - Asymmetric layouts need visual weight balance
   - Use generous whitespace (minimum 24px margins)

7. **Maintain Consistency**
   - Same colors across all items
   - Same typography hierarchy
   - Same visual treatment (if item 1 has shadow, ALL items have shadow)
   - Same spacing rhythm throughout

**CRITICAL CONSTRAINTS**:
- Preserve exact text content
- Preserve data-textpath, data-path, data-block-anchor attributes
- Use CSS variables for colors: var(--primary-accent-color), var(--text-heading-color)
- Return ONLY the modified block HTML
- Match slide's existing color palette and typography

**Creative Freedom (Within Constraints)**:
- Transform structure: vertical → grid → horizontal → masonry
- Vary item sizes using col-span, row-span
- Change spacing values (but only gap-4/6/8/12)
- Rearrange item order for better visual flow
- Create feature/hero items with intentional spanning

Be creative with structure, disciplined with styling."""


def get_slide_transformation_prompt(
    html: str,
    full_slide_html: str,
    block_type: str,
    available_width: int,
    available_height: int,
    parent_container_info: Optional[str] = None,
    variant_count: int = 3,
) -> str:
    """Generate prompt for whole-slide transformations (dramatic rearrangements)"""

    return f"""Design {variant_count} dramatic slide layout variant{'s' if variant_count > 1 else ''} by rearranging major sections.

**Your Canvas**: Entire slide content area
- Available Space: {available_width}px × {available_height}px
- Current structure contains multiple major sections (title, image, content blocks)

**Slide Content to Rearrange**:
```html
{html}
```

**Full Slide Context**:
```html
{full_slide_html}
```

**What You Can Do** (Whole-Slide Scope):
1. **Move title**: top-left → top-right → centered → bottom
2. **Flip image**: left side ↔ right side ↔ center ↔ remove to focus on content
3. **Transform content blocks**:
   - Vertical list → horizontal 4-column grid
   - 2×2 grid → single column timeline
   - Side-by-side → stacked vertically
4. **Rearrange major sections**: Title/Image/Content in different orders
5. **Change content orientation**: Portrait (tall) ↔ Landscape (wide)

**Design Principles** (Same as block-level):
- Preserve colors, fonts, data attributes (data-textpath, data-path, data-block-anchor)
- Use 8px spacing grid (gap-4, gap-6, gap-8, gap-12 only)
- Don't add shadows/borders if original doesn't have them
- Maintain 3-level visual hierarchy (1 dominant, 1-2 sub-dominant, rest subordinate)

**Generate {variant_count} Completely Different Slide Layouts**:
1. **Layout A**: Image left, title top-right, content vertical list on right
2. **Layout B**: Title centered top, content as horizontal 4-column grid, image bottom or removed
3. **Layout C**: {f"Your creative layout - analyze content and create stunning arrangement" if variant_count >= 3 else "Image right, title top-left, content 2-column grid"}

For each variant provide:
- **title**: Layout name (e.g., "Image-Left Hero", "Centered Grid", "Timeline Flow")
- **description**: Explain the layout strategy and visual flow
- **html**: The complete rearranged slide content HTML

Return ONLY the transformed HTML for the selected block (which is the whole slide content area)."""


def get_user_prompt(
    html: str,
    full_slide_html: str,
    block_type: str,
    available_width: int,
    available_height: int,
    parent_container_info: Optional[str] = None,
    variant_count: int = 3,
) -> str:
    layout_suggestions = {
        "grid-container": [
            "Equal grid with balanced spacing (grid-cols-2 or grid-cols-3 based on item count)",
            "Hero grid: First item spans 2×2, others are compact (use col-span-2 row-span-2)",
            "Creative beautiful layout: Analyze item count, use golden ratio (60/40), dramatic spacing (gap-8 or gap-12), intentional asymmetry. Make it magazine-quality!",
        ],
        "column": [
            "Generous vertical spacing with rhythmic gaps (space-y-8 or space-y-12)",
            "Compact efficient stack with tight spacing (space-y-4)",
            "Creative beautiful layout: Dramatic top/bottom margins, varied spacing rhythm, elegant whitespace. Make it striking!",
        ],
        "list-container": [
            "Generous vertical list with breathing room (space-y-8)",
            "Balanced 2-column grid if 4-6 items (grid grid-cols-2 gap-6)",
            "Creative beautiful layout: Transform to horizontal timeline OR masonry grid OR bento layout. Analyze item count first!",
        ],
        "list-item": [
            "Horizontal inline with icon left (flex gap-4)",
            "Vertical stack with centered icon (flex-col items-center text-center)",
            "Creative beautiful layout: Experiment with icon size, text alignment, padding. Make it elegant!",
        ],
    }

    suggestions = layout_suggestions.get(block_type, [
        "Improved spacing and visual hierarchy",
        "Alternative column arrangement",
        "**FREESTYLE BEAUTIFUL**: Create something stunning!",
    ])

    # If only generating 1 variant, use the FREESTYLE option (most creative)
    if variant_count == 1 and len(suggestions) >= 3:
        suggestions = [suggestions[2]]  # Use the freestyle option only

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

    return f"""Design {variant_count} creative layout variant{'s' if variant_count > 1 else ''} for this content block. Think like a presentation designer, not a developer.

**Your Design Canvas**:
- Type: {block_type}
- Available Space: {available_width}px × {available_height}px{parent_info_text}
- Maximum columns possible: {min(3, available_width // 150)} (based on 150px minimum per column)

**Content to Transform**:
```html
{html}
```
{slide_context_note}

**STEP 1: Analyze the Original Design** (DO THIS FIRST!)

Before generating variants, extract these design elements from the ORIGINAL block HTML above:

1. **Shadows**: Does it have shadow-sm, shadow-md, shadow-lg, or NO shadows?
2. **Backgrounds**: Does it have bg-white, bg-gray-50, or NO background (transparent)?
3. **Borders**: Does it have border, border-2, or NO borders?
4. **Rounded Corners**: What level? rounded-sm, rounded-lg, rounded-xl, or none?
5. **Padding on Items**: What padding do individual items have? p-4, p-6, p-8?
6. **Current Spacing**: What gaps/spacing? gap-4, gap-6, space-y-6?
7. **Item Count**: How many child items are there?

**PRESERVE THESE EXACTLY in all variants** - Don't add shadows if original has none, don't remove shadows if original has them!

**STEP 2: Learn from Good vs Bad Examples**

✓ **GOOD Transformation** (structural change only):
```
Original: <div class="space-y-4"><div class="flex gap-4 p-4 rounded-lg">Item</div></div>
Variant:  <div class="grid grid-cols-2 gap-6"><div class="flex gap-4 p-4 rounded-lg">Item</div></div>
```
Why good: Changed container (space-y-4 → grid), preserved item styling (p-4, rounded-lg)

✗ **BAD Transformation** (added random decorations):
```
Original: <div class="space-y-4"><div class="flex gap-4 p-4 rounded-lg">Item</div></div>
Variant:  <div class="grid grid-cols-2 gap-5"><div class="flex gap-4 p-6 rounded-xl shadow-lg bg-white border-2">Item</div></div>
```
Why bad: Changed item styling (p-4→p-6, added shadow-lg, bg-white, border-2), used gap-5 (not multiple of 8)

**STEP 3: Generate Your Creative Variants**

**Design Direction** (use as inspiration, not rigid requirements):
{chr(10).join(f"{i+1}. {suggestions[i]}" if i < len(suggestions) else f"{i+1}. Your creative alternative - surprise us!" for i in range(variant_count))}
{examples}

**What to Deliver**:
For each variant, provide:
- **title**: Descriptive name that conveys the design concept (e.g., "Airy Grid", "Timeline Flow", "Featured Hero")
- **description**: Explain the design decision and visual impact (not just CSS classes)
- **html**: The transformed block HTML with your layout changes applied

**Design Guidelines**:
✓ Study the full slide context - match its visual language and color palette
✓ Respect the available width ({available_width}px) - designs must be technically feasible
✓ Preserve ALL text content exactly - never modify the words themselves
✓ Keep data-textpath and data-path attributes on elements (essential for editing)
✓ Use Tailwind utility classes for consistency with the existing codebase

**Creative Freedom** (Be BOLD with these changes):
- **Dramatically change spacing**: tight (gap-2) → moderate (gap-6) → generous (gap-12)
- **Transform grid layouts**: 2×2 → 3×1 → 1×4 → asymmetric masonry (mix of row/col spans)
- **Vary item sizes**: Make some items 2x larger (col-span-2, row-span-2) for emphasis
- **Change alignment**: items-start → items-center → items-end
- **Modify padding/margins**: Add dramatic top/bottom spacing (mt-8, mb-16, py-12)
- **Rearrange visual flow**: horizontal → vertical → diagonal → grid
- **Add visual hierarchy**: Scale up first/last items, offset alternating items
- **You CAN modify child element layout classes** (flex, grid, padding, margins) to create dramatic differences

**Technical Requirements**:
- Grid columns must be at least 150px wide
- Use Tailwind classes only (flex, grid, space-y, gap-, etc.)
- Return ONLY the modified block HTML (not the entire slide)
- Preserve any data-block-anchor attributes if present

Be creative. Make design choices that elevate the presentation. Show us three distinctly different approaches."""


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
        # Variant 1: DRAMATIC RESTRUCTURE - Wrap in card with border
        # This completely changes the HTML structure while preserving data-textpath
        inner_classes = ' '.join(base_classes + ['space-y-6'])
        wrapped_html = f'<div class="border-4 border-blue-500 rounded-lg p-6 bg-blue-50 shadow-xl"><div class="{inner_classes}">{inner_content}</div></div>'
        variants.append(LayoutVariant(
            title="🎯 DRAMATIC: Card Layout",
            description="TESTING: Wrapped entire block in nested divs with border/shadow - verifies data-textpath survives restructuring",
            html=wrapped_html
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
    transformation_scope: str = 'block',
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
    USE_STATIC_VARIANTS = False

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

        # Build user message with appropriate prompt based on transformation scope
        print(f"  - Transformation scope: {transformation_scope}")

        if transformation_scope == 'slide':
            # Whole-slide transformation: dramatic rearrangements
            user_prompt = get_slide_transformation_prompt(
                html,
                full_slide_html,
                block_type,
                available_width,
                available_height,
                parent_container_info,
                variant_count
            )
            print(f"  - Using SLIDE transformation prompt (dramatic rearrangements)")
        else:
            # Block or section transformation: structural changes only
            user_prompt = get_user_prompt(
                html,
                full_slide_html,
                block_type,
                available_width,
                available_height,
                parent_container_info,
                variant_count
            )
            print(f"  - Using BLOCK transformation prompt (structural changes)")

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
