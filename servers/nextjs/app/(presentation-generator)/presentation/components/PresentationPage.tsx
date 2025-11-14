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
  const [isSelectionModeActive, setIsSelectionModeActive] = useState(false);
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);
  const {getCustomTemplateFonts} = useLayout();

  // Text selection hook
  const { selection, hasSelection, clearSelection } = useTextSelection();

  // Block selection hook
  const { selectedBlock, hasBlockSelection, clearSelection: clearBlockSelection } = useBlockSelection();

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

  // Handle scroll indicator visibility
  useEffect(() => {
    const scrollContainer = document.querySelector('.hide-scrollbar');
    if (!scrollContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      // Show indicator if not at bottom (with 20px threshold)
      setShowScrollIndicator(scrollTop + clientHeight < scrollHeight - 20);
    };

    // Check initially
    handleScroll();

    scrollContainer.addEventListener('scroll', handleScroll);
    // Also check on window resize
    window.addEventListener('resize', handleScroll);

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [presentationData?.slides]);

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
        
        <div className="flex-1 h-[calc(100vh-100px)] overflow-y-auto scroll-smooth snap-y snap-proximity hide-scrollbar relative">
          {/* Scroll indicator gradient - shows when there's more content below */}
          {showScrollIndicator && (
            <div className="scroll-indicator-gradient absolute bottom-0 left-0 right-0 h-20 pointer-events-none z-10" />
          )}

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

        {/* Smart Suggestions Panel - matches SidePanel dimensions */}
        {showSuggestionsPanel && (hasSelection || hasBlockSelection) && (
          <div className="min-w-[300px] max-w-[300px] h-[calc(100vh-120px)] overflow-hidden z-30 relative shadow-xl rounded-[20px]">
            <SmartSuggestionsPanel
              selectedText={selection.text}
              slideId={selection.slideId || selectedBlock.slideId}
              slideIndex={selection.slideIndex ?? selectedBlock.slideIndex}
              selectedBlock={selectedBlock}
              clearBlockSelection={clearBlockSelection}
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
