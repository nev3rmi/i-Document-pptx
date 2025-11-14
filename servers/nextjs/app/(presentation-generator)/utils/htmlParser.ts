/**
 * HTML Parser Utility for Dynamic Template System
 *
 * Converts HTML string into structured data that can be rendered as React components
 * while preserving editing functionality.
 */

export interface Block {
  id: string;
  type: 'container' | 'text' | 'image' | 'divider' | 'component';
  tag: string;
  classes?: string;
  styles?: string;
  content?: string;
  src?: string;
  alt?: string;
  children?: Block[];
  attributes?: Record<string, string>;
}

export interface HtmlStructure {
  version: string;
  blocks: Block[];
}

let blockIdCounter = 0;

function generateBlockId(): string {
  return `block-${Date.now()}-${blockIdCounter++}`;
}

/**
 * Detect the type of block based on element characteristics
 */
function detectBlockType(element: HTMLElement): Block['type'] {
  const tag = element.tagName.toLowerCase();

  // Image
  if (tag === 'img') return 'image';

  // Divider (decorative elements with no text/children)
  if (element.children.length === 0 && !element.textContent?.trim()) {
    return 'divider';
  }

  // Text (has text content but may have formatting children)
  const directText = getDirectTextContent(element);
  if (directText.trim().length > 0) {
    return 'text';
  }

  // Container (has child elements)
  if (element.children.length > 0) {
    return 'container';
  }

  return 'container';
}

/**
 * Get direct text content of an element (not from children)
 */
function getDirectTextContent(element: HTMLElement): string {
  let text = '';
  element.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || '';
    }
  });
  return text;
}

/**
 * Extract styles from element
 */
function extractStyles(element: HTMLElement): string | undefined {
  const style = element.getAttribute('style');
  return style || undefined;
}

/**
 * Extract relevant attributes (excluding common ones we handle separately)
 */
function extractAttributes(element: HTMLElement): Record<string, string> {
  const attrs: Record<string, string> = {};
  const excludeAttrs = ['class', 'style', 'src', 'alt'];

  // Preserve data-path for icon editing functionality
  const preserveDataAttrs = ['data-path'];

  Array.from(element.attributes).forEach(attr => {
    const shouldPreserveDataAttr = preserveDataAttrs.includes(attr.name);
    const isExcluded = excludeAttrs.includes(attr.name);
    const isOtherDataAttr = attr.name.startsWith('data-') && !shouldPreserveDataAttr;

    if (!isExcluded && !isOtherDataAttr) {
      attrs[attr.name] = attr.value;
    }
  });

  return Object.keys(attrs).length > 0 ? attrs : {};
}

/**
 * Check if element should be skipped (editing infrastructure)
 */
function shouldSkipElement(element: HTMLElement): boolean {
  // Skip editing infrastructure wrappers
  const skipClasses = [
    'tiptap-text-editor',
    'tiptap-text-replacer',
    'editable-layout-wrapper'
  ];

  return skipClasses.some(cls => element.classList.contains(cls));
}

/**
 * Recursively traverse DOM and build structure tree
 */
function traverseNode(node: HTMLElement): Block | null {
  // Skip editing infrastructure
  if (shouldSkipElement(node)) {
    // But process its children
    const children: Block[] = [];
    Array.from(node.children).forEach(child => {
      const block = traverseNode(child as HTMLElement);
      if (block) children.push(block);
    });

    // If this wrapper has children, return them flattened
    if (children.length === 1) return children[0];
    if (children.length > 1) {
      // Wrap in generic container
      return {
        id: generateBlockId(),
        type: 'container',
        tag: 'div',
        children
      };
    }
    return null;
  }

  const type = detectBlockType(node);
  const tag = node.tagName.toLowerCase();

  // Build base block
  const block: Block = {
    id: generateBlockId(),
    type,
    tag,
    classes: node.className || undefined,
    styles: extractStyles(node),
    attributes: extractAttributes(node)
  };

  // Handle different block types
  if (type === 'image') {
    block.src = node.getAttribute('src') || undefined;
    block.alt = node.getAttribute('alt') || undefined;
  } else if (type === 'text') {
    // Get all text content (including from formatting children like <strong>)
    block.content = node.textContent?.trim() || undefined;
  } else if (type === 'container' || type === 'divider') {
    // Process children
    const children: Block[] = [];
    Array.from(node.children).forEach(child => {
      const childBlock = traverseNode(child as HTMLElement);
      if (childBlock) children.push(childBlock);
    });

    if (children.length > 0) {
      block.children = children;
    }
  }

  return block;
}

/**
 * Parse HTML string into structured format
 *
 * @param html - Raw HTML string from captured slide
 * @returns Structured representation suitable for React rendering
 */
export function parseHtmlStructure(html: string): HtmlStructure {
  // Reset counter for consistent IDs during testing
  blockIdCounter = 0;

  // Parse HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Get the main content (skip body wrapper)
  const rootElements = Array.from(doc.body.children) as HTMLElement[];

  // Build structure
  const blocks: Block[] = [];
  rootElements.forEach(element => {
    const block = traverseNode(element);
    if (block) blocks.push(block);
  });

  return {
    version: '1.0',
    blocks
  };
}

/**
 * Debug utility: Print structure in readable format
 */
export function printStructure(structure: HtmlStructure, indent = 0): void {
  const printBlock = (block: Block, level: number) => {
    const spaces = '  '.repeat(level);
    console.log(`${spaces}[${block.type}] <${block.tag}> ${block.classes || ''}`);
    if (block.content) {
      console.log(`${spaces}  Content: "${block.content.substring(0, 50)}..."`);
    }
    if (block.children) {
      block.children.forEach(child => printBlock(child, level + 1));
    }
  };

  console.log('=== HTML Structure ===');
  console.log(`Version: ${structure.version}`);
  console.log(`Blocks: ${structure.blocks.length}`);
  structure.blocks.forEach(block => printBlock(block, 0));
}
