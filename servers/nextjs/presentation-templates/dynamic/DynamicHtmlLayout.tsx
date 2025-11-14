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
  };
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
 * Render a single block as React element
 */
function renderBlock(block: Block): React.ReactNode {
  // Build props
  const props: any = {
    key: block.id,
    className: block.classes,
    style: parseStyleString(block.styles),
    ...block.attributes
  };

  // Add data attribute for debugging
  props['data-block-type'] = block.type;
  props['data-block-id'] = block.id;

  // Handle different block types
  switch (block.type) {
    case 'image':
      return React.createElement('img', {
        ...props,
        src: block.src,
        alt: block.alt || ''
        // Removed 'data-editable-processed' to allow EditableLayoutWrapper to detect and process images
      });

    case 'text':
      // Render text content that TiptapTextReplacer will find
      // IMPORTANT: Must be plain text in DOM for TiptapTextReplacer to detect
      return React.createElement(
        block.tag,
        props,
        block.content  // ← Plain text that will be replaced with TiptapText
      );

    case 'divider':
      // Decorative elements (no text, no children)
      return React.createElement(block.tag, props);

    case 'container':
      // Render container with children
      return React.createElement(
        block.tag,
        props,
        block.children?.map(renderBlock)
      );

    case 'component':
      // Special components (charts, etc.) - render as container for now
      return React.createElement(
        block.tag,
        props,
        block.children?.map(renderBlock)
      );

    default:
      console.warn(`Unknown block type: ${block.type}`);
      return null;
  }
}

/**
 * DynamicHtmlLayout Component
 *
 * Renders structured HTML from variants while preserving React editing functionality
 */
const DynamicHtmlLayout: React.FC<DynamicHtmlLayoutProps> = ({ data }) => {
  const structure = data?._html_structure;

  if (!structure) {
    return (
      <div className="flex items-center justify-center w-full aspect-video bg-gray-100">
        <p className="text-gray-600">No HTML structure data provided</p>
      </div>
    );
  }

  console.log('[DynamicHtmlLayout] Rendering structure:', structure);
  console.log('[DynamicHtmlLayout] Block count:', structure.blocks.length);

  return (
    <>
      {/* Wrapper for TiptapTextReplacer to scan */}
      <div className="dynamic-html-layout w-full aspect-video" data-slide-content="true">
        {structure.blocks.map(renderBlock)}
      </div>
    </>
  );
};

export default DynamicHtmlLayout;
