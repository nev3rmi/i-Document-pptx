/**
 * Test script to verify all 3 layout variants work correctly
 * Tests: Vertical, Grid, Horizontal layouts
 */

const SAMPLE_HTML = `<div class="space-y-4">
  <div class="flex items-start space-x-4">
    <svg class="w-8 h-8 text-green-500" fill="currentColor" viewBox="0 0 20 20">
      <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.471 1.106l-5 2.57a1 1 0 01-.894 0l-5-2.57a1 1 0 01-.471-1.106l1.738-5.42-1.233-.616a1 1 0 01.894-1.79l1.599.8L9 4.323V3a1 1 0 011-1zm-5 8.274l-.818 2.552c-.25.112-.443.487-.802.952.023-.023.05-.046.082-.082.31-.31.635-.643.926-.99l.612-.612zm6 0l.612.612c.29.347.616.68.926.99.032.036.059.059.082.082-.359-.465-.552-.84-.802-.952l-.818-2.552z" clip-rule="evenodd"></path>
    </svg>
    <div>
      <h3 class="font-semibold">Solar Power</h3>
      <p class="text-sm text-gray-600">Clean renewable energy</p>
    </div>
  </div>
  <div class="flex items-start space-x-4">
    <svg class="w-8 h-8 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
      <path d="M2 10.5a1.5 1.5 0 113 0v-6a1.5 1.5 0 01-3 0v6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.256 8H6z"></path>
    </svg>
    <div>
      <h3 class="font-semibold">Wind Power</h3>
      <p class="text-sm text-gray-600">Sustainable energy source</p>
    </div>
  </div>
  <div class="flex items-start space-x-4">
    <svg class="w-8 h-8 text-cyan-500" fill="currentColor" viewBox="0 0 20 20">
      <path fill-rule="evenodd" d="M5.5 2a1 1 0 011 1v1h8V3a1 1 0 112 0v1h3a2 2 0 012 2v3a1 1 0 01-2 0V7H4v10a2 2 0 002 2h10a2 2 0 002-2V7h1a1 1 0 110 2h-1v4a1 1 0 012 0v-4a2 2 0 00-2-2h-3v1a1 1 0 11-2 0V5H6v1a1 1 0 11-2 0V3a1 1 0 011-1zm0 5a1 1 0 011 1v1h8V8a1 1 0 112 0v1h2V5H4v4z" clip-rule="evenodd"></path>
    </svg>
    <div>
      <h3 class="font-semibold">Hydro Power</h3>
      <p class="text-sm text-gray-600">Water-based generation</p>
    </div>
  </div>
</div>`;

const API_BASE = 'http://localhost:5000/api/v1/ppt/slide';

async function testLayoutVariants() {
  console.log('='.repeat(80));
  console.log('TESTING ALL 3 LAYOUT VARIANTS');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Call the API to generate layout variants
    console.log('1. Calling layout variants API...');
    console.log('   Block Type: list-container');
    console.log('   HTML length: ' + SAMPLE_HTML.length + ' chars');
    console.log('');

    const response = await fetch(`${API_BASE}/layout-variants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        html: SAMPLE_HTML,
        block_type: 'list-container',
        variant_count: 3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log(`API Response received: ${data.variants.length} variants generated`);
    console.log('');

    if (!data.variants || data.variants.length === 0) {
      throw new Error('No variants returned from API');
    }

    // Test each variant
    const results = {
      vertical: null,
      grid: null,
      horizontal: null,
    };

    data.variants.forEach((variant, index) => {
      console.log(`${'='.repeat(80)}`);
      console.log(`VARIANT ${index + 1}: ${variant.title}`);
      console.log(`${'='.repeat(80)}`);
      console.log(`Description: ${variant.description}`);
      console.log(`HTML length: ${variant.html.length} chars`);
      console.log('');

      // Classify variant
      let variantType = null;
      const titleLower = variant.title.toLowerCase();
      const descLower = variant.description.toLowerCase();
      const htmlLower = variant.html.toLowerCase();

      if (titleLower.includes('vertical') ||
          descLower.includes('vertical') ||
          htmlLower.includes('space-y')) {
        variantType = 'vertical';
      } else if (titleLower.includes('grid') ||
                 titleLower.includes('2-col') ||
                 titleLower.includes('3-col') ||
                 descLower.includes('grid') ||
                 htmlLower.includes('grid')) {
        variantType = 'grid';
      } else if (titleLower.includes('horizontal') ||
                 titleLower.includes('flex') ||
                 descLower.includes('horizontal') ||
                 descLower.includes('flex') ||
                 htmlLower.includes('flex-row')) {
        variantType = 'horizontal';
      }

      console.log(`Detected Type: ${variantType || 'UNKNOWN'}`);
      console.log('');

      // Test 1: Parse HTML
      console.log('TEST 1: Parse HTML Structure');
      try {
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = variant.html;
        const newElement = tempContainer.firstElementChild;

        if (!newElement) {
          console.log('  FAIL: Could not extract first element from HTML');
          results[variantType] = { status: 'FAIL', reason: 'Could not extract element' };
          return;
        }
        console.log(`  PASS: HTML parsed successfully`);
        console.log(`  Element tag: <${newElement.tagName.toLowerCase()}>`);
        console.log(`  Children count: ${newElement.children.length}`);
      } catch (error) {
        console.log(`  FAIL: HTML parse error: ${error.message}`);
        results[variantType] = { status: 'FAIL', reason: error.message };
        return;
      }
      console.log('');

      // Test 2: Verify child elements preservation
      console.log('TEST 2: Verify Child Elements Preserved');
      try {
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = variant.html;
        const variantElement = tempContainer.firstElementChild;

        // Count original children
        const origContainer = document.createElement('div');
        origContainer.innerHTML = SAMPLE_HTML;
        const origElement = origContainer.firstElementChild;
        const originalChildCount = origElement.children.length;

        const newChildCount = variantElement.children.length;

        if (originalChildCount === newChildCount) {
          console.log(`  PASS: Child count matches (${newChildCount} items)`);
        } else {
          console.log(`  WARN: Child count mismatch - Original: ${originalChildCount}, New: ${newChildCount}`);
          // This might still be OK if grid wrapping occurs
        }

        // Check if content is preserved
        if (variant.html.includes('Solar Power') &&
            variant.html.includes('Wind Power') &&
            variant.html.includes('Hydro Power')) {
          console.log('  PASS: All text content preserved');
        } else {
          console.log('  FAIL: Some text content missing');
          results[variantType] = { status: 'FAIL', reason: 'Content not preserved' };
          return;
        }
      } catch (error) {
        console.log(`  FAIL: ${error.message}`);
        results[variantType] = { status: 'FAIL', reason: error.message };
        return;
      }
      console.log('');

      // Test 3: Check CSS classes
      console.log('TEST 3: Check Layout CSS Classes');
      const hasSpaceY = variant.html.includes('space-y');
      const hasGrid = variant.html.includes('grid grid-cols');
      const hasFlexRow = variant.html.includes('flex-row') ||
                         (variant.html.includes('flex') && variant.html.includes('gap'));

      console.log(`  space-y classes: ${hasSpaceY ? 'YES' : 'NO'}`);
      console.log(`  grid layout: ${hasGrid ? 'YES' : 'NO'}`);
      console.log(`  flex-row layout: ${hasFlexRow ? 'YES' : 'NO'}`);

      if (hasSpaceY) {
        console.log('  -> Layout Type: VERTICAL');
        variantType = 'vertical';
      } else if (hasGrid) {
        console.log('  -> Layout Type: GRID');
        variantType = 'grid';
      } else if (hasFlexRow) {
        console.log('  -> Layout Type: HORIZONTAL');
        variantType = 'horizontal';
      }
      console.log('');

      // Test 4: Check HTML validity
      console.log('TEST 4: HTML Structure Validity');
      try {
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = variant.html;

        // Check for unclosed tags
        const serialized = tempContainer.innerHTML;
        const openTags = (variant.html.match(/<[a-z][^>]*(?<!\/)\s*>/gi) || []).length;
        const closeTags = (variant.html.match(/<\/[a-z][^>]*>/gi) || []).length;
        const selfClosing = (variant.html.match(/<[a-z][^>]*\/>/gi) || []).length;

        console.log(`  Open tags: ${openTags}`);
        console.log(`  Close tags: ${closeTags}`);
        console.log(`  Self-closing: ${selfClosing}`);

        if (openTags === closeTags + selfClosing) {
          console.log('  PASS: HTML structure looks valid');
        } else {
          console.log(`  WARN: Tag mismatch - Open: ${openTags}, Close+Self: ${closeTags + selfClosing}`);
        }
      } catch (error) {
        console.log(`  FAIL: ${error.message}`);
      }
      console.log('');

      // Test 5: Simulate applying layout
      console.log('TEST 5: Simulate Apply Layout (DOM operations)');
      try {
        // Create a mock slide container
        const slideContainer = document.createElement('div');
        slideContainer.setAttribute('data-slide-id', 'test-slide');

        // Add original content
        const origContent = document.createElement('div');
        origContent.innerHTML = SAMPLE_HTML;
        slideContainer.appendChild(origContent.firstElementChild);

        // Get the original block
        const oldBlock = slideContainer.firstElementChild;

        // Parse new variant
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = variant.html;
        const newElement = tempContainer.firstElementChild;

        if (!newElement) {
          console.log('  FAIL: Could not extract new element');
          results[variantType] = { status: 'FAIL', reason: 'Element extraction failed on apply' };
          return;
        }

        // Try to replace
        oldBlock.replaceWith(newElement);

        // Verify replacement
        if (slideContainer.firstElementChild === newElement) {
          console.log('  PASS: Element replaced successfully');
        } else {
          console.log('  FAIL: Element replacement did not work');
          results[variantType] = { status: 'FAIL', reason: 'Replace operation failed' };
          return;
        }

        // Get updated HTML
        const updatedHtml = slideContainer.innerHTML;
        if (updatedHtml.includes('Solar Power')) {
          console.log('  PASS: Updated HTML contains all content');
        } else {
          console.log('  FAIL: Updated HTML missing content');
          results[variantType] = { status: 'FAIL', reason: 'Content lost after apply' };
          return;
        }

        console.log('');
        results[variantType] = { status: 'PASS', description: variant.description };
      } catch (error) {
        console.log(`  FAIL: ${error.message}`);
        results[variantType] = { status: 'FAIL', reason: error.message };
      }
      console.log('');

      // Show first 300 chars of HTML
      console.log('HTML Preview (first 300 chars):');
      console.log(variant.html.substring(0, 300) + (variant.html.length > 300 ? '...' : ''));
      console.log('');
    });

    // Summary
    console.log('='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));

    Object.keys(results).forEach(variantType => {
      const result = results[variantType];
      if (result) {
        console.log(`${variantType.toUpperCase()}: ${result.status}`);
        if (result.reason) {
          console.log(`  Reason: ${result.reason}`);
        }
        if (result.description) {
          console.log(`  Description: ${result.description}`);
        }
      } else {
        console.log(`${variantType.toUpperCase()}: NOT FOUND`);
      }
    });

    console.log('');
    const allPassed = Object.values(results).every(r => r && r.status === 'PASS');
    const allDetected = Object.values(results).every(r => r !== null);

    if (allPassed && allDetected) {
      console.log('RESULT: ALL TESTS PASSED - All 3 layouts work correctly!');
    } else if (allDetected) {
      console.log('RESULT: PARTIAL FAILURE - Some layouts cannot be applied');
    } else {
      console.log('RESULT: CRITICAL FAILURE - Not all layout types generated');
    }

    console.log('='.repeat(80));

  } catch (error) {
    console.error('FATAL ERROR:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testLayoutVariants();
