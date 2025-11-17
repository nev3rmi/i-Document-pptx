"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Lightbulb, Palette, Loader2, X, CheckCircle2, Wand2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PresentationGenerationApi } from "../../services/api/presentation-generation";
import { toast } from "sonner";
import { useDispatch, useSelector } from "react-redux";
import { updateSlide } from "@/store/slices/presentationGeneration";
import { RootState } from "@/store/store";
import { BlockSelection } from "../hooks/useBlockSelection";
import html2canvas from "html2canvas";

interface Variant {
  id: string;
  text: string;
}

interface LayoutVariant {
  id: string;
  title: string;
  description: string;
  html: string;
  fullPreviewHTML?: string; // Full slide HTML with variant applied for preview
}

interface SmartSuggestionsPanelProps {
  selectedText: string;
  slideId: string | null;
  slideIndex: number | null;
  selectedBlock?: BlockSelection;
  onClose: () => void;
  clearBlockSelection?: () => void;
  onConversionStart?: () => void;
  onConversionComplete?: () => void;
}

const SmartSuggestionsPanel: React.FC<SmartSuggestionsPanelProps> = ({
  selectedText,
  slideId,
  slideIndex,
  selectedBlock,
  onClose,
  clearBlockSelection,
  onConversionStart,
  onConversionComplete,
}) => {
  const dispatch = useDispatch();
  const [activeTab, setActiveTab] = useState<"suggestions" | "variants">("suggestions");
  const [applyingId, setApplyingId] = useState<string | null>(null);

  // Track previous selection to detect changes
  const [previousSelectedContent, setPreviousSelectedContent] = useState<string>('');
  const [previousBlockElement, setPreviousBlockElement] = useState<HTMLElement | null>(null);

  // Variants state
  const [variants, setVariants] = useState<Variant[]>([]);
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  const [appliedVariants, setAppliedVariants] = useState<Set<string>>(new Set());
  const [originalText, setOriginalText] = useState<string>(''); // Store original text for replacements
  const [originalSlideContent, setOriginalSlideContent] = useState<any>(null); // Store original slide state
  const [regeneratedTextSlides, setRegeneratedTextSlides] = useState<any[]>([]); // Cache for generated variant slides
  const [currentlyAppliedTextIndex, setCurrentlyAppliedTextIndex] = useState<number | null>(null);

  // Layout variants state
  const [layoutVariants, setLayoutVariants] = useState<LayoutVariant[]>([]);
  const [isGeneratingLayouts, setIsGeneratingLayouts] = useState(false);
  const [appliedLayouts, setAppliedLayouts] = useState<Set<string>>(new Set());
  const [regeneratedSlides, setRegeneratedSlides] = useState<any[]>([]); // Cache for generated layout slides
  const [currentlyAppliedIndex, setCurrentlyAppliedIndex] = useState<number | null>(null);
  const [originalLayoutSlideContent, setOriginalLayoutSlideContent] = useState<any>(null); // Store original slide before layout changes

  // Conversion state - tracks if slide needs conversion to dynamic template
  const [needsConversion, setNeedsConversion] = useState(false);
  const [isConverting, setIsConverting] = useState(false);

  // Block anchor - stable ID for matching blocks across variant applications
  const [selectedBlockAnchor, setSelectedBlockAnchor] = useState<string | null>(null);

  // Variant capability validation - tracks if selected block can use variants
  const [canUseVariants, setCanUseVariants] = useState(false);

  const { presentationData } = useSelector(
    (state: RootState) => state.presentationGeneration
  );

  // Log Redux state changes for debugging
  useEffect(() => {
    if (slideIndex !== null && presentationData?.slides) {
      const currentSlide = presentationData.slides[slideIndex];
      console.log('[Redux State Change] presentationData updated');
      console.log('  slide[', slideIndex, '].id:', currentSlide?.id);
    }
  }, [presentationData, slideIndex]);

  // Detect if current slide needs conversion to dynamic template
  useEffect(() => {
    if (slideIndex !== null && presentationData?.slides && presentationData.slides.length > 0) {
      const currentSlide = presentationData.slides[slideIndex];

      // Validate slide exists
      if (!currentSlide) {
        console.log('[Conversion Detection] ERROR: No slide at index', slideIndex);
        console.log('  slides length:', presentationData.slides.length);
        setNeedsConversion(false); // Default to false if slide not found
        return;
      }

      // Slide needs conversion if it doesn't have html_content
      const needsConvert = !currentSlide.html_content || currentSlide.html_content.trim() === '';

      console.log('[Conversion Detection] Slide', slideIndex, 'needs conversion:', needsConvert);
      console.log('  currentSlide.id:', currentSlide.id);
      console.log('  has html_content:', !!currentSlide.html_content);
      if (currentSlide.html_content) {
        console.log('  html_content length:', currentSlide.html_content.length);
      }

      setNeedsConversion(needsConvert);
    }
  }, [slideIndex, presentationData]);

  // Validate if selected block can use variants (has anchor)
  useEffect(() => {
    if (!selectedBlock?.element) {
      setCanUseVariants(false);
      return;
    }

    const hasAnchor = selectedBlock.element.hasAttribute('data-block-anchor');
    setCanUseVariants(hasAnchor);

    if (!hasAnchor) {
      console.log('[Variants] Block has no anchor, Variants tab will be disabled');
      console.log('  Block type:', selectedBlock.type);

      // Auto-switch to Suggestions tab if currently on Variants tab
      if (activeTab === 'variants') {
        console.log('[Variants] Auto-switching to Suggestions tab');
        setActiveTab('suggestions');
      }
    } else {
      console.log('[Variants] Block has anchor, both tabs available');
      console.log('  Anchor:', selectedBlock.element.getAttribute('data-block-anchor'));
    }
  }, [selectedBlock?.element, activeTab]);

  // Detect when selection changes and regenerate variants
  useEffect(() => {
    const currentContent = selectedText || selectedBlock?.content || '';
    const currentElement = selectedBlock?.element || null;

    // Check if the selected content or block element changed
    const contentChanged = currentContent !== previousSelectedContent;
    const elementChanged = currentElement !== previousBlockElement;

    if (contentChanged || elementChanged) {
      console.log('========================================');
      console.log('[Selection Change Effect] TRIGGERED');
      console.log('  contentChanged:', contentChanged);
      console.log('  elementChanged:', elementChanged);

      // Clear text variants when text selection changes
      if (contentChanged && currentContent) {
        console.log('[Selection Change] Clearing TEXT variants');
        console.log('  previous:', previousSelectedContent?.substring(0, 50));
        console.log('  current:', currentContent?.substring(0, 50));
        setVariants([]);
        setRegeneratedTextSlides([]);
        setCurrentlyAppliedTextIndex(null);
        setAppliedVariants(new Set());
      }

      // Clear layout variants when block selection changes
      if (elementChanged && currentElement) {
        console.log('[Selection Change] Clearing LAYOUT variants');
        setLayoutVariants([]);
        setRegeneratedSlides([]);
        setCurrentlyAppliedIndex(null);
        setAppliedLayouts(new Set());
      }

      // Update tracking
      setPreviousSelectedContent(currentContent);
      setPreviousBlockElement(currentElement);
      console.log('========================================');
    }
  }, [selectedText, selectedBlock?.content, selectedBlock?.element, previousSelectedContent, previousBlockElement]);

  const handleGenerateVariants = useCallback(async () => {
    const textToVariate = selectedText || selectedBlock?.content || '';

    console.log('========================================');
    console.log('[handleGenerateVariants] ENTRY');
    console.log('  selectedText:', selectedText?.substring(0, 50));
    console.log('  slideId prop:', slideId);
    console.log('  slideIndex:', slideIndex);

    if (!textToVariate || !slideId) {
      toast.error("No content selected");
      return;
    }

    // Store the original slide content before generating variants
    if (slideIndex !== null && presentationData?.slides) {
      const currentSlide = presentationData.slides[slideIndex];
      console.log('[handleGenerateVariants] Capturing current slide as original');
      console.log('  currentSlide.id:', currentSlide.id);
      console.log('  currentSlide.content:', JSON.stringify(currentSlide.content).substring(0, 100));
      console.log('  existing originalSlideContent.id:', originalSlideContent?.id);
      console.log('  OVERWRITING originalSlideContent');
      setOriginalSlideContent(currentSlide);
    }

    console.log('[handleGenerateVariants] Clearing cache and state');
    setIsGeneratingVariants(true);
    setVariants([]);
    setRegeneratedTextSlides([]); // Clear cache
    setCurrentlyAppliedTextIndex(null);
    setOriginalText(textToVariate);
    setAppliedVariants(new Set());

    try {
      console.log('[handleGenerateVariants] Calling API to generate variants');
      const response = await PresentationGenerationApi.generateTextVariants(textToVariate, 3);

      if (response && response.variants) {
        const variantsWithIds = response.variants.map((text: string, index: number) => ({
          id: `variant-${index}`,
          text,
        }));
        console.log('[handleGenerateVariants] Generated', variantsWithIds.length, 'variants');
        setVariants(variantsWithIds);
        toast.success(`${variantsWithIds.length} text variants generated!`);
      }
      console.log('========================================');
    } catch (error: any) {
      console.error('[handleGenerateVariants] ERROR:', error);
      toast.error("Failed to generate variants", {
        description: error.message || "Please try again.",
      });
      console.log('========================================');
    } finally {
      setIsGeneratingVariants(false);
    }
  }, [selectedText, selectedBlock?.content, slideIndex, presentationData?.slides, slideId, originalSlideContent]);

  // Auto-generate text variants when content is available
  useEffect(() => {
    const textToVariate = selectedText || selectedBlock?.content || '';

    if (textToVariate && activeTab === "suggestions" && variants.length === 0 && !isGeneratingVariants) {
      handleGenerateVariants();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedText, selectedBlock?.content, activeTab, variants.length, isGeneratingVariants]);

  // Auto-generate layout variants removed - user must click "Generate Layout Options" after conversion

  const applyVariant = async (variant: Variant, variantIndex: number) => {
    console.log('========================================');
    console.log('[applyVariant] ENTRY');
    console.log('  variant:', variant.id, '-', variant.text.substring(0, 50));
    console.log('  variantIndex:', variantIndex);
    console.log('  slideId prop:', slideId);
    console.log('  slideIndex:', slideIndex);

    if (slideIndex !== null && presentationData?.slides) {
      const currentSlide = presentationData.slides[slideIndex];
      console.log('  currentSlide.id from Redux:', currentSlide.id);
    }

    console.log('  originalSlideContent.id:', originalSlideContent?.id);
    console.log('  regeneratedTextSlides cache size:', regeneratedTextSlides.length);
    console.log('  cached slide at index?', !!regeneratedTextSlides[variantIndex]);

    if (!originalSlideContent || slideIndex === null || !presentationData) {
      console.log('[applyVariant] ERROR: Missing originalSlideContent, slideIndex, or presentationData');
      console.log('========================================');
      toast.error("Could not identify the slide. Please try again.");
      return;
    }

    // Set applying state to disable all actions
    setApplyingId(variant.id);

    try {
      let slideToApply = regeneratedTextSlides[variantIndex];

      // If not cached, generate it now
      if (!slideToApply) {
        console.log('[applyVariant] Cache MISS - generating new variant');
        toast.info("Generating slide...");

        // Restore original slide to database first
        if (originalSlideContent && presentationData?.id) {
          console.log('[applyVariant] Restoring original to database');
          console.log('  originalSlideContent.id:', originalSlideContent.id);
          console.log('  originalSlideContent.content:', JSON.stringify(originalSlideContent.content).substring(0, 100));

          const updatedSlides = [...presentationData.slides];
          updatedSlides[slideIndex] = originalSlideContent;

          await PresentationGenerationApi.updatePresentationContent({
            id: presentationData.id,
            slides: updatedSlides
          });

          console.log('[applyVariant] Database restore complete, waiting 100ms');
          // Give the database a moment to update
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Generate the slide with this variant
        const prompt = `Replace the text "${originalText}" with this alternative version: "${variant.text}". Keep everything else on the slide unchanged.`;
        console.log('[applyVariant] Calling editSlide API');
        console.log('  slideId param (STALE PROP):', slideId);
        console.log('  originalSlideContent.id (USING THIS):', originalSlideContent.id);
        console.log('  prompt:', prompt.substring(0, 100));

        // FIX: Use originalSlideContent.id instead of stale slideId prop
        // The originalSlideContent was just restored to DB, so we must use its ID
        slideToApply = await PresentationGenerationApi.editSlide(originalSlideContent.id, prompt);

        console.log('[applyVariant] editSlide response:');
        console.log('  new slide.id:', slideToApply.id);
        console.log('  new slide.content:', JSON.stringify(slideToApply.content).substring(0, 100));

        // Cache it for future use
        const updatedCache = [...regeneratedTextSlides];
        updatedCache[variantIndex] = slideToApply;
        setRegeneratedTextSlides(updatedCache);
        console.log('[applyVariant] Cached slide at index', variantIndex);
      } else {
        console.log('[applyVariant] Cache HIT - using cached slide');
        console.log('  cached slide.id:', slideToApply.id);
      }

      // Apply the slide
      console.log('[applyVariant] Updating Redux with slide.id:', slideToApply.id);
      dispatch(updateSlide({ index: slideIndex, slide: slideToApply }));

      setCurrentlyAppliedTextIndex(variantIndex);
      setAppliedVariants(new Set([variant.id]));

      console.log('[applyVariant] SUCCESS');
      console.log('========================================');
      toast.success("Variant applied!");
    } catch (error) {
      console.error('[applyVariant] ERROR:', error);
      console.log('========================================');
      toast.error("Failed to apply variant");
      console.error("Error applying variant:", error);
    } finally {
      // Clear applying state to re-enable actions
      setApplyingId(null);
    }
  };

  const buildRegeneratedSlide = async (variant: LayoutVariant) => {
    console.log('[buildRegeneratedSlide] ENTRY');
    console.log('  variant:', variant.title);
    console.log('  slideIndex:', slideIndex);

    if (slideIndex === null || !presentationData) {
      console.error('[buildRegeneratedSlide] ERROR: Missing slide information');
      throw new Error("Missing slide information");
    }

    // Use the current slide from Redux (not the stale slideId prop)
    const currentSlide = presentationData.slides[slideIndex];
    const currentSlideId = currentSlide.id;

    console.log('[buildRegeneratedSlide] Using currentSlide.id from Redux:', currentSlideId);
    console.log('[buildRegeneratedSlide] currentSlide.content:', JSON.stringify(currentSlide.content).substring(0, 100));

    const prompt = `
Regenerate this slide, changing ONLY the layout of the selected block.

**Selected Block:** ${selectedBlock?.type || 'container'}
**Block Content Preview:** "${(selectedBlock?.content || '').substring(0, 150)}..."

**Desired Layout Change:**
- Title: ${variant.title}
- Description: ${variant.description}
- Reference HTML structure: ${variant.html}

**Critical Instructions:**
1. Keep ALL text content identical (word-for-word)
2. Keep ALL images, icons, colors, fonts, and styling
3. ONLY modify the layout/arrangement of the selected block
4. Other parts of the slide must remain unchanged
5. Return valid JSON for template rendering (do not return HTML)

**Current Slide JSON:**
\`\`\`json
${JSON.stringify(currentSlide.content, null, 2)}
\`\`\`
    `.trim();

    console.log('[buildRegeneratedSlide] Calling editSlide with ID:', currentSlideId);
    console.log('[buildRegeneratedSlide] Prompt length:', prompt.length);

    // Use the current slide ID from Redux, not the stale prop
    const result = await PresentationGenerationApi.editSlide(currentSlideId, prompt);

    console.log('[buildRegeneratedSlide] editSlide response - new slide.id:', result.id);
    return result;
  };

  // Helper function to clean HTML before sending to AI
  const cleanHTMLForAI = (html: string): string => {
    // Create a temporary div to parse HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Remove selection outlines and highlights (Ctrl+Click state)
    const removeClasses = ['outline-yellow-500', 'ring-2', 'ring-yellow-400', 'ring-offset-2', 'block-selected', 'block-hoverable'];
    temp.querySelectorAll('*').forEach(el => {
      removeClasses.forEach(cls => el.classList.remove(cls));

      // Remove data-* attributes (except essential ones)
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('data-') &&
            !['data-block-type', 'data-slide-content', 'data-textpath', 'data-path', 'data-block-anchor'].includes(attr.name)) {
          el.removeAttribute(attr.name);
        }
      });
    });

    // Get cleaned HTML and remove extra whitespace
    return temp.innerHTML
      .replace(/\s+/g, ' ')  // Multiple spaces to single space
      .replace(/>\s+</g, '><')  // Remove spaces between tags
      .trim();
  };

  /**
   * Clean runtime classes and attributes from HTML before saving to database
   * These are added dynamically during rendering and should not be persisted
   */
  const cleanRuntimeAttributes = (container: HTMLElement): { classesRemoved: number; attributesRemoved: number } => {
    const runtimeClasses = [
      'block-hoverable',
      'block-hovered',
      'block-selected',
      'outline-yellow-500',
      'ring-2',
      'ring-yellow-400',
      'ring-offset-2'
    ];

    const runtimeAttributes = [
      'data-variant-capable',
      'data-block-id',
    ];

    let classesRemoved = 0;
    let attributesRemoved = 0;

    container.querySelectorAll('*').forEach(el => {
      // Remove runtime classes
      runtimeClasses.forEach(cls => {
        if (el.classList.contains(cls)) {
          el.classList.remove(cls);
          classesRemoved++;
        }
      });

      // Remove runtime attributes
      runtimeAttributes.forEach(attr => {
        if (el.hasAttribute(attr)) {
          el.removeAttribute(attr);
          attributesRemoved++;
        }
      });
    });

    return { classesRemoved, attributesRemoved };
  };

  // CONVERSION FUNCTION: Convert template slide to dynamic HTML mode
  const handleConvertToDynamic = async () => {
    console.log('========================================');
    console.log('[Convert to Dynamic] ENTRY');
    console.log('  slideIndex:', slideIndex);
    console.log('  selectedBlock type:', selectedBlock?.type);

    // Validation
    if (!selectedBlock?.element || slideIndex === null || !presentationData) {
      console.log('[Convert to Dynamic] ERROR: Missing required data');
      console.log('  selectedBlock:', !!selectedBlock);
      console.log('  slideIndex:', slideIndex);
      console.log('  presentationData:', !!presentationData);
      toast.error("Please select a block first");
      return;
    }

    const currentSlide = presentationData.slides[slideIndex];

    // Validate currentSlide exists
    if (!currentSlide) {
      console.log('[Convert to Dynamic] ERROR: Could not find slide at index', slideIndex);
      console.log('  presentationData.slides length:', presentationData.slides?.length);
      toast.error("Could not find the current slide");
      return;
    }

    console.log('[Convert to Dynamic] Current slide ID:', currentSlide.id);

    // Check if already dynamic
    if (currentSlide.html_content && currentSlide.html_content.trim()) {
      console.log('[Convert to Dynamic] Slide already has html_content');
      toast.info("Slide is already dynamic");
      setNeedsConversion(false);
      return;
    }

    setIsConverting(true);

    // Close panel and show full-screen loading overlay
    console.log('[Convert to Dynamic] Closing panel and showing loading overlay');
    if (onConversionStart) {
      onConversionStart();  // Show overlay in parent
    }
    onClose();  // Close panel

    // Small delay for panel close animation
    await new Promise(resolve => setTimeout(resolve, 150));

    try {
      console.log('[Convert to Dynamic] Starting conversion for slide:', currentSlide.id);

      // Step 1: Update Redux to ensure current state is rendered
      console.log('[Convert to Dynamic] Step 1: Ensuring Redux is up to date');
      dispatch(updateSlide({ index: slideIndex, slide: currentSlide }));

      // Step 2: Wait for React to render
      console.log('[Convert to Dynamic] Step 2: Waiting 300ms for React render');
      await new Promise(resolve => setTimeout(resolve, 300));

      // Step 3: Find slide in DOM
      console.log('[Convert to Dynamic] Step 3: Finding slide in DOM');
      const slideContainer = document.querySelector(`[data-slide-id="${currentSlide.id}"]`);
      if (!slideContainer) {
        throw new Error(`Could not find slide container with ID ${currentSlide.id}`);
      }

      const slideContent = slideContainer.querySelector('[data-slide-content="true"]');
      if (!slideContent) {
        throw new Error("Could not find slide content element");
      }

      // Step 4: Clone for safe manipulation
      console.log('[Convert to Dynamic] Step 4: Cloning slide content');
      const clonedElement = slideContent.cloneNode(true) as HTMLElement;

      const elementCount = clonedElement.querySelectorAll('*').length;
      console.log('[Convert to Dynamic] Captured slide HTML');
      console.log('  Total elements:', elementCount);
      console.log('  HTML length:', clonedElement.innerHTML.length, 'characters');

      // Helper function: Match text content to JSON field path
      const matchTextToField = (text: string): string | null => {
        const trimmedText = text.trim();

        // Ignore very short text or common words
        if (!trimmedText || trimmedText.length <= 3) {
          return null;
        }

        // Recursive search through JSON content
        const searchObject = (obj: any, path: string[] = []): string | null => {
          for (const [key, value] of Object.entries(obj)) {
            const currentPath = [...path, key];

            // Direct string match
            if (typeof value === 'string' && value.trim() === trimmedText) {
              return currentPath.join('.');
            }

            // Recurse into arrays
            if (Array.isArray(value)) {
              for (let i = 0; i < value.length; i++) {
                const result = searchObject({ [i]: value[i] }, currentPath);
                if (result) return result;
              }
            }

            // Recurse into objects (skip image/icon objects)
            else if (typeof value === 'object' && value !== null) {
              const hasImageUrl = '__image_url__' in value;
              const hasIconUrl = '__icon_url__' in value;

              // Don't search inside image/icon objects
              if (!hasImageUrl && !hasIconUrl) {
                const result = searchObject(value, currentPath);
                if (result) return result;
              }
            }
          }
          return null;
        };

        return searchObject(currentSlide.content);
      };

      console.log('[Convert to Dynamic] matchTextToField helper created');

      // Step 5: Add data-textpath attributes to all text elements
      console.log('[Convert to Dynamic] Step 5: Adding data-textpath mappings');

      const allElements = clonedElement.querySelectorAll('*');
      let textMappingsAdded = 0;

      // Only add data-textpath to actual TEXT elements, not containers
      // Query specific text tags + divs that might be text containers
      const textElements = clonedElement.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, li, td, th, a, div');

      textElements.forEach((el) => {
        const htmlEl = el as HTMLElement;

        // Skip if already has data-textpath
        if (htmlEl.hasAttribute('data-textpath')) {
          return;
        }

        // Skip wrapper divs - only process divs that are likely text containers
        if (htmlEl.tagName === 'DIV') {
          // Skip if has many children (it's a layout container)
          if (htmlEl.children.length > 2) {
            return;
          }
          // Skip if has specific wrapper classes
          const classes = htmlEl.className || '';
          if (classes.includes('editable-layout-wrapper') ||
              classes.includes('tiptap-text-replacer') ||
              classes.includes('flex') ||
              classes.includes('grid') ||
              classes.includes('relative')) {
            return;
          }
        }

        let textContent = '';

        // Case 1: Element has Tiptap editor (template rendering)
        const tiptapEditor = htmlEl.querySelector('.tiptap-text-editor');
        if (tiptapEditor) {
          const proseMirror = tiptapEditor.querySelector('.ProseMirror');
          textContent = proseMirror?.textContent?.trim() || '';
        }
        // Case 2: Plain text (no Tiptap)
        else {
          // Get direct text nodes only (not deeply nested)
          const directText = Array.from(htmlEl.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent)
            .join('').trim();

          if (directText) {
            textContent = directText;
          }
          // If no direct text but also no images/children, use all text
          else if (!htmlEl.querySelector('img, svg') && htmlEl.children.length === 0) {
            textContent = htmlEl.textContent?.trim() || '';
          }
        }

        // Try to match text to JSON field
        if (textContent && textContent.length > 3) {
          const matchedField = matchTextToField(textContent);
          if (matchedField) {
            htmlEl.setAttribute('data-textpath', matchedField);
            textMappingsAdded++;

            if (textMappingsAdded <= 5) {
              console.log(`  [${textMappingsAdded}] Mapped "${textContent.substring(0, 30)}" → ${matchedField}`);
            }
          }
        }
      });

      console.log('[Convert to Dynamic] Added', textMappingsAdded, 'data-textpath attributes');

      // Helper function: Match image URL to JSON field path
      const matchImageToPath = (imgSrc: string): string | null => {
        if (!imgSrc || !currentSlide.content) {
          return null;
        }

        const searchObject = (obj: any, path: string[] = []): string | null => {
          for (const [key, value] of Object.entries(obj)) {
            const currentPath = [...path, key];

            // Direct URL match (string field)
            if (typeof value === 'string' && value === imgSrc) {
              return currentPath.join('.');
            }

            // Image object match
            if (typeof value === 'object' && value !== null) {
              if ('__image_url__' in value && value.__image_url__ === imgSrc) {
                return currentPath.join('.');
              }
              if ('__icon_url__' in value && value.__icon_url__ === imgSrc) {
                return currentPath.join('.');
              }

              // Recurse (skip if already an image/icon object)
              if (!('__image_url__' in value) && !('__icon_url__' in value)) {
                const result = searchObject(value, currentPath);
                if (result) return result;
              }
            }

            // Recurse into arrays
            if (Array.isArray(value)) {
              for (let i = 0; i < value.length; i++) {
                const result = searchObject({ [i]: value[i] }, currentPath);
                if (result) return result;
              }
            }
          }
          return null;
        };

        return searchObject(currentSlide.content);
      };

      console.log('[Convert to Dynamic] matchImageToPath helper created');

      // Step 6: Add data-path attributes to images and icons
      console.log('[Convert to Dynamic] Step 6: Adding data-path mappings');

      const imageElements = clonedElement.querySelectorAll('img, svg, span[role="img"]');
      let imageMappingsAdded = 0;

      imageElements.forEach((imgOrSvg) => {
        const htmlEl = imgOrSvg as HTMLElement;
        const tagName = htmlEl.tagName.toLowerCase();
        const isImg = tagName === 'img';
        const isIconSpan = tagName === 'span' && htmlEl.getAttribute('role') === 'img';

        // Skip if already has data-path
        if (htmlEl.hasAttribute('data-path')) {
          return;
        }

        // Extract image URL
        let imgSrc = '';
        if (isImg) {
          imgSrc = (htmlEl as HTMLImageElement).src || '';
        } else if (isIconSpan) {
          const existingDataPath = htmlEl.getAttribute('data-path');
          if (existingDataPath && (existingDataPath.includes('http') || existingDataPath.includes('/'))) {
            imgSrc = existingDataPath;
          }
        }

        // Try to match URL to path
        if (imgSrc) {
          const matchedPath = matchImageToPath(imgSrc);
          if (matchedPath) {
            htmlEl.setAttribute('data-path', matchedPath);
            imageMappingsAdded++;

            if (imageMappingsAdded <= 5) {
              console.log(`  [${imageMappingsAdded}] Mapped image "${imgSrc.substring(0, 50)}" → ${matchedPath}`);
            }
          }
        }
        // Special case: SVG icons without src (match by nearby text)
        else if (!isImg && currentSlide.content) {
          const nearbyH3 = htmlEl.closest('[class*="flex"], [class*="grid"]')?.querySelector('h3');
          const nearbyTitle = nearbyH3?.textContent?.trim() || '';

          if (nearbyTitle) {
            const bulletPoints = currentSlide.content.bulletPoints;
            if (Array.isArray(bulletPoints)) {
              for (let i = 0; i < bulletPoints.length; i++) {
                if (bulletPoints[i]?.title === nearbyTitle) {
                  htmlEl.setAttribute('data-path', `bulletPoints.${i}.icon`);
                  imageMappingsAdded++;
                  console.log(`  [${imageMappingsAdded}] Mapped icon by nearby text "${nearbyTitle}" → bulletPoints.${i}.icon`);
                  break;
                }
              }
            }
          }
        }
      });

      console.log('[Convert to Dynamic] Added', imageMappingsAdded, 'data-path attributes');

      // Step 6.5: Add stable block anchors for exact matching
      console.log('[Convert to Dynamic] Step 6.5: Adding block anchors');

      const selectableBlocks = clonedElement.querySelectorAll('[data-block-selectable="true"]');
      let anchorsAdded = 0;

      selectableBlocks.forEach((block, index) => {
        const htmlBlock = block as HTMLElement;

        // Skip if already has anchor
        if (htmlBlock.hasAttribute('data-block-anchor')) {
          return;
        }

        // Add unique anchor ID
        htmlBlock.setAttribute('data-block-anchor', `block-${index}`);
        anchorsAdded++;

        if (anchorsAdded <= 5) {
          const type = htmlBlock.getAttribute('data-block-type') || 'unknown';
          console.log(`  [${anchorsAdded}] Added anchor "block-${index}" to ${type} block`);
        }
      });

      console.log('[Convert to Dynamic] Added', anchorsAdded, 'block anchors');

      // Step 7: Remove Tiptap editor infrastructure
      console.log('[Convert to Dynamic] Step 7: Removing Tiptap infrastructure');

      const editableElements = clonedElement.querySelectorAll('[data-textpath]');
      let tiptapRemoved = 0;

      editableElements.forEach((el) => {
        const htmlEl = el as HTMLElement;

        // Find Tiptap editor wrapper - must be DIRECT CHILD
        const directTiptapEditor = Array.from(htmlEl.children).find(
          child => child.classList.contains('tiptap-text-editor')
        );

        if (directTiptapEditor) {
          // Extract text from ProseMirror
          const proseMirror = directTiptapEditor.querySelector('.ProseMirror');
          const textContent = proseMirror?.textContent || directTiptapEditor.textContent || '';

          // Replace ONLY the Tiptap wrapper with plain text (keep other children)
          directTiptapEditor.replaceWith(document.createTextNode(textContent));
          tiptapRemoved++;

          if (tiptapRemoved <= 5) {
            console.log(`  [${tiptapRemoved}] Removed Tiptap, kept text: "${textContent.substring(0, 30)}"`);
          }
        }
      });

      console.log('[Convert to Dynamic] Removed Tiptap from', tiptapRemoved, 'elements');

      // Step 7.5: Clean runtime classes and attributes
      console.log('[Convert to Dynamic] Step 7.5: Cleaning runtime classes and attributes');
      const { classesRemoved, attributesRemoved } = cleanRuntimeAttributes(clonedElement);
      console.log('[Convert to Dynamic] Cleaned', classesRemoved, 'runtime classes and', attributesRemoved, 'runtime attributes');

      // Step 8: Extract final HTML
      const html_content = clonedElement.innerHTML;

      console.log('[Convert to Dynamic] Step 8: Extracted final HTML');
      console.log('  HTML length:', html_content.length, 'characters');
      console.log('  Summary:');
      console.log('    - Text mappings (data-textpath):', textMappingsAdded);
      console.log('    - Image mappings (data-path):', imageMappingsAdded);
      console.log('    - Tiptap removed from:', tiptapRemoved, 'elements');

      // Step 9: Save to database
      console.log('[Convert to Dynamic] Step 9: Saving to database via saveHtmlVariant');
      const dynamicSlide = await PresentationGenerationApi.saveHtmlVariant(
        currentSlide.id,
        html_content
      );

      console.log('[Convert to Dynamic] Saved successfully');
      console.log('  New slide ID:', dynamicSlide.id);
      console.log('  Has html_content:', !!dynamicSlide.html_content);
      console.log('  HTML length:', dynamicSlide.html_content?.length);

      // Step 10: Update Redux with dynamic slide
      console.log('[Convert to Dynamic] Step 10: Updating Redux');
      dispatch(updateSlide({ index: slideIndex, slide: dynamicSlide }));

      console.log('[Convert to Dynamic] Redux update dispatched');

      toast.success("Converted to dynamic template!");

      // Step 11: Save initial converted state as restore point
      console.log('[Convert to Dynamic] Step 11: Saving as original layout (restore point)');
      setOriginalLayoutSlideContent(dynamicSlide);
      console.log('  originalLayoutSlideContent saved with ID:', dynamicSlide.id);

      // Clear conversion flag (slide is now permanently dynamic)
      setNeedsConversion(false);

      console.log('[Convert to Dynamic] COMPLETE!');
      console.log('  Slide is now PERMANENTLY dynamic');
      console.log('  No way back to template mode');
      console.log('  User can now select a block and click "Generate Layout Options"');
      console.log('========================================');

      // Wait for React to re-render, then trigger block re-initialization
      await new Promise(resolve => setTimeout(resolve, 300));

      console.log('[Convert to Dynamic] Triggering block re-initialization');
      const event = new CustomEvent('blocks-need-update');
      window.dispatchEvent(event);

      // Hide loading overlay
      if (onConversionComplete) {
        onConversionComplete();
      }

      // Show success message with instruction
      toast.success("Slide converted to dynamic template!", {
        description: "Select a block (Ctrl/Cmd + Click) to generate layout variants",
        duration: 5000
      });

      // Do NOT auto-generate - user must manually click "Generate Layout Options"
      // Reason: After conversion, selectedBlock.element becomes stale (detached from DOM)
      // User needs to re-select the block first

    } catch (error: any) {
      console.error('[Convert to Dynamic] ERROR:', error);
      console.log('[Convert to Dynamic] Error details:', JSON.stringify(error, null, 2));
      console.log('========================================');

      // Hide loading overlay on error
      if (onConversionComplete) {
        onConversionComplete();
      }

      toast.error(`Failed to convert: ${error.message || 'Unknown error'}`);
    } finally {
      setIsConverting(false);
    }
  };

  const handleGenerateLayoutVariants = useCallback(async (skipValidation = false) => {
    console.log('========================================');
    console.log('[handleGenerateLayoutVariants] ENTRY');
    console.log('  selectedBlock type:', selectedBlock?.type);
    console.log('  slideId prop:', slideId);
    console.log('  slideIndex:', slideIndex);
    console.log('  skipValidation:', skipValidation);

    if (!selectedBlock?.element) {
      console.log('[handleGenerateLayoutVariants] ERROR: No block selected');
      toast.error("No block selected");
      return;
    }

    // NEW VALIDATION: Slide must have html_content (unless called from conversion)
    if (!skipValidation && slideIndex !== null && presentationData?.slides) {
      const currentSlide = presentationData.slides[slideIndex];

      if (!currentSlide || !currentSlide.html_content || !currentSlide.html_content.trim()) {
        console.log('[handleGenerateLayoutVariants] ERROR: Slide does not have html_content');
        console.log('[handleGenerateLayoutVariants] User should convert to dynamic first');
        console.log('========================================');
        toast.error("Please convert to dynamic template first");
        return;
      }

      console.log('[handleGenerateLayoutVariants] Slide has html_content, proceeding');
      console.log('  html_content length:', currentSlide.html_content.length);
    } else if (skipValidation) {
      console.log('[handleGenerateLayoutVariants] Validation skipped (called from conversion)');
    }

    // Capture the selected block's anchor for exact matching during apply
    const blockAnchor = selectedBlock.element.getAttribute('data-block-anchor');
    console.log('[handleGenerateLayoutVariants] Capturing selected block anchor:', blockAnchor);

    if (blockAnchor) {
      setSelectedBlockAnchor(blockAnchor);
      console.log('[handleGenerateLayoutVariants] Anchor saved for future apply operations');
    } else {
      console.warn('[handleGenerateLayoutVariants] WARNING: Selected block has no anchor!');
      console.warn('  This might happen if slide was not converted properly');
      console.warn('  Matching during apply will use fallback logic (less accurate)');
    }

    // Store the original slide content before generating variants
    if (slideIndex !== null && presentationData?.slides) {
      const currentSlide = presentationData.slides[slideIndex];
      console.log('[handleGenerateLayoutVariants] Capturing current slide as original layout');
      console.log('  currentSlide.id:', currentSlide.id);
      console.log('  currentSlide.content:', JSON.stringify(currentSlide.content).substring(0, 100));
      console.log('  existing originalLayoutSlideContent.id:', originalLayoutSlideContent?.id);
      console.log('  OVERWRITING originalLayoutSlideContent');
      setOriginalLayoutSlideContent(currentSlide);
    }

    console.log('[handleGenerateLayoutVariants] Clearing cache and state');
    setIsGeneratingLayouts(true);
    setLayoutVariants([]);
    setRegeneratedSlides([]); // Clear cache
    setCurrentlyAppliedIndex(null);

    try {
      const blockElement = selectedBlock.element;
      const blockHTML = cleanHTMLForAI(blockElement.outerHTML);
      const blockType = selectedBlock.type || 'container';

      // Capture element dimensions
      const availableWidth = blockElement.offsetWidth;
      const availableHeight = blockElement.offsetHeight;

      console.log('[handleGenerateLayoutVariants] Element dimensions:');
      console.log('  availableWidth:', availableWidth);
      console.log('  availableHeight:', availableHeight);
      console.log('  blockElement.offsetParent:', blockElement.offsetParent);
      console.log('  blockElement.clientWidth:', blockElement.clientWidth);
      console.log('  blockElement.clientHeight:', blockElement.clientHeight);

      // Validate dimensions
      if (availableWidth <= 0 || availableHeight <= 0) {
        console.log('[handleGenerateLayoutVariants] ERROR: Invalid dimensions');
        console.log('  This usually means the element is not visible or not rendered');
        console.log('========================================');
        toast.error("Cannot capture element dimensions", {
          description: "The selected block is not visible. Please ensure the slide is fully rendered.",
        });
        setIsGeneratingLayouts(false);
        return;
      }

      // Get parent container information
      const parentElement = blockElement.parentElement;
      let parentContainerInfo = '';
      if (parentElement) {
        const parentClasses = parentElement.className;
        const isFlexParent = parentClasses.includes('flex');
        const isGridParent = parentClasses.includes('grid');
        const parentWidth = parentElement.offsetWidth;

        parentContainerInfo = `Parent: ${isFlexParent ? 'flex' : isGridParent ? 'grid' : 'block'} container, ` +
          `width: ${parentWidth}px, classes: ${parentClasses.split(' ').slice(0, 5).join(' ')}`;
      }

      // Get the full slide HTML for context
      let fullSlideHTML = '';
      let fullSlideHTMLForPreview = ''; // Keep original HTML for preview rendering
      if (slideId) {
        const slideContainer = document.querySelector(`[data-slide-id="${slideId}"]`);
        if (slideContainer) {
          const slideContent = slideContainer.querySelector('[data-slide-content="true"]');
          if (slideContent) {
            fullSlideHTMLForPreview = slideContent.innerHTML; // Original HTML for preview
            fullSlideHTML = cleanHTMLForAI(fullSlideHTMLForPreview); // Cleaned for API
            console.log('[SmartSuggestions] Captured full slide HTML:', fullSlideHTML.length, 'chars');
          }
        }
      }

      console.log('[handleGenerateLayoutVariants] Calling API to generate layout variants');
      console.log('[handleGenerateLayoutVariants] API parameters:');
      console.log('  blockHTML length:', blockHTML.length);
      console.log('  fullSlideHTML length:', fullSlideHTML.length);
      console.log('  blockType:', blockType);
      console.log('  availableWidth:', availableWidth);
      console.log('  availableHeight:', availableHeight);
      console.log('  parentContainerInfo:', parentContainerInfo);
      console.log('  count: 3');

      const response = await PresentationGenerationApi.generateLayoutVariants(
        blockHTML,
        fullSlideHTML,
        blockType,
        availableWidth,
        availableHeight,
        parentContainerInfo,
        3
      );
      console.log('[handleGenerateLayoutVariants] API call succeeded');

      if (response && response.variants) {
        console.log('[handleGenerateLayoutVariants] Generated', response.variants.length, 'variants');
        // Use the ORIGINAL fullSlideHTML for preview generation (not cleaned)
        const variantsWithIds = response.variants.map((variant: any, index: number) => {
          // Generate full preview HTML by replacing the original block with the variant
          let fullPreviewHTML = '';
          if (fullSlideHTMLForPreview && blockElement) {
            // Get the original (uncleaned) block HTML for replacement
            const originalBlockHTML = blockElement.outerHTML;

            // Debug: Log what we're working with
            console.log(`[SmartSuggestions] Variant ${index}:`);
            console.log('  - Original block HTML (first 200 chars):', originalBlockHTML.substring(0, 200));
            console.log('  - Variant HTML (first 200 chars):', variant.html.substring(0, 200));
            console.log('  - Full slide HTML length:', fullSlideHTMLForPreview.length);

            // Simple string replacement - fast and efficient!
            fullPreviewHTML = fullSlideHTMLForPreview.replace(originalBlockHTML, variant.html);

            // Check if replacement worked
            if (fullPreviewHTML === fullSlideHTMLForPreview) {
              console.warn(`[SmartSuggestions] Variant ${index}: String replacement FAILED - HTML unchanged`);
              console.warn('  Trying to find block in slide...');
              console.warn('  Block outerHTML hash:', originalBlockHTML.length);

              // Try to find the block another way - by content matching
              // Just use the variant HTML wrapped in the slide structure
              fullPreviewHTML = fullSlideHTMLForPreview; // Keep original for now
            } else {
              console.log(`[SmartSuggestions] Variant ${index}: Preview generated successfully`, fullPreviewHTML.length, 'chars');
            }
          } else {
            console.warn(`[SmartSuggestions] Variant ${index}: Missing fullSlideHTML or blockElement, using fallback`);
          }

          return {
            id: `layout-${index}`,
            title: variant.title,
            description: variant.description,
            html: variant.html,
            fullPreviewHTML: fullPreviewHTML || variant.html, // Fallback to just variant if full HTML unavailable
          };
        });
        setLayoutVariants(variantsWithIds);
        toast.success(`${variantsWithIds.length} layout variants generated!`);
      }
      console.log('========================================');
    } catch (error: any) {
      console.error('[handleGenerateLayoutVariants] ERROR:', error);
      console.log('========================================');
      toast.error("Failed to generate layout variants", {
        description: error.message || "Please try again.",
      });
    } finally {
      setIsGeneratingLayouts(false);
    }
  }, [selectedBlock?.element, selectedBlock?.type, slideId, presentationData, slideIndex, originalLayoutSlideContent]);

  // SIMPLIFIED APPLY FUNCTION: HTML-to-HTML replacement (post-conversion)
  const applyLayoutVariant = async (variant: LayoutVariant, variantIndex: number) => {
    console.log('========================================');
    console.log('[applyLayoutVariant] ENTRY');
    console.log('  variant:', variant.id, '-', variant.title);
    console.log('  variantIndex:', variantIndex);
    console.log('  slideIndex:', slideIndex);

    // Validation: slideIndex and presentationData required
    if (slideIndex === null || !presentationData) {
      console.log('[applyLayoutVariant] ERROR: Missing slideIndex or presentationData');
      console.log('========================================');
      toast.error("Could not identify the slide");
      return;
    }

    const currentSlide = presentationData.slides[slideIndex];

    // Validate currentSlide exists
    if (!currentSlide) {
      console.log('[applyLayoutVariant] ERROR: Could not find slide at index', slideIndex);
      console.log('  presentationData.slides length:', presentationData.slides?.length);
      console.log('========================================');
      toast.error("Could not find the current slide");
      return;
    }

    console.log('[applyLayoutVariant] Current slide ID:', currentSlide.id);
    console.log('[applyLayoutVariant] Has html_content:', !!currentSlide.html_content);

    // CRITICAL VALIDATION: Must have html_content (ensured by conversion)
    if (!currentSlide.html_content || !currentSlide.html_content.trim()) {
      console.log('[applyLayoutVariant] ERROR: Slide does not have html_content');
      console.log('[applyLayoutVariant] This should not happen - conversion should run first');
      console.log('========================================');
      toast.error("Slide must be converted to dynamic template first");
      return;
    }

    // Validation: Selected block required
    if (!selectedBlock?.element) {
      console.log('[applyLayoutVariant] ERROR: No block selected');
      console.log('========================================');
      toast.error("No block selected");
      return;
    }

    console.log('[applyLayoutVariant] All validations passed');
    console.log('  Current html_content length:', currentSlide.html_content.length);
    console.log('  Selected block type:', selectedBlock.type);

    setApplyingId(variant.id);

    try {
      console.log('[applyLayoutVariant] Starting DOM-based block replacement');

      // Parse html_content into DOM
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = currentSlide.html_content;
      console.log('[applyLayoutVariant] Parsed html_content into DOM');

      let targetBlock: Element | null = null;

      // PRIORITY 1: Match by exact data-block-anchor (most reliable)
      if (selectedBlockAnchor) {
        console.log('[applyLayoutVariant] Attempting EXACT match by anchor:', selectedBlockAnchor);
        targetBlock = tempDiv.querySelector(`[data-block-anchor="${selectedBlockAnchor}"]`);

        if (targetBlock) {
          console.log('[applyLayoutVariant] ✓ EXACT match found by anchor!');
          const blockType = (targetBlock as HTMLElement).getAttribute('data-block-type');
          console.log('  Block type:', blockType);
        } else {
          console.warn('[applyLayoutVariant] Anchor match failed, falling back to type matching');
        }
      } else {
        console.warn('[applyLayoutVariant] No selectedBlockAnchor available, using fallback matching');
      }

      // FALLBACK: Match by data-block-type and class similarity (if anchor match failed)
      if (!targetBlock) {
        const blockType = selectedBlock.type;
        console.log('[applyLayoutVariant] Fallback: Matching by block type:', blockType);

        // Find blocks with matching data-block-type
        const blocksOfType = tempDiv.querySelectorAll(`[data-block-type="${blockType}"]`);
        console.log('[applyLayoutVariant] Found', blocksOfType.length, `blocks with type "${blockType}"`);

        if (blocksOfType.length === 0) {
          throw new Error(`No blocks found with type "${blockType}" in html_content`);
        }

        if (blocksOfType.length === 1) {
          targetBlock = blocksOfType[0];
          console.log('[applyLayoutVariant] Single block found, using it');
        } else {
        // Match by checking if classes overlap - prioritize unique classes
        const selectedClasses = selectedBlock.element.className.split(' ')
          .filter(c => c.trim() && !c.includes('block-') && !c.includes('hoverable') && !c.includes('selected'));

        console.log('[applyLayoutVariant] Multiple blocks, matching by classes:', selectedClasses.slice(0, 8));

        // Score each block by how well it matches
        let bestMatch = { block: blocksOfType[0], score: 0, index: 0 };

        for (let i = 0; i < blocksOfType.length; i++) {
          const block = blocksOfType[i] as HTMLElement;
          const blockClasses = block.className.split(' ')
            .filter(c => c.trim() && !c.includes('block-') && !c.includes('hoverable') && !c.includes('selected'));

          // Check for class overlap
          const overlap = blockClasses.filter(c => selectedClasses.includes(c));

          // Prioritize unique/specific classes
          let score = overlap.length;

          // Bonus points for distinctive spacing/layout classes
          const distinctiveClasses = ['pl-8', 'pr-8', 'pt-8', 'pb-8', 'space-y', 'space-x', 'flex-col', 'flex-row', 'items-center', 'items-start', 'items-end', 'justify-start', 'justify-end'];
          const distinctiveMatches = overlap.filter(c => distinctiveClasses.some(dc => c.includes(dc)));
          score += distinctiveMatches.length * 2;  // 2x weight for distinctive classes

          console.log(`[applyLayoutVariant] Block ${i} score: ${score}, overlap: ${overlap.length}, distinctive: ${distinctiveMatches.length}`);
          console.log(`  Classes: ${blockClasses.slice(0, 8).join(', ')}`);

          if (score > bestMatch.score) {
            bestMatch = { block, score, index: i };
          }
        }

          targetBlock = bestMatch.block;
          console.log('[applyLayoutVariant] Best match: block', bestMatch.index, 'with score:', bestMatch.score);
        }
      }

      // Verify we have a target block
      if (!targetBlock) {
        throw new Error("Could not find target block to replace");
      }

      // Replace the matched block with variant HTML
      console.log('[applyLayoutVariant] Replacing matched block with variant HTML');
      const variantContainer = document.createElement('div');
      variantContainer.innerHTML = variant.html;
      const variantElement = variantContainer.firstElementChild;

      if (!variantElement) {
        throw new Error("Variant HTML is empty or invalid");
      }

      // CLEAN variant HTML before applying (remove Tiptap, selection classes)
      console.log('[applyLayoutVariant] Cleaning variant HTML');

      // Remove Tiptap wrappers from all text elements in variant
      const variantTextElements = variantElement.querySelectorAll('[data-textpath]');
      let tiptapRemovedFromVariant = 0;

      variantTextElements.forEach(el => {
        const htmlEl = el as HTMLElement;
        const tiptapEditor = Array.from(htmlEl.children).find(
          child => child.classList.contains('tiptap-text-editor')
        );

        if (tiptapEditor) {
          const proseMirror = tiptapEditor.querySelector('.ProseMirror');
          const textContent = proseMirror?.textContent || tiptapEditor.textContent || '';
          tiptapEditor.replaceWith(document.createTextNode(textContent));
          tiptapRemovedFromVariant++;
        }
      });

      // Remove selection-related classes from all elements
      variantElement.querySelectorAll('*').forEach(el => {
        el.classList.remove('block-hoverable', 'block-selected', 'outline-yellow-500', 'ring-2', 'ring-yellow-400', 'ring-offset-2');
      });

      console.log('[applyLayoutVariant] Variant cleaned:');
      console.log('  Tiptap removed from:', tiptapRemovedFromVariant, 'elements');
      console.log('  Selection classes removed');

      // CRITICAL: Preserve the anchor in the variant element
      if (selectedBlockAnchor) {
        (variantElement as HTMLElement).setAttribute('data-block-anchor', selectedBlockAnchor);
        console.log('[applyLayoutVariant] Added anchor to variant element:', selectedBlockAnchor);
      }

      // Also preserve data-block-type if missing
      const originalBlockType = (targetBlock as HTMLElement).getAttribute('data-block-type');
      if (originalBlockType && !(variantElement as HTMLElement).hasAttribute('data-block-type')) {
        (variantElement as HTMLElement).setAttribute('data-block-type', originalBlockType);
        console.log('[applyLayoutVariant] Added data-block-type to variant:', originalBlockType);
      }

      targetBlock.replaceWith(variantElement);
      console.log('[applyLayoutVariant] Block replaced successfully');

      // Clean runtime classes and attributes before saving
      console.log('[applyLayoutVariant] Cleaning runtime classes and attributes');
      const { classesRemoved, attributesRemoved } = cleanRuntimeAttributes(tempDiv);
      console.log('[applyLayoutVariant] Cleaned', classesRemoved, 'runtime classes and', attributesRemoved, 'runtime attributes');

      // Extract updated HTML
      const updatedHTML = tempDiv.innerHTML;
      console.log('[applyLayoutVariant] Extracted updated HTML');
      console.log('  Updated HTML length:', updatedHTML.length);
      console.log('  Original HTML length:', currentSlide.html_content.length);
      console.log('  Changed by:', updatedHTML.length - currentSlide.html_content.length, 'characters');

      // Save the updated HTML (single API call)
      console.log('[applyLayoutVariant] Saving updated HTML to database');
      console.log('  Calling saveHtmlVariant with slide ID:', currentSlide.id);

      const updatedSlide = await PresentationGenerationApi.saveHtmlVariant(
        currentSlide.id,
        updatedHTML
      );

      console.log('[applyLayoutVariant] Saved to database successfully');
      console.log('  New slide ID:', updatedSlide.id);
      console.log('  Has html_content:', !!updatedSlide.html_content);

      // Update Redux with new slide
      console.log('[applyLayoutVariant] Updating Redux');
      dispatch(updateSlide({ index: slideIndex, slide: updatedSlide }));
      console.log('[applyLayoutVariant] Redux updated');

      // Update state
      setCurrentlyAppliedIndex(variantIndex);
      setAppliedLayouts(new Set([variant.id]));

      console.log('[applyLayoutVariant] SUCCESS - Layout variant applied');
      console.log('  Applied variant index:', variantIndex);
      console.log('  Applied variant ID:', variant.id);
      console.log('========================================');

      toast.success(`Applied: ${variant.title}`);

    } catch (error: any) {
      console.error('[applyLayoutVariant] ERROR:', error);
      console.log('[applyLayoutVariant] Error details:', JSON.stringify(error, null, 2));
      console.log('========================================');
      toast.error(`Failed to apply variant: ${error.message || 'Unknown error'}`);
    } finally {
      console.log('[applyLayoutVariant] Clearing applyingId');
      setApplyingId(null);
    }
  };

  const handleSaveAndClose = () => {
    // Clear variants from memory
    setLayoutVariants([]);
    setRegeneratedSlides([]);
    setCurrentlyAppliedIndex(null);
    setAppliedLayouts(new Set());
    setOriginalLayoutSlideContent(null);

    // Close panel
    onClose();

    toast.success("Layout saved!");
    // Auto-save will persist to database automatically
  };

  const handleRestoreOriginalLayout = async () => {
    console.log('========================================');
    console.log('[Restore Layout Button] CLICKED');
    console.log('  Restoring to initial converted state (originalLayoutSlideContent)');
    console.log('  originalLayoutSlideContent.id:', originalLayoutSlideContent?.id);

    if (!originalLayoutSlideContent || slideIndex === null) {
      console.log('[Restore Layout Button] ERROR: Missing originalLayoutSlideContent or slideIndex');
      console.log('  originalLayoutSlideContent exists:', !!originalLayoutSlideContent);
      console.log('  slideIndex:', slideIndex);
      console.log('========================================');
      toast.error("No original layout to restore");
      return;
    }

    setApplyingId("restoring");

    try {
      // Restore to initial converted state (still has html_content)
      console.log('[Restore Layout Button] Dispatching updateSlide to Redux');
      console.log('  Restoring slide with ID:', originalLayoutSlideContent.id);
      console.log('  has html_content:', !!originalLayoutSlideContent.html_content);

      dispatch(updateSlide({ index: slideIndex, slide: originalLayoutSlideContent }));

      console.log('[Restore Layout Button] Restored to initial converted state');
      console.log('  Slide is STILL in dynamic mode');
      console.log('  html_content preserved:', !!originalLayoutSlideContent.html_content);

      // Reset APPLIED state only (NOT variant generation state)
      setCurrentlyAppliedIndex(null);
      setAppliedLayouts(new Set());

      // DO NOT clear layoutVariants (keep variants visible)
      // DO NOT clear regeneratedSlides (keep cache)
      // DO NOT set needsConversion = true
      // Slide stays in dynamic mode after restore
      // User can try different variants without regenerating

      console.log('[Restore Layout Button] SUCCESS');
      console.log('  currentlyAppliedIndex: null');
      console.log('  appliedLayouts: cleared');
      console.log('  layoutVariants: KEPT (still visible)');
      console.log('  needsConversion: false (stays dynamic)');
      console.log('========================================');

      toast.success("Restored to initial layout");
    } catch (error) {
      console.error('[Restore Layout Button] ERROR:', error);
      console.log('[Restore Layout Button] Error details:', JSON.stringify(error, null, 2));
      console.log('========================================');
      toast.error("Failed to restore layout");
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="h-full bg-white rounded-[20px] flex flex-col smart-suggestions-panel overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Smart Suggestions</h3>
        </div>
        <button
          onClick={onClose}
          disabled={applyingId !== null}
          className="p-1 hover:bg-gray-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Selected Block/Text Preview */}
      {selectedBlock?.element && !selectedText ? (
        <div className="p-4 bg-purple-50 border-b border-gray-200">
          <p className="text-xs text-gray-600 mb-1">
            Selected block: <span className="font-semibold capitalize">{selectedBlock.type}</span>
          </p>
          <p className="text-sm text-gray-900 italic line-clamp-3">
            "{selectedBlock.content}"
          </p>
        </div>
      ) : selectedText ? (
        <div className="p-4 bg-blue-50 border-b border-gray-200">
          <p className="text-xs text-gray-600 mb-1">Selected text:</p>
          <p className="text-sm text-gray-900 italic line-clamp-3">
            "{selectedText}"
          </p>
        </div>
      ) : null}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "suggestions" | "variants")} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full rounded-none border-b flex-shrink-0">
          <TabsTrigger value="suggestions" className="flex-1 gap-2" disabled={applyingId !== null}>
            <Wand2 className="w-4 h-4" />
            Suggestions
          </TabsTrigger>
          <TabsTrigger
            value="variants"
            className="flex-1 gap-2"
            disabled={!selectedBlock?.element || !(needsConversion || canUseVariants) || applyingId !== null}
            title={!canUseVariants && selectedBlock?.element && !needsConversion ? "Select a container block (purple outline) for layout variants" : ""}
          >
            <Palette className="w-4 h-4" />
            Variants
          </TabsTrigger>
        </TabsList>

        {/* Suggestions Tab - Text Variants */}
        <TabsContent value="suggestions" className="flex-1 overflow-y-auto p-4 mt-0 min-h-0">
          {!selectedText && !selectedBlock?.content ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Wand2 className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-sm text-gray-600 mb-1">No content selected</p>
              <p className="text-xs text-gray-500">
                Select text or click on a block to generate variants
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Generate Variants Button */}
              {variants.length === 0 && !isGeneratingVariants && (
                <Button
                  onClick={handleGenerateVariants}
                  className="w-full"
                  size="lg"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate Variants
                </Button>
              )}

              {/* Loading State */}
              {isGeneratingVariants && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
                  <p className="text-sm text-gray-600">Generating variants...</p>
                  <p className="text-xs text-gray-500 mt-1">This may take a few seconds</p>
                </div>
              )}

              {/* Variants List */}
              {variants.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-700">
                      {variants.length} variants generated
                    </p>
                    <Button
                      onClick={() => {
                        console.log('[Regenerate Button] CLICKED - calling handleGenerateVariants');
                        handleGenerateVariants();
                      }}
                      variant="outline"
                      size="sm"
                      disabled={isGeneratingVariants || applyingId !== null}
                    >
                      Regenerate
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {variants.map((variant, index) => (
                      <VariantCard
                        key={variant.id}
                        variant={variant}
                        index={index}
                        isApplying={applyingId === variant.id}
                        isApplied={currentlyAppliedTextIndex === index}
                        onApply={() => applyVariant(variant, index)}
                      />
                    ))}
                  </div>

                  {/* Restore Original Button - Show when a variant is applied */}
                  {currentlyAppliedTextIndex !== null && originalSlideContent && (
                    <div className="pt-4 mt-4 border-t border-gray-200">
                      <Button
                        onClick={() => {
                          console.log('========================================');
                          console.log('[Restore Button] CLICKED');
                          console.log('  slideIndex:', slideIndex);
                          console.log('  originalSlideContent.id:', originalSlideContent?.id);
                          console.log('  originalSlideContent.content:', JSON.stringify(originalSlideContent?.content).substring(0, 100));
                          console.log('  currentlyAppliedTextIndex:', currentlyAppliedTextIndex);
                          console.log('  regeneratedTextSlides cache size:', regeneratedTextSlides.length);

                          if (slideIndex !== null && originalSlideContent) {
                            dispatch(updateSlide({ index: slideIndex, slide: originalSlideContent }));
                            setCurrentlyAppliedTextIndex(null);
                            setAppliedVariants(new Set());
                            setRegeneratedTextSlides([]); // FIX: Clear cache on restore
                            console.log('[Restore Button] Restored original slide');
                            console.log('[Restore Button] Cache cleared');
                            toast.success("Restored original content");
                          }
                          console.log('========================================');
                        }}
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={applyingId !== null}
                      >
                        Restore Original
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </TabsContent>

        {/* Variants Tab - Visual Preview of Layout Changes */}
        <TabsContent value="variants" className="flex-1 overflow-y-auto p-4 mt-0 min-h-0">
          {!selectedBlock?.element ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Palette className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-sm text-gray-600 mb-1">No block selected</p>
              <p className="text-xs text-gray-500">
                Ctrl/Cmd + Click on a structural block to see layout options
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Conversion Warning UI - Shows when slide needs conversion */}
              {needsConversion && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-yellow-900 mb-1">
                        Convert to Dynamic Template
                      </h4>
                      <p className="text-sm text-yellow-700 mb-2">
                        Layout variants require a dynamic template. This will capture the current
                        layout and enable customization. The panel will close during conversion.
                      </p>
                      <p className="text-xs text-yellow-600 mb-3 font-semibold">
                        ⚠️ Once converted, this slide will permanently use dynamic HTML rendering.
                      </p>
                      <Button
                        onClick={handleConvertToDynamic}
                        disabled={isConverting || !selectedBlock?.element}
                        size="sm"
                        className="bg-yellow-600 hover:bg-yellow-700 text-white"
                      >
                        {isConverting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Converting...
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-4 h-4 mr-2" />
                            Convert to Dynamic
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Generate Layout Variants Button - Only show after conversion */}
              {!needsConversion && layoutVariants.length === 0 && !isGeneratingLayouts && (
                <div>
                  <p className="text-xs text-gray-600 mb-3">
                    Preview different layout arrangements before applying them
                  </p>
                  <Button
                    onClick={handleGenerateLayoutVariants}
                    className="w-full"
                    size="lg"
                  >
                    <Palette className="w-4 h-4 mr-2" />
                    Generate Layout Options
                  </Button>
                </div>
              )}

              {/* Loading State */}
              {isGeneratingLayouts && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-600 mb-3" />
                  <p className="text-sm text-gray-600">Generating layout options...</p>
                  <p className="text-xs text-gray-500 mt-1">Creating visual previews</p>
                </div>
              )}

              {/* Layout Variants List with Preview */}
              {layoutVariants.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-700">
                      {layoutVariants.length} layout options
                    </p>
                    <Button
                      onClick={handleGenerateLayoutVariants}
                      variant="outline"
                      size="sm"
                      disabled={isGeneratingLayouts || applyingId !== null}
                    >
                      Regenerate
                    </Button>
                  </div>
                  <div className="space-y-4">
                    {layoutVariants.map((variant, index) => (
                      <LayoutVariantCard
                        key={variant.id}
                        variant={variant}
                        index={index}
                        isApplying={applyingId === variant.id}
                        isApplied={appliedLayouts.has(variant.id)}
                        isCurrentlyApplied={currentlyAppliedIndex === index}
                        onApply={() => applyLayoutVariant(variant, index)}
                        selectedBlock={selectedBlock}
                        slideId={slideId}
                      />
                    ))}
                  </div>

                  {/* Restore Original Button - Show when a variant is applied */}
                  {currentlyAppliedIndex !== null && originalLayoutSlideContent && (
                    <div className="pt-4 mt-4 border-t border-gray-200">
                      <Button
                        onClick={handleRestoreOriginalLayout}
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={applyingId !== null}
                      >
                        Restore Original
                      </Button>
                    </div>
                  )}

                  {/* Done Button - Show when a layout is applied */}
                  {currentlyAppliedIndex !== null && (
                    <div className="pt-4 mt-4 border-t border-gray-200 sticky bottom-0 bg-white">
                      <Button
                        onClick={handleSaveAndClose}
                        className="w-full"
                        size="lg"
                        variant="default"
                        disabled={applyingId !== null}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Done - Save Layout
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

interface VariantCardProps {
  variant: Variant;
  index: number;
  isApplying: boolean;
  isApplied: boolean;
  onApply: () => void;
}

const VariantCard: React.FC<VariantCardProps> = ({
  variant,
  index,
  isApplying,
  isApplied,
  onApply,
}) => {
  return (
    <div className={`border rounded-lg p-4 transition-colors ${
      isApplied
        ? 'border-green-500 bg-green-50'
        : 'border-gray-200 bg-white hover:border-blue-300'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <span className={`text-xs font-semibold px-2 py-1 rounded ${
          isApplied
            ? 'text-green-700 bg-green-100'
            : 'text-blue-600 bg-blue-50'
        }`}>
          Variant {index + 1}
        </span>
        {isApplied && (
          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
        )}
      </div>
      <p className="text-sm text-gray-900 mb-3 leading-relaxed">{variant.text}</p>
      <Button
        size="sm"
        onClick={onApply}
        disabled={isApplying}
        className="w-full"
        variant={isApplied ? "outline" : "default"}
      >
        {isApplying ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin mr-2" />
            Applying...
          </>
        ) : isApplied ? (
          <>
            <CheckCircle2 className="w-3 h-3 mr-2" />
            Applied
          </>
        ) : (
          "Apply"
        )}
      </Button>
    </div>
  );
};

interface LayoutVariantCardProps {
  variant: LayoutVariant;
  index: number;
  isApplying: boolean;
  isApplied: boolean;
  isCurrentlyApplied: boolean;
  onApply: () => void;
  selectedBlock?: BlockSelection;
  slideId?: string | null;
}

const LayoutVariantCard: React.FC<LayoutVariantCardProps> = ({
  variant,
  index,
  isApplying,
  isApplied,
  isCurrentlyApplied,
  onApply,
  selectedBlock,
  slideId,
}) => {
  // Simple and fast: just render the variant HTML directly
  // No DOM cloning, no complex operations

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${
      isCurrentlyApplied
        ? 'border-green-500 bg-green-50'
        : 'border-gray-200 bg-white hover:border-purple-300'
    }`}>
      {/* Layout Title and Status */}
      <div className="p-3 border-b border-gray-200 flex items-start justify-between">
        <div>
          <span className={`text-xs font-semibold px-2 py-1 rounded ${
            isCurrentlyApplied
              ? 'text-green-700 bg-green-100'
              : 'text-purple-600 bg-purple-50'
          }`}>
            {variant.title}
          </span>
          <p className="text-xs text-gray-600 mt-1">{variant.description}</p>
        </div>
        {isCurrentlyApplied && (
          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
        )}
      </div>

      {/* Visual Preview - Full slide with variant applied */}
      <div className="p-2 bg-gray-50">
        <div className="border border-gray-300 rounded overflow-hidden bg-white">
          {/* 16:9 aspect ratio container */}
          <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
              {/* Scaled down full slide preview */}
              <div
                dangerouslySetInnerHTML={{ __html: variant.fullPreviewHTML || variant.html }}
                className="pointer-events-none origin-top-left"
                style={{
                  transform: 'scale(0.25)',
                  width: '400%',
                  height: '400%',
                }}
              />
              {/* Hide any selection outlines in preview */}
              <style>{`
                [class*="outline-yellow"],
                [class*="ring-yellow"] {
                  outline: none !important;
                  box-shadow: none !important;
                  ring-width: 0 !important;
                }
              `}</style>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1 text-center">Full slide preview with layout change</p>
      </div>

      {/* Apply Button */}
      <div className="p-3">
        <Button
          size="sm"
          onClick={onApply}
          disabled={isApplying}
          className="w-full"
          variant={isCurrentlyApplied ? "outline" : "default"}
        >
          {isApplying ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin mr-2" />
              Applying...
            </>
          ) : isCurrentlyApplied ? (
            <>
              <CheckCircle2 className="w-3 h-3 mr-2" />
              Applied
            </>
          ) : (
            "Apply Layout"
          )}
        </Button>
      </div>
    </div>
  );
};

export default SmartSuggestionsPanel;
