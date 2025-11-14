# Dynamic HTML Template Plan

**Date**: 2025-11-14
**Goal**: Make HTML variants editable by creating a dynamic template that preserves React editing functionality

---

## Problem Summary

### Current Issue
When applying layout variants from Smart Panel, we save the rendered HTML and display it using `dangerouslySetInnerHTML`. This creates **static HTML without React components**, which breaks:

- ❌ TiptapText editing (can't edit text)
- ❌ Block selection (can't select blocks)
- ❌ Smart Panel functionality (can't detect content)
- ❌ All event listeners (no interactivity)

### Why It Happens
```typescript
// In useTemplateLayouts.tsx
if (slide.html_content && slide.html_content.trim()) {
  return <div dangerouslySetInnerHTML={{ __html: slide.html_content }} />;
}
```

`dangerouslySetInnerHTML` renders raw HTML string → No React components mounted → No functionality.

### What We Want
- ✅ Custom layouts from variants (various and customizable)
- ✅ Full editing functionality (TiptapText, block selection, Smart Panel)
- ✅ Clean, maintainable code
- ✅ Works with all future variants

---

## Solution: Dynamic HTML Template

### Core Concept

Instead of storing and rendering **raw HTML**, we:

1. **Parse HTML structure** into a data format
2. **Store structured data** (layout + content separated)
3. **Render via React template** that reconstructs the layout
4. **Mount React components** in editable regions
5. **Preserve all editing functionality**

### Architecture Flow

```
Layout Variant Applied
    ↓
Capture Rendered HTML
    ↓
Parse HTML → Extract Structure + Content
    ↓
Save Structure Data (not raw HTML)
    ↓
DynamicHtmlLayout Template Renders
    ↓
Mount React Components (TiptapText, etc.)
    ↓
Full Editing Works ✅
```

### Comparison: Before vs After

**BEFORE (Current - Broken)**:
```typescript
// Stored in database
html_content: "<div class='flex'><div contenteditable='true'>Text</div></div>"

// Rendered
<div dangerouslySetInnerHTML={{ __html: slide.html_content }} />
// ❌ Static HTML, no React, no editing
```

**AFTER (Dynamic Template - Works)**:
```typescript
// Stored in database
html_structure: {
  layout: "dynamic",
  blocks: [
    {
      type: "container",
      classes: "flex flex-col",
      children: [
        { type: "editable-text", id: "heading-1", content: "Text" }
      ]
    }
  ]
}

// Rendered
<DynamicHtmlLayout data={slide.html_structure} />
  → Renders: <div className="flex flex-col">
              <TiptapText content="Text" />
            </div>
// ✅ React components, full editing
```

---

## Implementation Steps

### Phase 1: HTML Parser Utility

**File**: `/servers/nextjs/app/(presentation-generator)/utils/htmlParser.ts`

**Functions to Create**:

```typescript
/**
 * Parse raw HTML into structured data format
 */
export function parseHtmlStructure(html: string): HtmlStructure {
  // 1. Parse HTML with DOMParser
  // 2. Traverse DOM tree
  // 3. Identify editable regions (contenteditable, tiptap-text-editor)
  // 4. Identify block containers (data-block-selectable)
  // 5. Extract classes, styles, layout
  // 6. Build structured tree
}

/**
 * Identify all editable text regions
 */
export function identifyEditableRegions(html: string): EditableRegion[] {
  // Find: .tiptap-text-editor, [contenteditable="true"]
  // Extract: content, classes, styles, data attributes
}

/**
 * Identify block-selectable containers
 */
export function identifyBlockContainers(html: string): BlockContainer[] {
  // Find: [data-block-selectable="true"]
  // Extract: type, classes, children structure
}

/**
 * Clean HTML by removing editing infrastructure
 */
export function stripEditingAttributes(html: string): string {
  // Remove: contenteditable, data-editable-*, placeholders
  // Keep: presentation classes, styles, structure
}
```

**Types to Define**:

```typescript
interface HtmlStructure {
  layout: "dynamic";
  version: string;
  blocks: Block[];
  globalStyles?: Record<string, string>;
}

interface Block {
  id: string;
  type: "container" | "editable-text" | "image" | "component";
  classes?: string;
  styles?: Record<string, string>;
  attributes?: Record<string, string>;
  content?: string; // For text blocks
  src?: string; // For images
  children?: Block[];
}

interface EditableRegion {
  id: string;
  content: string;
  classes: string;
  styles: Record<string, string>;
  placeholder?: string;
}

interface BlockContainer {
  id: string;
  type: string;
  classes: string;
  children: string[]; // Child block IDs
}
```

---

### Phase 2: Dynamic HTML Layout Template

**File**: `/servers/nextjs/presentation-templates/dynamic/DynamicHtmlLayout.tsx`

**Component Structure**:

```typescript
interface DynamicHtmlLayoutProps {
  data: HtmlStructure;
  slideIndex: number;
  slideId: string;
}

export const DynamicHtmlLayout: React.FC<DynamicHtmlLayoutProps> = ({
  data,
  slideIndex,
  slideId
}) => {
  const renderBlock = (block: Block): React.ReactNode => {
    switch (block.type) {
      case "container":
        return (
          <div
            key={block.id}
            className={block.classes}
            style={block.styles}
            data-block-selectable="true"
            data-block-type="container"
          >
            {block.children?.map(renderBlock)}
          </div>
        );

      case "editable-text":
        return (
          <TiptapText
            key={block.id}
            content={block.content || ""}
            slideIndex={slideIndex}
            fieldPath={`blocks.${block.id}.content`}
            className={block.classes}
            style={block.styles}
            placeholder={block.attributes?.placeholder}
          />
        );

      case "image":
        return (
          <img
            key={block.id}
            src={block.src}
            alt={block.attributes?.alt || ""}
            className={block.classes}
            style={block.styles}
            data-editable-processed="true"
          />
        );

      case "component":
        // Render special components (charts, etc.)
        return renderSpecialComponent(block);

      default:
        return null;
    }
  };

  return (
    <div className="w-full aspect-video" data-slide-content="true">
      <div className="editable-layout-wrapper w-full">
        {data.blocks.map(renderBlock)}
      </div>
    </div>
  );
};
```

**Key Features**:
- Recursively renders block tree
- Mounts TiptapText for editable regions
- Preserves block selection attributes
- Handles images, containers, special components
- Maintains all editing functionality

---

### Phase 3: Update Capture Logic

**File**: `/servers/nextjs/app/(presentation-generator)/presentation/components/SmartSuggestionsPanel.tsx`

**Modify `applyLayoutVariant()`**:

```typescript
const applyLayoutVariant = async (variant: LayoutVariant, variantIndex: number) => {
  // 1. Apply the slide (update JSON content)
  dispatch(updateSlide({ index: slideIndex, slide: slideToApply }));

  // 2. Wait for React to re-render
  await new Promise(resolve => setTimeout(resolve, 300));

  // 3. Capture HTML from DOM
  const slideContainer = document.querySelector(`[data-slide-id="${slideToApply.id}"]`);
  if (slideContainer) {
    const slideContentElement = slideContainer.querySelector('[data-slide-content="true"]');
    if (slideContentElement) {
      const html_content = slideContentElement.innerHTML;

      // 4. NEW: Parse HTML into structure
      const html_structure = parseHtmlStructure(html_content);

      // 5. NEW: Save structure instead of raw HTML
      const structuredSlide = await PresentationGenerationApi.saveHtmlStructure(
        slideToApply.id,
        html_structure
      );

      // 6. Update Redux with structured slide
      dispatch(updateSlide({ index: slideIndex, slide: structuredSlide }));

      console.log("Layout variant saved as structured HTML template");
    }
  }

  toast.success(`Layout "${variant.title}" applied with editing enabled!`);
};
```

---

### Phase 4: Update Backend

**File**: `/servers/fastapi/api/v1/ppt/endpoints/slide.py`

**New Endpoint**:

```python
@SLIDE_ROUTER.post("/save-html-structure", response_model=SlideModel)
async def save_html_structure(
    id: Annotated[uuid.UUID, Body()],
    html_structure: Annotated[dict, Body()],
    sql_session: AsyncSession = Depends(get_async_session),
):
    """
    Save structured HTML data for dynamic template rendering
    """
    slide = await sql_session.get(SlideModel, id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")

    # Store structure in json_content with special marker
    slide.json_content["_html_structure"] = html_structure
    slide.json_content["_template_type"] = "dynamic"

    # Clear old html_content (no longer needed)
    slide.html_content = None

    await sql_session.commit()
    return slide
```

**Alternative**: Add new `html_structure` column to `SlideModel` if preferred.

---

### Phase 5: Update Rendering Logic

**File**: `/servers/nextjs/app/(presentation-generator)/hooks/useTemplateLayouts.tsx`

**Modify Rendering Decision**:

```typescript
export const useTemplateLayouts = (slide: Slide, slideIndex: number) => {
  // Priority 1: Check for html_structure (new dynamic template)
  if (slide.json_content?._html_structure) {
    return (
      <DynamicHtmlLayout
        data={slide.json_content._html_structure}
        slideIndex={slideIndex}
        slideId={slide.id}
      />
    );
  }

  // Priority 2: Legacy html_content (convert to structure)
  if (slide.html_content && slide.html_content.trim()) {
    console.warn("Legacy html_content detected, converting to structure");
    const structure = parseHtmlStructure(slide.html_content);
    return (
      <DynamicHtmlLayout
        data={structure}
        slideIndex={slideIndex}
        slideId={slide.id}
      />
    );
  }

  // Priority 3: Regular template-based rendering
  // ... existing template logic
};
```

---

### Phase 6: API Client Update

**File**: `/servers/nextjs/app/(presentation-generator)/services/api/presentation-generation.ts`

**Add New Method**:

```typescript
static async saveHtmlStructure(slide_id: string, html_structure: any) {
  const response = await fetch('/api/v1/ppt/slide/save-html-structure', {
    method: "POST",
    headers: getHeader(),
    body: JSON.stringify({
      id: slide_id,
      html_structure
    }),
  });
  return await ApiResponseHandler.handleResponse(response);
}
```

---

## Data Structure Design

### Example: Real HTML Variant Structure

**Original HTML** (from existing variant):
```html
<div class="flex flex-col justify-center space-y-7">
  <div class="text-4xl font-bold text-gray-900">
    <div class="tiptap-text-editor">
      <div contenteditable="true">
        <p>Understanding Testing: <strong>Fundamentals</strong></p>
      </div>
    </div>
  </div>
  <div class="w-16 h-1 bg-purple-600"></div>
  <div class="text-lg text-gray-700">
    <div class="tiptap-text-editor">
      <div contenteditable="true">
        <p>Testing systematically evaluates systems...</p>
      </div>
    </div>
  </div>
</div>
```

**Parsed Structure**:
```typescript
{
  layout: "dynamic",
  version: "1.0",
  blocks: [
    {
      id: "container-1",
      type: "container",
      classes: "flex flex-col justify-center space-y-7",
      children: [
        {
          id: "heading-1",
          type: "editable-text",
          classes: "text-4xl font-bold text-gray-900",
          content: "<p>Understanding Testing: <strong>Fundamentals</strong></p>",
          placeholder: "Enter title..."
        },
        {
          id: "divider-1",
          type: "component",
          classes: "w-16 h-1 bg-purple-600",
          componentType: "divider"
        },
        {
          id: "body-1",
          type: "editable-text",
          classes: "text-lg text-gray-700",
          content: "<p>Testing systematically evaluates systems...</p>",
          placeholder: "Enter text..."
        }
      ]
    }
  ]
}
```

---

## Testing Plan

### Test Cases

1. **Apply Layout Variant**
   - Action: Apply variant from Smart Panel
   - Expected: Structure saved, editing works

2. **Edit Text**
   - Action: Click and edit TiptapText region
   - Expected: Text updates, saves correctly

3. **Select Block**
   - Action: Click block container
   - Expected: Block selected, controls appear

4. **Smart Panel**
   - Action: Open Smart Panel, generate suggestions
   - Expected: Detects content, generates variants

5. **Legacy HTML Variants**
   - Action: Load existing html_content slides
   - Expected: Auto-converts to structure, editing works

6. **Export PPTX**
   - Action: Export presentation
   - Expected: Renders correctly in PowerPoint

---

## Migration Strategy

### Handling Existing HTML Variants

**Option A: Auto-Convert on Load**
- When `html_content` detected, parse to structure
- Save structure, clear html_content
- Seamless migration

**Option B: Background Migration**
- Create migration script
- Convert all existing html_content slides
- Run once during deployment

**Option C: Lazy Migration**
- Keep legacy html_content support
- Convert only when edited
- Gradual migration

**Recommendation**: Option A (auto-convert) for best UX.

---

## Edge Cases to Handle

1. **Complex Nested Structures**
   - Deep nesting of containers
   - Solution: Recursive parsing with depth limit

2. **Custom CSS/Inline Styles**
   - User-added styles via Smart Panel AI
   - Solution: Preserve in `styles` object

3. **Special Components**
   - Charts, diagrams, custom elements
   - Solution: Component registry system

4. **Invalid HTML**
   - Malformed HTML from capture
   - Solution: Validation + fallback to template

5. **Performance**
   - Large complex slides
   - Solution: Memoization, lazy rendering

---

## File Structure

```
servers/nextjs/
├── app/(presentation-generator)/
│   ├── utils/
│   │   └── htmlParser.ts                    # NEW: HTML parsing utilities
│   ├── hooks/
│   │   └── useTemplateLayouts.tsx           # MODIFY: Add dynamic template check
│   ├── presentation/components/
│   │   └── SmartSuggestionsPanel.tsx        # MODIFY: Capture structure
│   └── services/api/
│       └── presentation-generation.ts        # MODIFY: Add saveHtmlStructure()
│
├── presentation-templates/
│   └── dynamic/
│       ├── DynamicHtmlLayout.tsx            # NEW: Dynamic template component
│       └── components/                       # NEW: Special component renderers
│           ├── DividerComponent.tsx
│           ├── ChartComponent.tsx
│           └── index.ts
│
└── types/
    └── htmlStructure.ts                      # NEW: TypeScript types

servers/fastapi/
└── api/v1/ppt/endpoints/
    └── slide.py                              # MODIFY: Add save-html-structure endpoint
```

---

## Benefits Summary

### For Users
✅ Custom layouts from variants (original goal)
✅ Full editing functionality preserved
✅ TiptapText, block selection, Smart Panel all work
✅ Seamless experience - no broken features

### For Development
✅ Clean separation: layout vs content
✅ Maintainable: one template for all variants
✅ Extensible: easy to add new block types
✅ Testable: structured data easier to test
✅ Future-proof: not tied to HTML rendering

### Technical
✅ React components properly mounted
✅ Event listeners attached
✅ State management works
✅ Redux updates propagate
✅ PPTX export still works

---

## Risks & Mitigation

### Risk 1: Parser Complexity
**Risk**: HTML parsing might be complex/fragile
**Mitigation**:
- Start with common patterns
- Add fallbacks for edge cases
- Log parsing errors for improvement

### Risk 2: Structure Format Changes
**Risk**: Structure format might need updates
**Mitigation**:
- Version the structure (`version: "1.0"`)
- Write migration functions
- Keep backward compatibility

### Risk 3: Performance
**Risk**: Parsing + rendering might be slow
**Mitigation**:
- Memoize parsed structures
- Lazy render off-screen blocks
- Profile and optimize hot paths

### Risk 4: PPTX Export
**Risk**: Dynamic templates might break export
**Mitigation**:
- Test export early
- Structure designed to match existing templates
- Fallback to rendering HTML if needed

---

## Timeline Estimate

1. **HTML Parser Utility** (4-6 hours)
   - DOMParser setup
   - Tree traversal
   - Structure building
   - Tests

2. **Dynamic Template Component** (4-6 hours)
   - Block rendering logic
   - TiptapText integration
   - Block selection
   - Styling

3. **Backend Integration** (2-3 hours)
   - New endpoint
   - Database changes (if needed)
   - API tests

4. **Frontend Integration** (3-4 hours)
   - Update capture logic
   - Update rendering logic
   - Redux integration

5. **Testing & Edge Cases** (4-6 hours)
   - Unit tests
   - Integration tests
   - Real variant testing
   - Bug fixes

6. **Migration & Documentation** (2-3 hours)
   - Legacy HTML handling
   - Documentation
   - Cleanup

**Total**: 19-28 hours (2.5-3.5 days)

---

## Success Criteria

✅ Apply layout variant → Editing works immediately
✅ TiptapText editing functional in HTML variants
✅ Block selection functional in HTML variants
✅ Smart Panel detects content in HTML variants
✅ All existing variants migrated and working
✅ PPTX export produces correct output
✅ No performance regression
✅ Code is maintainable and documented

---

## Alternative Approaches Considered

### 1. Clean HTML (Simple but Limited)
- Strip editing attributes
- Accept frozen variants
- ❌ Rejected: Doesn't meet editing requirement

### 2. Parse HTML → Reconstruct Template (Complex)
- Parse HTML back to original template
- ❌ Rejected: Loses custom layout changes

### 3. Keep Raw HTML + Add Listeners (Hacky)
- Render raw HTML, manually attach listeners
- ❌ Rejected: Fragile, doesn't use React properly

### 4. Dynamic Template (Chosen)
- Parse → Structure → React components
- ✅ Selected: Best balance of flexibility + maintainability

---

## Next Steps When You Return

1. **Analyze Existing HTML Variants**
   - Read 5 existing HTML variant files
   - Identify common patterns
   - Design structure format based on real data

2. **Create HTML Parser**
   - Implement `parseHtmlStructure()`
   - Test with real variants
   - Handle edge cases

3. **Build Dynamic Template**
   - Create `DynamicHtmlLayout.tsx`
   - Implement block rendering
   - Test with parsed structure

4. **Integration**
   - Backend endpoint
   - Frontend capture
   - Redux updates

5. **Testing**
   - End-to-end flow
   - Edge cases
   - Performance

---

## Questions to Answer

- [ ] Where to store structure? `json_content._html_structure` or new column?
- [ ] How to handle special components (charts, complex widgets)?
- [ ] Should we support custom component registration?
- [ ] Migration strategy: auto-convert or manual?
- [ ] Versioning strategy for structure format?

---

## References

**Key Files**:
- Current HTML rendering: `/servers/nextjs/app/(presentation-generator)/hooks/useTemplateLayouts.tsx`
- Variant application: `/servers/nextjs/app/(presentation-generator)/presentation/components/SmartSuggestionsPanel.tsx`
- Existing HTML variants: `/servers/fastapi/slide_*_html.html` (5 examples)

**Current Status**:
- HTML variants captured and saved ✅
- Automatic conversion on variant apply ✅
- HTML rendering works but no editing ❌
- Need: Dynamic template to enable editing ⏳

---

Good night! This plan captures everything we discussed. When you're back, we can start with analyzing the existing HTML variants to refine the data structure design.
