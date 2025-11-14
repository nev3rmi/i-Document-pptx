"use client";
import React, { useMemo, useRef } from "react";
import { useDispatch } from "react-redux";
import { useLayout } from "../context/LayoutContext";
import EditableLayoutWrapper from "../components/EditableLayoutWrapper";
import SlideErrorBoundary from "../components/SlideErrorBoundary";
import TiptapTextReplacer from "../components/TiptapTextReplacer";
import { updateSlideContent } from "../../../store/slices/presentationGeneration";
import { Loader2 } from "lucide-react";
import DynamicHtmlLayout from "../../../presentation-templates/dynamic/DynamicHtmlLayout";
import { parseHtmlStructure } from "../utils/htmlParser";

export const useTemplateLayouts = () => {
  const dispatch = useDispatch();
  const { getLayoutById, getLayout, loading } =
    useLayout();

  // Cache parsed HTML structures to avoid re-parsing on every render
  const parsedStructureCache = useRef<Map<string, any>>(new Map());

  const getTemplateLayout = useMemo(() => {
    return (layoutId: string, groupName: string) => {
      const layout = getLayoutById(layoutId);
      if (layout) {
        return getLayout(layoutId);
      }
      return null;
    };
  }, [getLayoutById, getLayout]);



  // Render slide content with group validation, automatic Tiptap text editing, and editable images/icons
  const renderSlideContent = useMemo(() => {
    return (slide: any, isEditMode: boolean) => {
      // PRIORITY 1: Check for html_structure (new dynamic template - EDITING WORKS!)
      if (slide.content?._html_structure) {
        console.log('[useTemplateLayouts] Rendering with DynamicHtmlLayout (html_structure)');

        if (isEditMode) {
          return (
            <EditableLayoutWrapper
              slideIndex={slide.index}
              slideData={slide.content}
              properties={slide.properties}
            >
              <TiptapTextReplacer
                key={slide.id}
                slideData={slide.content}
                slideIndex={slide.index}
                onContentChange={(
                  content: string,
                  dataPath: string,
                  slideIndex?: number
                ) => {
                  if (dataPath && slideIndex !== undefined) {
                    dispatch(
                      updateSlideContent({
                        slideIndex: slideIndex,
                        dataPath: dataPath,
                        content: content,
                      })
                    );
                  }
                }}
              >
                <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
                  <DynamicHtmlLayout data={slide.content} />
                  <div className="absolute top-2 right-2 bg-blue-500 text-white px-3 py-1 rounded text-sm font-semibold shadow-lg z-50">
                    🧪 Dynamic Template
                  </div>
                </SlideErrorBoundary>
              </TiptapTextReplacer>
            </EditableLayoutWrapper>
          );
        }
        return (
          <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
            <DynamicHtmlLayout data={slide.content} />
          </SlideErrorBoundary>
        );
      }

      // PRIORITY 2: Legacy html_content - convert to structure on-the-fly
      if (slide.html_content && slide.html_content.trim()) {
        try {
          // Check cache first to avoid re-parsing
          const cacheKey = `${slide.id}-${slide.html_content.length}`;
          let structure = parsedStructureCache.current.get(cacheKey);

          if (!structure) {
            // Parse HTML to structure (only if not cached)
            structure = parseHtmlStructure(slide.html_content);
            parsedStructureCache.current.set(cacheKey, structure);
          }

          const dataWithStructure = {
            ...slide.content,
            _html_structure: structure
          };

          if (isEditMode) {
            return (
              <EditableLayoutWrapper
                slideIndex={slide.index}
                slideData={dataWithStructure}
                properties={slide.properties}
              >
                <TiptapTextReplacer
                  key={slide.id}
                  slideData={dataWithStructure}
                  slideIndex={slide.index}
                  onContentChange={(
                    content: string,
                    dataPath: string,
                    slideIndex?: number
                  ) => {
                    if (dataPath && slideIndex !== undefined) {
                      dispatch(
                        updateSlideContent({
                          slideIndex: slideIndex,
                          dataPath: dataPath,
                          content: content,
                        })
                      );
                    }
                  }}
                >
                  <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
                    <DynamicHtmlLayout data={dataWithStructure} />
                    <div className="absolute top-2 right-2 bg-blue-500 text-white px-3 py-1 rounded text-sm font-semibold shadow-lg z-50">
                      🧪 Dynamic Template
                    </div>
                  </SlideErrorBoundary>
                </TiptapTextReplacer>
              </EditableLayoutWrapper>
            );
          }
          return (
            <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
              <DynamicHtmlLayout data={dataWithStructure} />
            </SlideErrorBoundary>
          );
        } catch (error) {
          console.error('[useTemplateLayouts] Error parsing html_content:', error);
          // Fallback to dangerouslySetInnerHTML if parsing fails
          if (isEditMode) {
            return (
              <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
                <div className="w-full aspect-video relative">
                  <div
                    className="w-full h-full"
                    dangerouslySetInnerHTML={{ __html: slide.html_content }}
                  />
                  <div className="absolute top-2 right-2 bg-red-100 border border-red-400 text-red-800 px-3 py-1 rounded text-xs">
                    ⚠️ Parse failed - editing disabled
                  </div>
                </div>
              </SlideErrorBoundary>
            );
          }
          return (
            <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
              <div
                className="w-full aspect-video"
                dangerouslySetInnerHTML={{ __html: slide.html_content }}
              />
            </SlideErrorBoundary>
          );
        }
      }

      const Layout = getTemplateLayout(slide.layout, slide.layout_group);
      if (loading) {
        return (
          <div className="flex flex-col items-center justify-center aspect-video h-full bg-gray-100 rounded-lg">
            <Loader2 className="w-8 h-8 animate-spin text-blue-800" />
          </div>
        );
      }
      if (!Layout) {
        return (
          <div className="flex flex-col items-center justify-center aspect-video h-full bg-gray-100 rounded-lg">
            <p className="text-gray-600 text-center text-base">
              Layout &quot;{slide.layout}&quot; not found in &quot;
              {slide.layout_group}&quot; group
            </p>
          </div>
        );
      }

      if (isEditMode) {
        return (
          <EditableLayoutWrapper
            slideIndex={slide.index}
            slideData={slide.content}
            properties={slide.properties}
          >
            <TiptapTextReplacer
              key={slide.id}
              slideData={slide.content}
              slideIndex={slide.index}
              onContentChange={(
                content: string,
                dataPath: string,
                slideIndex?: number
              ) => {
                if (dataPath && slideIndex !== undefined) {
                  dispatch(
                    updateSlideContent({
                      slideIndex: slideIndex,
                      dataPath: dataPath,
                      content: content,
                    })
                  );
                }
              }}
            >
              <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
                <Layout data={slide.content} />
              </SlideErrorBoundary>
            </TiptapTextReplacer>
          </EditableLayoutWrapper>
        );
      }
      return (
        <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
          <Layout data={slide.content} />
        </SlideErrorBoundary>
      );
    };
  }, [getTemplateLayout, dispatch, loading]);

  return {
    getTemplateLayout,
    renderSlideContent,
    loading,
  };
};
