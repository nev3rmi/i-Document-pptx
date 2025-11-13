"use client";
import React, { useMemo } from "react";
import { useDispatch } from "react-redux";
import { useLayout } from "../context/LayoutContext";
import EditableLayoutWrapper from "../components/EditableLayoutWrapper";
import SlideErrorBoundary from "../components/SlideErrorBoundary";
import TiptapTextReplacer from "../components/TiptapTextReplacer";
import { updateSlideContent } from "../../../store/slices/presentationGeneration";
import { Loader2 } from "lucide-react";

export const useTemplateLayouts = () => {
  const dispatch = useDispatch();
  const { getLayoutById, getLayout, loading } =
    useLayout();

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
      // IMPORTANT: If slide has html_content (from layout variants), render from that
      // instead of the template-based JSON rendering. This ensures layout changes persist.
      // Note: TiptapText will NOT work on html_content slides (known limitation)
      if (slide.html_content && slide.html_content.trim()) {
        if (isEditMode) {
          return (
            <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
              <div className="w-full aspect-video relative">
                <div
                  className="w-full h-full"
                  dangerouslySetInnerHTML={{ __html: slide.html_content }}
                />
                <div className="absolute top-2 right-2 bg-yellow-100 border border-yellow-400 text-yellow-800 px-3 py-1 rounded text-xs">
                  ⚠️ Modified layout - text editing disabled
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
