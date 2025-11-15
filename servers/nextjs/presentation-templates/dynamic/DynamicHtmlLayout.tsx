/**
 * DynamicHtmlLayout Component
 *
 * Renders structured HTML data as React components, enabling TiptapTextReplacer
 * to work with custom layouts from variants.
 *
 * Key Insight: By rendering structure as React elements (not dangerouslySetInnerHTML),
 * the TiptapTextReplacer can scan the DOM and replace text nodes with editable components.
 */

import React from 'react';
import * as z from 'zod';
import type { HtmlStructure, Block } from '@/app/(presentation-generator)/utils/htmlParser';
import TiptapText from '@/app/(presentation-generator)/components/TiptapText';

export const layoutId = 'dynamic-html-layout';
export const layoutName = 'Dynamic HTML Layout';
export const layoutDescription = 'Dynamically renders custom HTML structures with editing support';

// Simplified schema for layout system compatibility
// Note: Dynamic layouts are flexible by design and don't need strict validation
// The real structure validation happens in htmlParser.ts
const DynamicHtmlLayoutSchema = z.object({
  _html_structure: z.any().optional().describe('Structured HTML data for dynamic rendering')
});

export const Schema = DynamicHtmlLayoutSchema;
export type DynamicHtmlLayoutData = z.infer<typeof DynamicHtmlLayoutSchema>;

interface DynamicHtmlLayoutProps {
  data?: {
    _html_structure?: HtmlStructure;
    [key: string]: any; // For accessing slideData fields by path
  };
  slideIndex?: number;
  onContentChange?: (content: string, dataPath: string, slideIndex?: number) => void;
}

/**
 * Parse inline styles string into React style object
 */
function parseStyleString(styleString?: string): React.CSSProperties | undefined {
  if (!styleString) return undefined;

  const styles: React.CSSProperties = {};
  styleString.split(';').forEach(rule => {
    const [property, value] = rule.split(':').map(s => s.trim());
    if (property && value) {
      // Convert kebab-case to camelCase
      const camelProperty = property.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      styles[camelProperty as any] = value;
    }
  });

  return Object.keys(styles).length > 0 ? styles : undefined;
}

/**
 * Get value from object by dot-notation path (e.g., "bulletPoints[0].title")
 */
function getValueByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;

  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let value = obj;

  for (const key of keys) {
    if (value === null || value === undefined) return undefined;
    value = value[key];
  }

  return value;
}

/**
 * Render a single block as React element
 */
function renderBlock(
  block: Block,
  slideData?: any,
  slideIndex?: number,
  onContentChange?: (content: string, dataPath: string, slideIndex?: number) => void
): React.ReactNode {
  // Build props
  // Ensure className is a string (handle database serialization issues)
  const className = typeof block.classes === 'string'
    ? block.classes
    : (typeof block.classes === 'object' && block.classes !== null)
      ? Object.values(block.classes).join(' ')
      : undefined;

  const props: any = {
    key: block.id,
    className,
    style: parseStyleString(block.styles),
    ...block.attributes
  };

  // Add data attribute for debugging
  props['data-block-type'] = block.type;
  props['data-block-id'] = block.id;

  // Handle different block types
  switch (block.type) {
    case 'image':
      // Check if this image has data-path attribute for dynamic src
      const dataPath = block.attributes?.['data-path'];
      let imageSrc = block.src;

      // If data-path exists and slideData is available, use live URL from slideData
      if (dataPath && slideData) {
        const liveData = getValueByPath(slideData, dataPath);
        if (liveData) {
          // Check if it's an object with __image_url__ or __icon_url__
          if (typeof liveData === 'object' && liveData !== null) {
            imageSrc = liveData.__image_url__ || liveData.__icon_url__ || imageSrc;
          } else if (typeof liveData === 'string') {
            imageSrc = liveData;
          }
        }
      }

      return React.createElement('img', {
        ...props,
        src: imageSrc,
        alt: block.alt || ''
        // Removed 'data-editable-processed' to allow EditableLayoutWrapper to detect and process images
      });

    case 'icon':
      // Render SPAN icon element with live icon URL from slideData
      const iconDataPath = block.attributes?.['data-path'];
      let iconUrl = '';

      // If data-path exists and slideData is available, use live icon URL
      if (iconDataPath && slideData) {
        const liveIconData = getValueByPath(slideData, iconDataPath);
        if (liveIconData && typeof liveIconData === 'object' && liveIconData.__icon_url__) {
          iconUrl = liveIconData.__icon_url__;
        }
      }

      // If we have a live URL, render as IMG instead of inline SVG
      // This ensures icon changes persist after reload
      if (iconUrl) {
        return React.createElement(
          block.tag,
          props,
          React.createElement('img', {
            src: iconUrl,
            alt: block.attributes?.['aria-label'] || 'icon',
            className: 'w-6 h-6',
            style: { display: 'inline-block', verticalAlign: 'middle' }
          })
        );
      }

      // Fallback: Render the SPAN element with inline SVG from HTML
      return React.createElement(
        block.tag,
        props,
        block.children?.map(child => renderBlock(child, slideData, slideIndex, onContentChange))
      );

    case 'text':
      // Check if this element has data-textpath attribute
      const dataTextPath = block.attributes?.['data-textpath'];

      if (dataTextPath && slideData && onContentChange) {
        // Render TiptapText component directly for editable text
        const content = getValueByPath(slideData, dataTextPath) || block.content || '';

        // Create a wrapper element with div to avoid nested <p> tags
        // (TiptapText/ProseMirror creates its own <p> tag internally)
        return React.createElement(
          'div',
          {
            key: block.id,
            className,
            style: parseStyleString(block.styles),
            'data-block-type': block.type,
            'data-block-id': block.id,
            'data-textpath': dataTextPath
          },
          React.createElement(TiptapText, {
            key: `tiptap-${block.id}`,
            content: content,
            className: '', // Styling is on wrapper
            onContentChange: (newContent: string) => {
              onContentChange(newContent, dataTextPath, slideIndex);
            }
          })
        );
      }

      // No data-textpath: render plain text (for React template slides)
      return React.createElement(
        block.tag,
        props,
        block.content
      );

    case 'divider':
      // Decorative elements (no text, no children)
      return React.createElement(block.tag, props);

    case 'container':
      // Render container with children
      return React.createElement(
        block.tag,
        props,
        block.children?.map(child => renderBlock(child, slideData, slideIndex, onContentChange))
      );

    case 'component':
      // Special components (charts, etc.) - render as container for now
      return React.createElement(
        block.tag,
        props,
        block.children?.map(child => renderBlock(child, slideData, slideIndex, onContentChange))
      );

    default:
      console.warn(`Unknown block type: ${block.type}`);
      return null;
  }
}

/**
 * Recursively convert objects with numeric keys to arrays
 * Fixes database serialization issue where arrays become objects
 */
function fixArraySerialization(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // If it's an array, recursively fix its elements
  if (Array.isArray(obj)) {
    return obj.map(fixArraySerialization);
  }

  // If it's an object, check if it should be an array
  if (typeof obj === 'object') {
    const keys = Object.keys(obj);

    // Check if all keys are numeric and sequential (0, 1, 2, ...)
    const isNumericArray = keys.length > 0 && keys.every((key, index) => key === String(index));

    if (isNumericArray) {
      // Convert to array and recursively fix
      return Object.values(obj).map(fixArraySerialization);
    }

    // Otherwise, recursively fix the object's properties
    const fixed: any = {};
    for (const key in obj) {
      fixed[key] = fixArraySerialization(obj[key]);
    }
    return fixed;
  }

  // Primitive value, return as-is
  return obj;
}

/**
 * DynamicHtmlLayout Component
 *
 * Renders structured HTML from variants while preserving React editing functionality
 */
const DynamicHtmlLayout: React.FC<DynamicHtmlLayoutProps> = ({ data, slideIndex, onContentChange }) => {
  let structure = data?._html_structure;

  // Fix array serialization issues from database
  if (structure) {
    structure = fixArraySerialization(structure);
  }

  if (!structure || !structure.blocks || !Array.isArray(structure.blocks)) {
    console.error('[DynamicHtmlLayout] Invalid structure:', structure);
    return (
      <div className="flex items-center justify-center w-full aspect-video bg-gray-100">
        <p className="text-gray-600">Invalid HTML structure data</p>
      </div>
    );
  }

  return (
    <>
      <div className="dynamic-html-layout w-full aspect-video" data-slide-content="true">
        {structure.blocks.map(block => renderBlock(block, data, slideIndex, onContentChange))}
      </div>
    </>
  );
};

// Wrap with React.memo to prevent unnecessary re-renders
// Only re-render if data actually changes OR if editing props change
export default React.memo(DynamicHtmlLayout, (prevProps, nextProps) => {
  // Deep comparison of data structure AND editing-related props
  return JSON.stringify(prevProps.data) === JSON.stringify(nextProps.data) &&
         prevProps.slideIndex === nextProps.slideIndex &&
         !!prevProps.onContentChange === !!nextProps.onContentChange; // Check if editing capability changed
});
