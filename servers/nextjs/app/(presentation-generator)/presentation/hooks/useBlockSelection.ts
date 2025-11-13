import { useState, useEffect, useCallback, useRef } from 'react';

export interface BlockSelection {
  element: HTMLElement | null;
  type: string | null; // 'heading', 'paragraph', 'list', 'blockquote', etc.
  content: string;
  slideId: string | null;
  slideIndex: number | null;
}

export function useBlockSelection() {
  const [selectedBlock, setSelectedBlock] = useState<BlockSelection>({
    element: null,
    type: null,
    content: '',
    slideId: null,
    slideIndex: null,
  });
  const [hoveredBlock, setHoveredBlock] = useState<HTMLElement | null>(null);
  const [isSelectionModeActive, setIsSelectionModeActive] = useState(false);
  const cleanupFunctionsRef = useRef<Array<() => void>>([]);

  // Check if element should be skipped
  const shouldSkipElement = (element: HTMLElement): boolean => {
    // Skip if inside TiptapText editor
    if (element.closest('.tiptap-text-editor')) return true;

    // Skip if inside Tippy tooltip (BubbleMenu for TiptapText)
    if (element.closest('.tippy-box') || element.closest('.tippy-content')) return true;

    // Skip if inside ignored element tree (tables, SVGs, charts)
    const ignoredSelectors = [
      'table',
      'svg',
      '[data-type="chart"]',
      '[data-type="diagram"]',
      '[data-type="table"]',
      'form',
      'button',
      'input',
      'textarea',
      'select',
    ];

    for (const selector of ignoredSelectors) {
      if (element.closest(selector)) return true;
    }

    return false;
  };

  // Get block type from element
  const getBlockType = (element: HTMLElement): string => {
    const tag = element.tagName.toLowerCase();

    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) return 'heading';
    if (tag === 'p') return 'paragraph';
    if (['ul', 'ol'].includes(tag)) return 'list';
    if (tag === 'blockquote') return 'blockquote';
    if (tag === 'div') return 'section';

    return 'block';
  };

  // Extract slide information from element
  const getSlideInfo = (element: HTMLElement) => {
    const slideContainer = element.closest('[id^="slide-"]');
    if (!slideContainer) return { slideId: null, slideIndex: null };

    const slideId = slideContainer.querySelector('[data-slide-id]')?.getAttribute('data-slide-id') || null;
    const slideIndexMatch = slideContainer.id.match(/slide-(\d+)/);
    const slideIndex = slideIndexMatch ? parseInt(slideIndexMatch[1]) : null;

    return { slideId, slideIndex };
  };

  // Handle block click
  const handleBlockClick = useCallback((e: MouseEvent) => {
    const element = e.currentTarget as HTMLElement;
    const clickTarget = e.target as HTMLElement;

    // IMPORTANT: Only select blocks when Ctrl/Cmd is pressed
    // This prevents conflicts with TiptapText editing
    if (!e.ctrlKey && !e.metaKey) {
      return; // Let TiptapText handle normal clicks
    }

    // Only skip if the SELECTABLE ELEMENT itself is a TiptapText editor
    // This allows parent containers to be selected even if they contain TiptapText
    if (element.classList.contains('tiptap-text-editor') ||
        element.classList.contains('ProseMirror')) {
      return;
    }

    // Also skip if clicking directly inside the ProseMirror editor content
    // This allows users to edit text when clicking directly on it
    if (clickTarget.classList.contains('ProseMirror') ||
        clickTarget.closest('.ProseMirror') === clickTarget.parentElement) {
      return;
    }

    // Only stop propagation, don't prevent default (which blocks text selection)
    e.stopPropagation();

    const { slideId, slideIndex } = getSlideInfo(element);

    setSelectedBlock({
      element,
      type: getBlockType(element),
      content: element.textContent || '',
      slideId,
      slideIndex,
    });
  }, []);

  // Handle block hover
  const handleBlockHover = useCallback((e: MouseEvent) => {
    const element = e.currentTarget as HTMLElement;
    setHoveredBlock(element);
    element.classList.add('block-hovered');
  }, []);

  // Handle block leave
  const handleBlockLeave = useCallback((e: MouseEvent) => {
    const element = e.currentTarget as HTMLElement;
    setHoveredBlock(null);
    element.classList.remove('block-hovered');
  }, []);

  // Track Ctrl/Cmd key for selection mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl (Windows/Linux) or Cmd (Mac)
      if (e.ctrlKey || e.metaKey) {
        setIsSelectionModeActive(true);
        document.body.classList.add('block-selection-mode');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // When Ctrl or Cmd is released
      if (!e.ctrlKey && !e.metaKey) {
        setIsSelectionModeActive(false);
        document.body.classList.remove('block-selection-mode');
      }
    };

    // Also handle window blur (user switches away)
    const handleBlur = () => {
      setIsSelectionModeActive(false);
      document.body.classList.remove('block-selection-mode');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      document.body.classList.remove('block-selection-mode');
    };
  }, []);

  // Initialize block selection system
  useEffect(() => {
    const initializeBlocks = () => {
      // Clean up previous listeners
      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
      cleanupFunctionsRef.current = [];

      // Find all potential editable blocks
      const selectors = [
        '[data-slide-id] h1',
        '[data-slide-id] h2',
        '[data-slide-id] h3',
        '[data-slide-id] h4',
        '[data-slide-id] h5',
        '[data-slide-id] h6',
        '[data-slide-id] p',
        '[data-slide-id] ul',
        '[data-slide-id] ol',
        '[data-slide-id] blockquote',
        '[data-slide-id] div[class*="content"]',
        '[data-slide-id] div[class*="description"]',
        '[data-slide-id] div[class*="title"]',
      ];

      const blocks = document.querySelectorAll(selectors.join(', '));

      blocks.forEach((block) => {
        const element = block as HTMLElement;

        // Skip if should be ignored
        if (shouldSkipElement(element)) return;

        // Skip if already processed
        if (element.hasAttribute('data-block-selectable')) return;

        // Skip if this IS a TiptapText editor itself
        // But allow parent containers that CONTAIN TiptapText to be selectable
        if (element.closest('.tiptap-text-editor')) {
          return;
        }

        // Mark as processed
        element.setAttribute('data-block-selectable', 'true');
        element.setAttribute('data-block-type', getBlockType(element));

        // Add hoverable class for CSS targeting
        element.classList.add('block-hoverable');

        // Add event listeners
        element.addEventListener('click', handleBlockClick as EventListener);
        element.addEventListener('mouseenter', handleBlockHover as EventListener);
        element.addEventListener('mouseleave', handleBlockLeave as EventListener);

        // Store cleanup function
        const cleanup = () => {
          element.removeEventListener('click', handleBlockClick as EventListener);
          element.removeEventListener('mouseenter', handleBlockHover as EventListener);
          element.removeEventListener('mouseleave', handleBlockLeave as EventListener);
          element.classList.remove('block-hoverable', 'block-hovered', 'block-selected');
          element.removeAttribute('data-block-selectable');
          element.removeAttribute('data-block-type');
        };

        cleanupFunctionsRef.current.push(cleanup);
      });
    };

    // Initialize after a short delay to ensure DOM is ready
    const timeoutId = setTimeout(initializeBlocks, 500);

    // Re-initialize when slides change
    const observer = new MutationObserver(() => {
      clearTimeout(timeoutId);
      setTimeout(initializeBlocks, 500);
    });

    const slidesWrapper = document.getElementById('presentation-slides-wrapper');
    if (slidesWrapper) {
      observer.observe(slidesWrapper, {
        childList: true,
        subtree: true,
      });
    }

    // Cleanup
    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
      cleanupFunctionsRef.current = [];
    };
  }, [handleBlockClick, handleBlockHover, handleBlockLeave]);

  // Update selected class on element
  useEffect(() => {
    // Remove previous selection class
    const previousSelected = document.querySelector('.block-selected');
    if (previousSelected) {
      previousSelected.classList.remove('block-selected');
    }

    // Add selection class to current element
    if (selectedBlock.element) {
      selectedBlock.element.classList.add('block-selected');
    }
  }, [selectedBlock.element]);

  const clearSelection = useCallback(() => {
    setSelectedBlock({
      element: null,
      type: null,
      content: '',
      slideId: null,
      slideIndex: null,
    });
  }, []);

  return {
    selectedBlock,
    hoveredBlock,
    hasBlockSelection: selectedBlock.element !== null,
    clearSelection,
  };
}
