#!/usr/bin/env python3
"""
Helper script to get a single slide by ID.
Fetches the presentation and filters to just the requested slide.

Usage:
  python3 get_slide_by_id.py <slide_id> [--api-url http://localhost:5000]
"""

import sys
import argparse
import requests
import json

def get_slide_by_id(slide_id: str, api_url: str = "http://127.0.0.1:5000") -> dict:
    """
    Get a single slide by ID.

    More efficient than having the AI process the entire presentation.
    Fetches all presentations, finds the one containing the slide,
    and returns only that slide's data.

    Args:
        slide_id: UUID of the slide to retrieve
        api_url: Base URL of ADS I-Document-PPTX API

    Returns:
        Slide object with content, layout, and metadata

    Raises:
        ValueError: If slide not found
    """
    # Get all presentations
    response = requests.get(f"{api_url}/api/v1/ppt/presentation/all")
    response.raise_for_status()
    presentations = response.json()

    # Search for the slide across all presentations
    for pres in presentations:
        # Get full presentation data
        pres_response = requests.get(f"{api_url}/api/v1/ppt/presentation/{pres['id']}")
        pres_response.raise_for_status()
        pres_data = pres_response.json()

        # Look for the slide in this presentation
        for slide in pres_data.get('slides', []):
            if slide['id'] == slide_id:
                # Found it! Return only this slide
                return slide

    # Slide not found
    raise ValueError(f"Slide {slide_id} not found in any presentation")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Get a single slide by ID (more efficient than fetching entire presentation)"
    )
    parser.add_argument("slide_id", help="UUID of the slide to retrieve")
    parser.add_argument(
        "--api-url",
        default="http://127.0.0.1:5000",
        help="ADS I-Document-PPTX API base URL (default: http://127.0.0.1:5000)"
    )

    args = parser.parse_args()

    try:
        slide = get_slide_by_id(args.slide_id, args.api_url)
        print(json.dumps(slide, indent=2))
        sys.exit(0)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
