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
    // REMOVED: Skip if inside TiptapText editor
    // We now allow text elements inside TiptapText - click handler checks for Ctrl/Cmd

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

  // Check if element is valid for selection
  const isSelectableElement = (element: HTMLElement): boolean => {
    const tag = element.tagName;

    // Allow most common elements
    // Text elements
    if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN'].includes(tag)) return true;

    // Container elements
    if (['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'ASIDE'].includes(tag)) return true;

    // List elements
    if (['UL', 'OL', 'LI'].includes(tag)) return true;

    // Other content elements
    if (['BLOCKQUOTE', 'PRE', 'CODE', 'FIGURE', 'FIGCAPTION'].includes(tag)) return true;

    return false;
  };

  // Get block type from element
  const getBlockType = (element: HTMLElement): string => {
    const tag = element.tagName.toLowerCase();
    const classList = element.className;

    // Text elements
    if (tag === 'p') return 'paragraph';
    if (tag.match(/^h[1-6]$/)) return 'heading';
    if (tag === 'span') return 'text';

    // List elements
    if (tag === 'ul' || tag === 'ol') return 'list';
    if (tag === 'li') return 'list-item';

    // Code and preformatted
    if (tag === 'pre') return 'preformatted';
    if (tag === 'code') return 'code';
    if (tag === 'blockquote') return 'blockquote';

    // Figure elements
    if (tag === 'figure') return 'figure';
    if (tag === 'figcaption') return 'figcaption';

    // Structural elements
    if (tag === 'section') return 'section';
    if (tag === 'article') return 'article';
    if (tag === 'main') return 'main';
    if (tag === 'header') return 'header';
    if (tag === 'footer') return 'footer';
    if (tag === 'nav') return 'nav';
    if (tag === 'aside') return 'aside';

    // Div containers - check for specific classes
    if (tag === 'div') {
      if (element.classList.contains('grid')) return 'grid-container';
      if (element.classList.contains('flex-1')) return 'column';
      if (classList.includes('space-y-')) return 'list-container';
      if (element.classList.contains('flex') &&
          element.classList.contains('items-start') &&
          classList.includes('space-x-')) return 'list-item';
      return 'container';
    }

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

    // Check if we're clicking on a text element (p, h1-h6, span with text)
    const isTextElement = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN'].includes(clickTarget.tagName);

    // Only skip if the SELECTABLE ELEMENT itself is a TiptapText editor
    // This allows parent containers to be selected even if they contain TiptapText
    if (element.classList.contains('tiptap-text-editor') ||
        element.classList.contains('ProseMirror')) {
      return;
    }

    // Allow text elements to be selected even inside ProseMirror
    // Only skip if clicking on the ProseMirror container itself, not text inside it
    if (!isTextElement &&
        (clickTarget.classList.contains('ProseMirror') ||
         clickTarget.closest('.ProseMirror') === clickTarget.parentElement)) {
      return;
    }

    // Prevent text selection when selecting structural containers
    e.preventDefault();
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

  // Handle block hover - only show outline when Ctrl/Cmd is pressed
  const handleBlockHover = useCallback((e: MouseEvent) => {
    const element = e.currentTarget as HTMLElement;

    // Only add hover effect if Ctrl/Cmd is pressed
    if (e.ctrlKey || e.metaKey) {
      setHoveredBlock(element);
      element.classList.add('block-hovered');
    }
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
    let debounceTimer: NodeJS.Timeout | null = null;

    const initializeBlocks = () => {
      // Clean up previous listeners
      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
      cleanupFunctionsRef.current = [];

      // Find ALL selectable elements inside slides
      // Universal selection - allow Ctrl+click on any element
      // TEST: DIV is commented out - testing if it's the cause of render bugs
      const selectors = [
        // ===== TEST GROUP 1: DIVS (Selective - only meaningful containers) =====
        // SELECTOR 1a: Main slide content container
        '[data-slide-id] .tiptap-text-replacer',

        // SELECTOR 1b: Direct children of slide container (main layout divs)
        // '[data-slide-id] > div', <<< Bug

        // SELECTOR 1c: Grid containers (layout divs)
        '[data-slide-id] div.grid',

        // SELECTOR 1d: Flex containers with flex-1 (column divs)
        '[data-slide-id] div.flex-1',

        // SELECTOR 1e: List containers (vertical spacing)
        '[data-slide-id] div[class*="space-y-"]',

        // SELECTOR 1f: Horizontal flex containers (list items)
        '[data-slide-id] div.flex.items-start[class*="space-x-"]',

        // NOTE: We don't select ALL divs anymore - too many elements causes performance issues

        // ===== TEST GROUP 2: TEXT ELEMENTS =====
        // SELECTOR 2: Paragraphs
        '[data-slide-id] p',

        // SELECTOR 3: Heading 1
        '[data-slide-id] h1',

        // SELECTOR 4: Heading 2
        '[data-slide-id] h2',

        // SELECTOR 5: Heading 3
        '[data-slide-id] h3',

        // SELECTOR 6: Heading 4
        '[data-slide-id] h4',

        // SELECTOR 7: Heading 5
        '[data-slide-id] h5',

        // SELECTOR 8: Heading 6
        '[data-slide-id] h6',

        // ===== TEST GROUP 3: INLINE ELEMENTS =====
        // SELECTOR 9: All SPANs (inline text)
        '[data-slide-id] span',

        // ===== TEST GROUP 4: STRUCTURAL ELEMENTS =====
        // SELECTOR 10: Section elements
        '[data-slide-id] section',

        // SELECTOR 11: Article elements
        '[data-slide-id] article',

        // SELECTOR 12: Main elements
        '[data-slide-id] main',

        // SELECTOR 13: Header elements
        '[data-slide-id] header',

        // SELECTOR 14: Footer elements
        '[data-slide-id] footer',

        // SELECTOR 15: Nav elements
        '[data-slide-id] nav',

        // SELECTOR 16: Aside elements
        '[data-slide-id] aside',

        // ===== TEST GROUP 5: LIST ELEMENTS =====
        // SELECTOR 17: Unordered lists (ul)
        '[data-slide-id] ul',

        // SELECTOR 18: Ordered lists (ol)
        '[data-slide-id] ol',

        // SELECTOR 19: List items (li)
        '[data-slide-id] li',

        // ===== TEST GROUP 6: OTHER CONTENT ELEMENTS =====
        // SELECTOR 20: Blockquote elements
        '[data-slide-id] blockquote',

        // SELECTOR 21: Preformatted text (pre)
        '[data-slide-id] pre',

        // SELECTOR 22: Code elements
        '[data-slide-id] code',

        // SELECTOR 23: Figure elements
        '[data-slide-id] figure',

        // SELECTOR 24: Figure caption
        '[data-slide-id] figcaption',
      ];

      const blocks = document.querySelectorAll(selectors.join(', '));

      blocks.forEach((block) => {
        const element = block as HTMLElement;

        // Skip if should be ignored (buttons, inputs, etc.)
        if (shouldSkipElement(element)) {
          return;
        }

        // Skip if already processed
        if (element.hasAttribute('data-block-selectable')) {
          return;
        }

        // CHANGED: Allow text elements inside TiptapText to be registered
        // The click handler already checks for Ctrl/Cmd key to prevent conflicts
        // Only skip if this element IS the TiptapText editor container itself
        if (element.classList.contains('tiptap-text-editor') ||
            element.classList.contains('ProseMirror')) {
          return;
        }

        // Only allow selectable elements
        if (!isSelectableElement(element)) {
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

    // Initialize immediately on mount
    initializeBlocks();

    // Re-initialize when slides change (debounced to avoid multiple rapid calls)
    const observer = new MutationObserver((mutations) => {
      // FIX: Ignore mutations from UI components like Popovers, Tooltips, Menus
      // These were causing re-initialization during button clicks (Export button issue)
      const shouldIgnore = mutations.every(mutation => {
        const target = mutation.target as HTMLElement;
        // Ignore if mutation is in popover, tooltip, dropdown, or other UI overlays
        if (target.closest('[data-radix-popper-content-wrapper]')) return true;
        if (target.closest('[role="dialog"]')) return true;
        if (target.closest('[role="menu"]')) return true;
        if (target.closest('.tippy-box')) return true;
        // Only care about mutations inside actual slide content
        return !target.closest('[data-slide-id]');
      });

      if (shouldIgnore) return;

      // Clear previous debounce timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      // Set new debounce timer - wait 200ms after last mutation
      debounceTimer = setTimeout(initializeBlocks, 200);
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
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
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
