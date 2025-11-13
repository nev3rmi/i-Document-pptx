import { useState, useEffect, useCallback } from 'react';

export interface TextSelection {
  text: string;
  slideId: string | null;
  slideIndex: number | null;
  range: Range | null;
  containerElement: HTMLElement | null;
  elementNode: HTMLElement | null;
  blockType: string | null;
}

export function useTextSelection() {
  const [selection, setSelection] = useState<TextSelection>({
    text: '',
    slideId: null,
    slideIndex: null,
    range: null,
    containerElement: null,
    elementNode: null,
    blockType: null,
  });

  const handleSelectionChange = useCallback(() => {
    const windowSelection = window.getSelection();
    const selectedText = windowSelection?.toString().trim() || '';

    if (selectedText && windowSelection && windowSelection.rangeCount > 0) {
      // Get the Range object for precise highlighting
      const range = windowSelection.getRangeAt(0);

      // Try to find the slide element that contains the selection
      const anchorNode = windowSelection?.anchorNode;
      if (anchorNode) {
        // Skip if selection is inside a TiptapText editor (which has its own BubbleMenu)
        let node: Node | null = anchorNode;
        while (node && node !== document.body) {
          if (node instanceof HTMLElement && node.classList.contains('tiptap-text-editor')) {
            // Clear selection state when inside Tiptap editor
            setSelection({
              text: '',
              slideId: null,
              slideIndex: null,
              range: null,
              containerElement: null,
              elementNode: null,
              blockType: null,
            });
            return;
          }
          node = node.parentNode;
        }
        // Traverse up the DOM to find the slide container
        let element = anchorNode as Node;
        let containerElement: HTMLElement | null = null;

        while (element && element.parentElement) {
          const parent = element.parentElement;

          // Store the container element (the element containing the selected text)
          if (!containerElement && parent instanceof HTMLElement) {
            containerElement = parent;
          }

          // Check if this is a slide element (has id like "slide-0", "slide-1", etc.)
          if (parent.id && parent.id.startsWith('slide-')) {
            const slideIndex = parseInt(parent.id.replace('slide-', ''));

            // Get the slide data from the parent element's data attributes
            const slideElement = parent.querySelector('[data-slide-id]');
            const slideId = slideElement?.getAttribute('data-slide-id');

            // Find the block element containing the selection
            let currentNode: Node | null = anchorNode;
            let blockElement: HTMLElement | null = null;
            while (currentNode && currentNode !== parent) {
              if (currentNode instanceof HTMLElement) {
                const tag = currentNode.tagName.toLowerCase();
                if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'blockquote', 'div'].includes(tag)) {
                  blockElement = currentNode;
                  break;
                }
              }
              currentNode = currentNode.parentNode;
            }

            const blockType = blockElement ? blockElement.tagName.toLowerCase() : null;

            setSelection({
              text: selectedText,
              slideId: slideId || null,
              slideIndex: isNaN(slideIndex) ? null : slideIndex,
              range: range.cloneRange(),
              containerElement,
              elementNode: blockElement,
              blockType,
            });
            return;
          }
          element = parent;
        }
      }

      // If we couldn't find a slide container, just store the text with range
      setSelection({
        text: selectedText,
        slideId: null,
        slideIndex: null,
        range: range.cloneRange(),
        containerElement: null,
        elementNode: null,
        blockType: null,
      });
    } else {
      // Clear selection when nothing is selected
      setSelection({
        text: '',
        slideId: null,
        slideIndex: null,
        range: null,
        containerElement: null,
        elementNode: null,
        blockType: null,
      });
    }
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    // REMOVED mouseup listener - it was causing React re-renders during button clicks
    // which interfered with Radix UI Popover's state management (Export button issue)
    // selectionchange is sufficient for detecting text selections

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  const clearSelection = useCallback(() => {
    setSelection({
      text: '',
      slideId: null,
      slideIndex: null,
      range: null,
      containerElement: null,
      elementNode: null,
      blockType: null,
    });
    window.getSelection()?.removeAllRanges();
  }, []);

  return {
    selection,
    hasSelection: selection.text.length > 0,
    clearSelection,
  };
}
