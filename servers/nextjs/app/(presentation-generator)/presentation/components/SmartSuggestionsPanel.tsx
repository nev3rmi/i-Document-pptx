"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Lightbulb, Palette, Loader2, X, CheckCircle2, Wand2 } from "lucide-react";
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
}

const SmartSuggestionsPanel: React.FC<SmartSuggestionsPanelProps> = ({
  selectedText,
  slideId,
  slideIndex,
  selectedBlock,
  onClose,
  clearBlockSelection,
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

  const { presentationData } = useSelector(
    (state: RootState) => state.presentationGeneration
  );

  // Detect when selection changes and regenerate variants
  useEffect(() => {
    const currentContent = selectedText || selectedBlock?.content || '';
    const currentElement = selectedBlock?.element || null;

    // Check if the selected content or block element changed
    const contentChanged = currentContent !== previousSelectedContent;
    const elementChanged = currentElement !== previousBlockElement;

    if (contentChanged || elementChanged) {
      // Clear text variants when text selection changes
      if (contentChanged && currentContent) {
        setVariants([]);
        setRegeneratedTextSlides([]);
        setCurrentlyAppliedTextIndex(null);
        setAppliedVariants(new Set());
      }

      // Clear layout variants when block selection changes
      if (elementChanged && currentElement) {
        setLayoutVariants([]);
        setRegeneratedSlides([]);
        setCurrentlyAppliedIndex(null);
        setAppliedLayouts(new Set());
      }

      // Update tracking
      setPreviousSelectedContent(currentContent);
      setPreviousBlockElement(currentElement);
    }
  }, [selectedText, selectedBlock?.content, selectedBlock?.element, previousSelectedContent, previousBlockElement]);

  const handleGenerateVariants = useCallback(async () => {
    const textToVariate = selectedText || selectedBlock?.content || '';

    if (!textToVariate || !slideId) {
      toast.error("No content selected");
      return;
    }

    // Store the original slide content before generating variants
    if (slideIndex !== null && presentationData?.slides) {
      const currentSlide = presentationData.slides[slideIndex];
      setOriginalSlideContent(currentSlide);
    }

    setIsGeneratingVariants(true);
    setVariants([]);
    setRegeneratedTextSlides([]); // Clear cache
    setCurrentlyAppliedTextIndex(null);
    setOriginalText(textToVariate);
    setAppliedVariants(new Set());

    try {
      const response = await PresentationGenerationApi.generateTextVariants(textToVariate, 3);

      if (response && response.variants) {
        const variantsWithIds = response.variants.map((text: string, index: number) => ({
          id: `variant-${index}`,
          text,
        }));
        setVariants(variantsWithIds);
        toast.success(`${variantsWithIds.length} text variants generated!`);
      }
    } catch (error: any) {
      console.error("Error generating variants:", error);
      toast.error("Failed to generate variants", {
        description: error.message || "Please try again.",
      });
    } finally {
      setIsGeneratingVariants(false);
    }
  }, [selectedText, selectedBlock?.content, slideIndex, presentationData?.slides, slideId]);

  // Auto-generate text variants when content is available
  useEffect(() => {
    const textToVariate = selectedText || selectedBlock?.content || '';

    if (textToVariate && activeTab === "suggestions" && variants.length === 0 && !isGeneratingVariants) {
      handleGenerateVariants();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedText, selectedBlock?.content, activeTab, variants.length, isGeneratingVariants]);

  // Auto-generate layout variants when a block is selected
  useEffect(() => {
    if (selectedBlock?.element && activeTab === "variants" && layoutVariants.length === 0 && !isGeneratingLayouts) {
      handleGenerateLayoutVariants();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBlock?.element, activeTab, layoutVariants.length, isGeneratingLayouts]);

  const applyVariant = async (variant: Variant, variantIndex: number) => {
    if (!slideId || slideIndex === null) {
      toast.error("Could not identify the slide. Please try again.");
      return;
    }

    // Set applying state to disable all actions
    setApplyingId(variant.id);

    try {
      let slideToApply = regeneratedTextSlides[variantIndex];

      // If not cached, generate it now
      if (!slideToApply) {
        toast.info("Generating slide...");

        // Restore original slide to database first
        if (originalSlideContent && presentationData?.id) {
          const updatedSlides = [...presentationData.slides];
          updatedSlides[slideIndex] = originalSlideContent;

          await PresentationGenerationApi.updatePresentationContent({
            id: presentationData.id,
            slides: updatedSlides
          });

          // Give the database a moment to update
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Generate the slide with this variant
        const prompt = `Replace the text "${originalText}" with this alternative version: "${variant.text}". Keep everything else on the slide unchanged.`;
        slideToApply = await PresentationGenerationApi.editSlide(slideId, prompt);

        // Cache it for future use
        const updatedCache = [...regeneratedTextSlides];
        updatedCache[variantIndex] = slideToApply;
        setRegeneratedTextSlides(updatedCache);
      }

      // Apply the slide
      dispatch(updateSlide({ index: slideIndex, slide: slideToApply }));

      setCurrentlyAppliedTextIndex(variantIndex);
      setAppliedVariants(new Set([variant.id]));

      toast.success("Variant applied!");
    } catch (error) {
      toast.error("Failed to apply variant");
      console.error("Error applying variant:", error);
    } finally {
      // Clear applying state to re-enable actions
      setApplyingId(null);
    }
  };

  const buildRegeneratedSlide = async (variant: LayoutVariant) => {
    if (slideIndex === null || !presentationData) {
      throw new Error("Missing slide information");
    }

    // Use the current slide from Redux (not the stale slideId prop)
    const currentSlide = presentationData.slides[slideIndex];
    const currentSlideId = currentSlide.id;

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

    // Use the current slide ID from Redux, not the stale prop
    return await PresentationGenerationApi.editSlide(currentSlideId, prompt);
  };

  // Helper function to clean HTML before sending to AI
  const cleanHTMLForAI = (html: string): string => {
    // Create a temporary div to parse HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Remove selection outlines and highlights
    const removeClasses = ['outline-yellow-500', 'ring-2', 'ring-yellow-400', 'ring-offset-2'];
    temp.querySelectorAll('*').forEach(el => {
      removeClasses.forEach(cls => el.classList.remove(cls));

      // Remove data-* attributes (except essential ones)
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('data-') &&
            !['data-block-type', 'data-slide-content'].includes(attr.name)) {
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

  const handleGenerateLayoutVariants = useCallback(async () => {
    if (!selectedBlock?.element) {
      toast.error("No block selected");
      return;
    }

    // Store the original slide content before generating variants
    if (slideIndex !== null && presentationData?.slides) {
      const currentSlide = presentationData.slides[slideIndex];
      setOriginalLayoutSlideContent(currentSlide);
      console.log('[SmartSuggestions] Stored original layout slide content');
    }

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

      const response = await PresentationGenerationApi.generateLayoutVariants(
        blockHTML,
        fullSlideHTML,
        blockType,
        availableWidth,
        availableHeight,
        parentContainerInfo,
        3
      );

      if (response && response.variants) {
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
    } catch (error: any) {
      console.error("Error generating layout variants:", error);
      toast.error("Failed to generate layout variants", {
        description: error.message || "Please try again.",
      });
    } finally {
      setIsGeneratingLayouts(false);
    }
  }, [selectedBlock?.element, selectedBlock?.type, slideId]);

  const applyLayoutVariant = async (variant: LayoutVariant, variantIndex: number) => {
    if (slideIndex === null || !presentationData) {
      toast.error("Could not identify the slide. Please try again.");
      return;
    }

    // IMPORTANT: Use the current slide ID from Redux, not the prop
    // The prop becomes stale after the first variant is applied (backend assigns new UUID)
    const currentSlide = presentationData.slides[slideIndex];
    const currentSlideId = currentSlide.id;

    // Set applying state to disable all actions
    setApplyingId(variant.id);

    try {
      let slideToApply = regeneratedSlides[variantIndex];

      // If not cached, generate it now
      if (!slideToApply) {
        toast.info("Generating layout...");

        slideToApply = await buildRegeneratedSlide(variant);

        // Cache it for future use
        const updatedCache = [...regeneratedSlides];
        updatedCache[variantIndex] = slideToApply;
        setRegeneratedSlides(updatedCache);
      }

      // Apply the slide (update JSON content)
      dispatch(updateSlide({ index: slideIndex, slide: slideToApply }));

      // Wait for React to re-render the slide with new content
      await new Promise(resolve => setTimeout(resolve, 300));

      // Automatically capture and save as HTML variant
      try {
        // Find the slide container using the updated slide ID
        const slideContainer = document.querySelector(`[data-slide-id="${slideToApply.id}"]`);

        if (slideContainer) {
          // Get only the slide content, not the control buttons
          const slideContentElement = slideContainer.querySelector('[data-slide-content="true"]');

          if (slideContentElement) {
            const html_content = slideContentElement.innerHTML;

            // DEBUG: Log the actual captured HTML
            console.log("========================================");
            console.log("CAPTURED HTML SAMPLE (first 2000 chars):");
            console.log(html_content.substring(0, 2000));
            console.log("========================================");
            console.log("FULL HTML LENGTH:", html_content.length, "characters");
            console.log("========================================");

            // Save the rendered HTML as variant
            const htmlSlide = await PresentationGenerationApi.saveHtmlVariant(
              slideToApply.id,
              html_content
            );

            // Update Redux with HTML-enabled slide
            // This gives the slide a new UUID, but we'll use Redux to track it
            dispatch(updateSlide({ index: slideIndex, slide: htmlSlide }));

            console.log("Layout variant automatically saved as HTML (content only)");
            console.log("New slide ID after save:", htmlSlide.id);
          } else {
            console.warn("Could not find slide content element");
          }
        } else {
          console.warn("Could not find slide container to capture HTML");
        }
      } catch (htmlError) {
        console.error("Error saving HTML variant:", htmlError);
        // Don't fail the whole operation if HTML save fails
        // The JSON variant is still applied successfully
      }

      setCurrentlyAppliedIndex(variantIndex);
      setAppliedLayouts(prev => new Set(prev).add(variant.id));

      toast.success(`Layout "${variant.title}" applied as HTML variant!`);
    } catch (error) {
      toast.error("Failed to apply layout");
      console.error("Error applying layout:", error);
    } finally {
      // Clear applying state to re-enable actions
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
    if (!originalLayoutSlideContent || slideIndex === null) {
      toast.error("No original layout to restore");
      return;
    }

    setApplyingId("restoring");

    try {
      // Restore the original slide content
      dispatch(updateSlide({ index: slideIndex, slide: originalLayoutSlideContent }));

      // Wait for React to re-render
      await new Promise(resolve => setTimeout(resolve, 200));

      // If the original had html_content, we need to clear it to revert to template rendering
      // Call the API to clear html_content (pass empty string)
      if (originalLayoutSlideContent.html_content) {
        const clearedSlide = await PresentationGenerationApi.saveHtmlVariant(
          originalLayoutSlideContent.id,
          '' // Empty string clears html_content and reverts to template
        );

        // Update Redux with the cleared slide
        dispatch(updateSlide({ index: slideIndex, slide: clearedSlide }));
      }

      // Reset state
      setCurrentlyAppliedIndex(null);
      setAppliedLayouts(new Set());
      setLayoutVariants([]);
      setRegeneratedSlides([]);

      toast.success("Restored original layout");
    } catch (error) {
      console.error("Error restoring original layout:", error);
      toast.error("Failed to restore original layout");
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
          <TabsTrigger value="variants" className="flex-1 gap-2" disabled={!selectedBlock?.element || applyingId !== null}>
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
                      onClick={handleGenerateVariants}
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
                          if (slideIndex !== null && originalSlideContent) {
                            dispatch(updateSlide({ index: slideIndex, slide: originalSlideContent }));
                            setCurrentlyAppliedTextIndex(null);
                            setAppliedVariants(new Set());
                            toast.success("Restored original content");
                          }
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
              {/* Generate Layout Variants Button */}
              {layoutVariants.length === 0 && !isGeneratingLayouts && (
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
