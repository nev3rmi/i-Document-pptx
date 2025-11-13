"use client";
import React, { useState, useEffect } from "react";
import { Lightbulb, Sparkles, Palette, Loader2, X, CheckCircle2, Wand2, Bold, Italic, Underline, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PresentationGenerationApi } from "../../services/api/presentation-generation";
import { toast } from "sonner";
import { useDispatch, useSelector } from "react-redux";
import { updateSlide } from "@/store/slices/presentationGeneration";
import { RootState } from "@/store/store";
import { BlockSelection } from "../hooks/useBlockSelection";
import html2canvas from "html2canvas";

interface Suggestion {
  id: string;
  type: 'text' | 'design';
  title: string;
  description: string;
  prompt: string;
}

interface Variant {
  id: string;
  text: string;
}

interface LayoutVariant {
  id: string;
  title: string;
  description: string;
  html: string;
}

interface SmartSuggestionsPanelProps {
  selectedText: string;
  slideId: string | null;
  slideIndex: number | null;
  selectedBlock?: BlockSelection;
  onClose: () => void;
}

const SmartSuggestionsPanel: React.FC<SmartSuggestionsPanelProps> = ({
  selectedText,
  slideId,
  slideIndex,
  selectedBlock,
  onClose,
}) => {
  const dispatch = useDispatch();
  const [activeTab, setActiveTab] = useState<"suggestions" | "variants" | "layout">("suggestions");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<string>>(new Set());
  const [applyingId, setApplyingId] = useState<string | null>(null);

  // Variants state
  const [variants, setVariants] = useState<Variant[]>([]);
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  const [appliedVariants, setAppliedVariants] = useState<Set<string>>(new Set());

  // Layout variants state
  const [layoutVariants, setLayoutVariants] = useState<LayoutVariant[]>([]);
  const [isGeneratingLayouts, setIsGeneratingLayouts] = useState(false);
  const [appliedLayouts, setAppliedLayouts] = useState<Set<string>>(new Set());

  const { presentationData } = useSelector(
    (state: RootState) => state.presentationGeneration
  );

  useEffect(() => {
    if (selectedText) {
      generateSuggestions();
    }
  }, [selectedText]);

  const generateSuggestions = () => {
    setIsGeneratingSuggestions(true);

    // Generate smart suggestions based on selected text
    const textSuggestions: Suggestion[] = [
      {
        id: 'improve-clarity',
        type: 'text',
        title: 'Improve Clarity',
        description: 'Make the text more clear and concise',
        prompt: `Improve the clarity and conciseness of this text: "${selectedText}". Keep the same meaning but make it more professional and easier to understand.`,
      },
      {
        id: 'expand-detail',
        type: 'text',
        title: 'Add More Detail',
        description: 'Expand with additional information',
        prompt: `Expand on this text with more details and examples: "${selectedText}". Add relevant information that would help the audience understand better.`,
      },
      {
        id: 'make-engaging',
        type: 'text',
        title: 'Make More Engaging',
        description: 'Transform into compelling content',
        prompt: `Make this text more engaging and compelling: "${selectedText}". Use storytelling techniques, active voice, and persuasive language.`,
      },
      {
        id: 'bullet-points',
        type: 'text',
        title: 'Convert to Bullets',
        description: 'Transform into bullet points',
        prompt: `Convert this text into clear, concise bullet points: "${selectedText}". Each bullet should be impactful and easy to scan.`,
      },
    ];

    const designSuggestions: Suggestion[] = [
      {
        id: 'emphasize-text',
        type: 'design',
        title: 'Emphasize Text',
        description: 'Make the selected text stand out',
        prompt: `Apply bold formatting and increase font size for this text: "${selectedText}". Make it visually prominent.`,
      },
      {
        id: 'add-visual',
        type: 'design',
        title: 'Add Visual Element',
        description: 'Suggest relevant icons or images',
        prompt: `Add a relevant icon or visual element next to this text: "${selectedText}". Choose something that reinforces the message.`,
      },
      {
        id: 'improve-layout',
        type: 'design',
        title: 'Improve Layout',
        description: 'Optimize spacing and arrangement',
        prompt: `Improve the layout and visual hierarchy around this text: "${selectedText}". Optimize spacing, alignment, and visual flow.`,
      },
      {
        id: 'color-scheme',
        type: 'design',
        title: 'Enhance Colors',
        description: 'Suggest better color combinations',
        prompt: `Enhance the color scheme around this text: "${selectedText}". Suggest colors that improve readability and visual appeal.`,
      },
    ];

    setSuggestions([...textSuggestions, ...designSuggestions]);
    setIsGeneratingSuggestions(false);
  };

  const handleGenerateVariants = async () => {
    const textToVariate = selectedText || selectedBlock?.content || '';

    if (!textToVariate) {
      toast.error("No content selected");
      return;
    }

    setIsGeneratingVariants(true);
    setVariants([]);

    try {
      const response = await PresentationGenerationApi.generateTextVariants(textToVariate, 3);

      if (response && response.variants) {
        const variantsWithIds = response.variants.map((text: string, index: number) => ({
          id: `variant-${index}`,
          text,
        }));
        setVariants(variantsWithIds);
        toast.success("Variants generated successfully!");
      }
    } catch (error: any) {
      console.error("Error generating variants:", error);
      toast.error("Failed to generate variants", {
        description: error.message || "Please try again.",
      });
    } finally {
      setIsGeneratingVariants(false);
    }
  };

  const applySuggestion = async (suggestion: Suggestion) => {
    if (!slideId || slideIndex === null) {
      toast.error("Could not identify the slide. Please try again.");
      return;
    }

    setApplyingId(suggestion.id);

    try {
      const response = await PresentationGenerationApi.editSlide(
        slideId,
        suggestion.prompt
      );

      if (response) {
        dispatch(updateSlide({ index: slideIndex, slide: response }));
        setAppliedSuggestions(prev => new Set(prev).add(suggestion.id));
        toast.success("Suggestion applied successfully!");
      }
    } catch (error: any) {
      console.error("Error applying suggestion:", error);
      toast.error("Failed to apply suggestion", {
        description: error.message || "Please try again.",
      });
    } finally {
      setApplyingId(null);
    }
  };

  const applyVariant = async (variant: Variant) => {
    if (!slideId || slideIndex === null) {
      toast.error("Could not identify the slide. Please try again.");
      return;
    }

    setApplyingId(variant.id);

    try {
      const prompt = `Replace the text "${selectedText}" with this alternative version: "${variant.text}". Keep everything else on the slide unchanged.`;

      const response = await PresentationGenerationApi.editSlide(
        slideId,
        prompt
      );

      if (response) {
        dispatch(updateSlide({ index: slideIndex, slide: response }));
        setAppliedVariants(prev => new Set(prev).add(variant.id));
        toast.success("Variant applied successfully!");
      }
    } catch (error: any) {
      console.error("Error applying variant:", error);
      toast.error("Failed to apply variant", {
        description: error.message || "Please try again.",
      });
    } finally {
      setApplyingId(null);
    }
  };

  const handleGenerateLayoutVariants = async () => {
    if (!selectedBlock?.element) {
      toast.error("No block selected");
      return;
    }

    setIsGeneratingLayouts(true);
    setLayoutVariants([]);

    try {
      const blockElement = selectedBlock.element;
      const blockHTML = blockElement.outerHTML;
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

      // Capture screenshot of the selected block
      let screenshotBase64: string | undefined;
      try {
        const canvas = await html2canvas(blockElement, {
          backgroundColor: '#ffffff',
          scale: 1,
          logging: false,
          useCORS: true,
        });

        // Convert canvas to base64 (remove the "data:image/png;base64," prefix)
        const dataUrl = canvas.toDataURL('image/png');
        screenshotBase64 = dataUrl.split(',')[1];
      } catch (screenshotError) {
        console.warn("Failed to capture screenshot, continuing without it:", screenshotError);
        // Continue without screenshot if it fails
      }

      const response = await PresentationGenerationApi.generateLayoutVariants(
        blockHTML,
        blockType,
        availableWidth,
        availableHeight,
        screenshotBase64,
        parentContainerInfo,
        3
      );

      if (response && response.variants) {
        const variantsWithIds = response.variants.map((variant: any, index: number) => ({
          id: `layout-${index}`,
          title: variant.title,
          description: variant.description,
          html: variant.html,
        }));
        setLayoutVariants(variantsWithIds);
        toast.success("Layout variants generated!");
      }
    } catch (error: any) {
      console.error("Error generating layout variants:", error);
      toast.error("Failed to generate layout variants", {
        description: error.message || "Please try again.",
      });
    } finally {
      setIsGeneratingLayouts(false);
    }
  };

  const applyLayoutVariant = async (variant: LayoutVariant) => {
    if (!slideId || slideIndex === null || !selectedBlock?.element) {
      toast.error("Could not identify the slide or block. Please try again.");
      return;
    }

    setApplyingId(variant.id);

    try {
      // Step 1: Create a temporary container to parse the new HTML
      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = variant.html;
      const newBlockElement = tempContainer.firstElementChild;

      if (!newBlockElement) {
        throw new Error("Invalid HTML in layout variant");
      }

      // Step 2: Find the slide container
      const slideContainer = selectedBlock.element.closest('[data-slide-id]');
      if (!slideContainer) {
        throw new Error("Could not find slide container");
      }

      // Step 3: IMMEDIATELY update the DOM for instant visual feedback
      const oldBlock = selectedBlock.element;
      oldBlock.replaceWith(newBlockElement);

      // Step 4: Get the updated HTML for backend persistence
      const updatedHtml = slideContainer.innerHTML;

      // Step 5: Send to backend (optimistic update - already updated DOM)
      const response = await PresentationGenerationApi.editSlideHtml(
        slideId,
        updatedHtml
      );

      if (response) {
        // Update Redux with the new slide data that includes html_content.
        // This is safe now because renderSlideContent checks for html_content first
        // and renders from that instead of re-rendering from JSON templates.
        dispatch(updateSlide({ index: slideIndex, slide: response }));

        setAppliedLayouts(prev => new Set(prev).add(variant.id));
        toast.success(`Layout "${variant.title}" applied successfully!`);
      }
    } catch (error: any) {
      console.error("Error applying layout variant:", error);
      toast.error("Failed to apply layout", {
        description: error.message || "Please try again.",
      });
      // Note: DOM was already updated optimistically
      // Consider reloading the page if backend fails
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="h-full bg-white border-l border-gray-200 flex flex-col smart-suggestions-panel">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Smart Suggestions</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
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
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "suggestions" | "variants" | "layout")} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full rounded-none border-b flex-shrink-0">
          <TabsTrigger value="suggestions" className="flex-1 gap-2">
            <Sparkles className="w-4 h-4" />
            Suggestions
          </TabsTrigger>
          <TabsTrigger value="variants" className="flex-1 gap-2">
            <Wand2 className="w-4 h-4" />
            Variants
          </TabsTrigger>
          <TabsTrigger value="layout" className="flex-1 gap-2" disabled={!selectedBlock?.element}>
            <Palette className="w-4 h-4" />
            Layout
          </TabsTrigger>
        </TabsList>

        {/* Suggestions Tab */}
        <TabsContent value="suggestions" className="flex-1 overflow-y-auto p-4 mt-0 min-h-0">
          {isGeneratingSuggestions ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
              <p className="text-sm text-gray-600">Generating suggestions...</p>
            </div>
          ) : !selectedText && !selectedBlock?.element ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Lightbulb className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-sm text-gray-600 mb-1">No content selected</p>
              <p className="text-xs text-gray-500">
                Select text or click on a block to see smart suggestions
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Text Suggestions */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <h4 className="text-sm font-semibold text-gray-700">Text Improvements</h4>
                </div>
                <div className="space-y-2">
                  {suggestions
                    .filter((s) => s.type === 'text')
                    .map((suggestion) => (
                      <SuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        isApplying={applyingId === suggestion.id}
                        isApplied={appliedSuggestions.has(suggestion.id)}
                        onApply={() => applySuggestion(suggestion)}
                      />
                    ))}
                </div>
              </div>

              {/* Design Suggestions */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <Palette className="w-4 h-4 text-pink-600" />
                  <h4 className="text-sm font-semibold text-gray-700">Design Enhancements</h4>
                </div>
                <div className="space-y-2">
                  {suggestions
                    .filter((s) => s.type === 'design')
                    .map((suggestion) => (
                      <SuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        isApplying={applyingId === suggestion.id}
                        isApplied={appliedSuggestions.has(suggestion.id)}
                        onApply={() => applySuggestion(suggestion)}
                      />
                    ))}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Variants Tab */}
        <TabsContent value="variants" className="flex-1 overflow-y-auto p-4 mt-0 min-h-0">
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
                      disabled={isGeneratingVariants}
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
                        isApplied={appliedVariants.has(variant.id)}
                        onApply={() => applyVariant(variant)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </TabsContent>

        {/* Layout Tab - Visual Preview of Layout Changes */}
        <TabsContent value="layout" className="flex-1 overflow-y-auto p-4 mt-0 min-h-0">
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
                      disabled={isGeneratingLayouts}
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
                        onApply={() => applyLayoutVariant(variant)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

interface SuggestionCardProps {
  suggestion: Suggestion;
  isApplying: boolean;
  isApplied: boolean;
  onApply: () => void;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({
  suggestion,
  isApplying,
  isApplied,
  onApply,
}) => {
  return (
    <div className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors bg-white">
      <div className="flex items-start justify-between mb-2">
        <h5 className="text-sm font-medium text-gray-900">{suggestion.title}</h5>
        {isApplied && (
          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
        )}
      </div>
      <p className="text-xs text-gray-600 mb-3">{suggestion.description}</p>
      <Button
        size="sm"
        onClick={onApply}
        disabled={isApplying || isApplied}
        className="w-full"
        variant={isApplied ? "outline" : "default"}
      >
        {isApplying ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin mr-2" />
            Applying...
          </>
        ) : isApplied ? (
          "Applied"
        ) : (
          "Apply"
        )}
      </Button>
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
    <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors bg-white">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
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
        disabled={isApplying || isApplied}
        className="w-full"
        variant={isApplied ? "outline" : "default"}
      >
        {isApplying ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin mr-2" />
            Applying...
          </>
        ) : isApplied ? (
          "Applied"
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
  onApply: () => void;
}

const LayoutVariantCard: React.FC<LayoutVariantCardProps> = ({
  variant,
  index,
  isApplying,
  isApplied,
  onApply,
}) => {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden hover:border-purple-300 transition-colors bg-white">
      {/* Layout Title and Status */}
      <div className="p-3 border-b border-gray-200 flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-1 rounded">
            {variant.title}
          </span>
          <p className="text-xs text-gray-600 mt-1">{variant.description}</p>
        </div>
        {isApplied && (
          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
        )}
      </div>

      {/* Visual Preview */}
      <div className="p-2 bg-gray-50">
        <div className="border border-gray-300 rounded overflow-hidden bg-white">
          <div
            className="w-full h-32 overflow-hidden flex items-center justify-center p-2"
            style={{
              transform: 'scale(0.5)',
              transformOrigin: 'top left',
              width: '200%',
              height: '200%'
            }}
          >
            <div
              dangerouslySetInnerHTML={{ __html: variant.html }}
              className="pointer-events-none"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2 text-center">Preview (scaled)</p>
      </div>

      {/* Apply Button */}
      <div className="p-3">
        <Button
          size="sm"
          onClick={onApply}
          disabled={isApplying || isApplied}
          className="w-full"
          variant={isApplied ? "outline" : "default"}
        >
          {isApplying ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin mr-2" />
              Applying...
            </>
          ) : isApplied ? (
            "Applied"
          ) : (
            "Apply Layout"
          )}
        </Button>
      </div>
    </div>
  );
};

export default SmartSuggestionsPanel;
