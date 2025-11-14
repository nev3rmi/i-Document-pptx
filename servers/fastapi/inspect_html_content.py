#!/usr/bin/env python3
"""
Inspect HTML content from slides that have html_content field populated.
Run this to see REAL captured HTML examples.
"""

import sqlite3
import json
import sys

# Connect to database
db_path = '/home/nev3r/projects/presenton/presenton/app_data/fastapi.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("=" * 80)
print("SEARCHING FOR SLIDES WITH HTML CONTENT")
print("=" * 80)

# Find slides with html_content
cursor.execute("""
    SELECT
        id,
        presentation,
        layout,
        layout_group,
        LENGTH(html_content) as html_length,
        html_content
    FROM slides
    WHERE html_content IS NOT NULL
    AND html_content != ''
    ORDER BY html_length DESC
    LIMIT 5
""")

slides = cursor.fetchall()

if not slides:
    print("\n❌ NO SLIDES WITH HTML CONTENT FOUND")
    print("\nThis means no layout variants have been applied yet.")
    print("\nTo see real HTML:")
    print("1. Run the app")
    print("2. Open a presentation")
    print("3. Ctrl+Click on a block")
    print("4. Smart Panel → Variants → Generate → Apply")
    print("5. Run this script again")
    sys.exit(0)

print(f"\n✅ FOUND {len(slides)} SLIDE(S) WITH HTML CONTENT\n")

for idx, (slide_id, pres_id, layout, layout_group, html_len, html_content) in enumerate(slides, 1):
    print("=" * 80)
    print(f"SLIDE #{idx}")
    print("=" * 80)
    print(f"Slide ID: {slide_id}")
    print(f"Presentation: {pres_id}")
    print(f"Layout: {layout_group}:{layout}")
    print(f"HTML Length: {html_len:,} characters")
    print()

    # Show first 3000 characters
    print("HTML CONTENT (first 3000 chars):")
    print("-" * 80)
    print(html_content[:3000])
    print("-" * 80)

    if html_len > 3000:
        print(f"... ({html_len - 3000:,} more characters)")

    print()

    # Save to file for full inspection
    filename = f"slide_{slide_id}_html.html"
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(html_content)
    print(f"💾 Full HTML saved to: {filename}")
    print()

conn.close()

print("=" * 80)
print("DONE!")
print("=" * 80)
