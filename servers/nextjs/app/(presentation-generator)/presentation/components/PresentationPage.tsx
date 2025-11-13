"use client";
import React, {  useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { Skeleton } from "@/components/ui/skeleton";
import PresentationMode from "../../components/PresentationMode";
import SidePanel from "./SidePanel";
import SlideContent from "./SlideContent";
import Header from "./Header";
import SmartSuggestionsPanel from "./SmartSuggestionsPanel";
import { Button } from "@/components/ui/button";
import { usePathname } from "next/navigation";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { AlertCircle, Loader2, Lightbulb } from "lucide-react";
import Help from "./Help";
import {
  usePresentationStreaming,
  usePresentationData,
  usePresentationNavigation,
  useAutoSave,
  useTextSelection,
} from "../hooks";
import { useBlockSelection } from "../hooks/useBlockSelection";
import { PresentationPageProps } from "../types";
import LoadingState from "./LoadingState";
import { useLayout } from "../../context/LayoutContext";
import { useFontLoader } from "../../hooks/useFontLoader";
import { usePresentationUndoRedo } from "../hooks/PresentationUndoRedo";
const PresentationPage: React.FC<PresentationPageProps> = ({
  presentation_id,
}) => {
  const pathname = usePathname();
  // State management
  const [loading, setLoading] = useState(true);
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [showSuggestionsPanel, setShowSuggestionsPanel] = useState(false);
  const {getCustomTemplateFonts} = useLayout();

  // Text selection hook
  const { selection, hasSelection, clearSelection } = useTextSelection();

  // Block selection hook
  const { selectedBlock, hasBlockSelection, clearSelection: clearBlockSelection } = useBlockSelection();

  // Track selection mode (Ctrl/Cmd pressed)
  const [isSelectionModeActive, setIsSelectionModeActive] = useState(false);

  // Auto-open suggestions panel ONLY when block/structure is selected
  // Text selections inside TiptapText editors use their own BubbleMenu for formatting
  useEffect(() => {
    if (hasBlockSelection) {
      setShowSuggestionsPanel(true);
    }
  }, [hasBlockSelection]);

  // Track Ctrl/Cmd key for visual indicator
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        setIsSelectionModeActive(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setIsSelectionModeActive(false);
      }
    };

    const handleBlur = () => {
      setIsSelectionModeActive(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Click outside to close Smart Suggestions panel
  useEffect(() => {
    if (!showSuggestionsPanel) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Don't close if clicking inside the panel
      if (target.closest('.smart-suggestions-panel')) return;

      // Don't close if clicking on a block with Ctrl/Cmd pressed (selecting)
      if ((e.ctrlKey || e.metaKey) && target.closest('[data-block-selectable]')) return;

      // Don't close if clicking the toggle button
      if (target.closest('[aria-label="Smart Suggestions"]')) return;

      // Close the panel
      setShowSuggestionsPanel(false);
      clearSelection();
      clearBlockSelection();
    };

    // Add delay to avoid closing immediately after opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSuggestionsPanel, clearSelection, clearBlockSelection]);

  // Apply/remove selection rectangle overlay
  useEffect(() => {
    // Clean up previous overlay
    const previousOverlay = document.getElementById('text-selection-overlay');
    if (previousOverlay) {
      previousOverlay.remove();
    }

    // Create new overlay if there's a selection and panel is open
    if (hasSelection && selection.range && showSuggestionsPanel) {
      try {
        // Get the bounding rectangle of the selected range
        const rect = selection.range.getBoundingClientRect();

        if (rect.width > 0 && rect.height > 0) {
          // Find the closest slide container
          const slideContainer = selection.containerElement?.closest('.main-slide') as HTMLElement;

          if (slideContainer) {
            // Get container's bounding rectangle
            const containerRect = slideContainer.getBoundingClientRect();

            // Create overlay element
            const overlay = document.createElement('div');
            overlay.id = 'text-selection-overlay';
            overlay.className = 'text-selection-overlay';

            // Position relative to slide container
            overlay.style.position = 'absolute';
            overlay.style.left = `${rect.left - containerRect.left + slideContainer.scrollLeft}px`;
            overlay.style.top = `${rect.top - containerRect.top + slideContainer.scrollTop}px`;
            overlay.style.width = `${rect.width}px`;
            overlay.style.height = `${rect.height}px`;

            // Make slideContainer position relative if it isn't already
            if (window.getComputedStyle(slideContainer).position === 'static') {
              slideContainer.style.position = 'relative';
            }

            // Append to slide container (not body) so it scrolls with content
            slideContainer.appendChild(overlay);
          }
        }
      } catch (error) {
        console.error('Error creating selection overlay:', error);
      }
    }

    // Cleanup on unmount
    return () => {
      const overlay = document.getElementById('text-selection-overlay');
      if (overlay) {
        overlay.remove();
      }
    };
  }, [hasSelection, selection.range, selection.containerElement, showSuggestionsPanel]);
 
  const { presentationData, isStreaming } = useSelector(
    (state: RootState) => state.presentationGeneration
  );

  // Auto-save functionality
  const { isSaving } = useAutoSave({
    debounceMs: 2000,
    enabled: !!presentationData && !isStreaming,
  });

  // Custom hooks
  const { fetchUserSlides } = usePresentationData(
    presentation_id,
    setLoading,
    setError
  );

  const {
    isPresentMode,
    stream,
    handleSlideClick,
    toggleFullscreen,
    handlePresentExit,
    handleSlideChange,
  } = usePresentationNavigation(
    presentation_id,
    selectedSlide,
    setSelectedSlide,
    setIsFullscreen
  );

  // Initialize streaming
  usePresentationStreaming(
    presentation_id,
    stream,
    setLoading,
    setError,
    fetchUserSlides
  );

  usePresentationUndoRedo();

  const onSlideChange = (newSlide: number) => {
    handleSlideChange(newSlide, presentationData);
  };


  useEffect(() => {
    if(!loading && !isStreaming && presentationData?.slides && presentationData?.slides.length > 0){  
      const presentation_id = presentationData?.slides[0].layout.split(":")[0].split("custom-")[1];
    const fonts = getCustomTemplateFonts(presentation_id);
  
    useFontLoader(fonts || []);
  }
  }, [presentationData,loading,isStreaming]);
  // Presentation Mode View
  if (isPresentMode) {
    return (
      <PresentationMode
        slides={presentationData?.slides!}
        currentSlide={selectedSlide}
        isFullscreen={isFullscreen}
        onFullscreenToggle={toggleFullscreen}
        onExit={handlePresentExit}
        onSlideChange={onSlideChange}
      />
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
        <div
          className="bg-white border border-red-300 text-red-700 px-6 py-8 rounded-lg shadow-lg flex flex-col items-center"
          role="alert"
        >
          <AlertCircle className="w-16 h-16 mb-4 text-red-500" />
          <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-center mb-4">
            We couldn't load your presentation. Please try again.
          </p>
          <Button onClick={() => { trackEvent(MixpanelEvent.PresentationPage_Refresh_Page_Button_Clicked, { pathname }); window.location.reload(); }}>Refresh Page</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden flex-col">
      <div className="fixed right-6 top-[5.2rem] z-50">
        {isSaving && <Loader2 className="w-6 h-6 animate-spin text-blue-500" />}
      </div>

      <Header presentation_id={presentation_id} currentSlide={selectedSlide} />
      <Help />

      {/* Selection Mode Indicator */}
      {isSelectionModeActive && !showSuggestionsPanel && (
        <div className="fixed left-1/2 transform -translate-x-1/2 top-20 z-50 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-fade-in">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
          <span className="text-sm font-medium">Click a block to select layout</span>
        </div>
      )}

      {/* Smart Suggestions Toggle Button (always visible on desktop) */}
      {!showSuggestionsPanel && (
        <button
          onClick={() => setShowSuggestionsPanel(true)}
          className="fixed right-6 bottom-20 z-50 hidden md:flex h-12 w-12 items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all duration-300 hover:shadow-xl"
          title="Smart Suggestions"
          aria-label="Smart Suggestions"
        >
          <Lightbulb className="w-5 h-5" />
        </button>
      )}

      <div
        style={{
          background: "#c8c7c9",
        }}
        className="flex flex-1 relative pt-6"
      >
        <SidePanel
          selectedSlide={selectedSlide}
          onSlideClick={handleSlideClick}
          loading={loading}
          isMobilePanelOpen={isMobilePanelOpen}
          setIsMobilePanelOpen={setIsMobilePanelOpen}
        />

        <div className={`flex-1 h-[calc(100vh-100px)] overflow-y-auto ${showSuggestionsPanel ? 'mr-[320px]' : ''} transition-all duration-300`}>
          <div
            id="presentation-slides-wrapper"
            className="mx-auto flex flex-col items-center overflow-hidden justify-center p-2 sm:p-6 pt-0"
          >
            {!presentationData ||
            loading ||
            !presentationData?.slides ||
            presentationData?.slides.length === 0 ? (
              <div className="relative w-full h-[calc(100vh-120px)] mx-auto">
                <div className="">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <Skeleton
                      key={index}
                      className="aspect-video bg-gray-400 my-4 w-full mx-auto max-w-[1280px]"
                    />
                  ))}
                </div>
                {stream && <LoadingState />}
              </div>
            ) : (
              <>
                {presentationData &&
                  presentationData.slides &&
                  presentationData.slides.length > 0 &&
                  presentationData.slides.map((slide: any, index: number) => (
                    <SlideContent
                      key={`${slide.type}-${index}-${slide.index}`}
                      slide={slide}
                      index={index}
                      presentationId={presentation_id}
                    />
                  ))}
              </>
            )}
          </div>
        </div>

        {/* Smart Suggestions Panel */}
        {showSuggestionsPanel && (
          <div className="fixed right-0 top-[72px] bottom-0 w-[320px] hidden md:block z-40">
            <SmartSuggestionsPanel
              selectedText={selection.text}
              slideId={selection.slideId || selectedBlock.slideId}
              slideIndex={selection.slideIndex !== null ? selection.slideIndex : selectedBlock.slideIndex}
              selectedBlock={selectedBlock}
              onClose={() => {
                setShowSuggestionsPanel(false);
                clearSelection();
                clearBlockSelection();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default PresentationPage;
