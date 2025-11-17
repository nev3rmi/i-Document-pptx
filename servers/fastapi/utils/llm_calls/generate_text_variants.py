from typing import List
from fastapi import HTTPException
from models.llm_message import LLMSystemMessage, LLMUserMessage
from services.llm_client import LLMClient
from utils.llm_provider import get_model
from pydantic import BaseModel, Field
import traceback


class TextVariants(BaseModel):
    """Model for text variants response"""
    variants: List[str] = Field(
        description="List of alternative text versions",
        min_length=1,
        max_length=5
    )


def get_system_prompt():
    return """
    Generate alternative versions of the provided text while maintaining the core meaning.

    # Guidelines
    - Keep the same language as the original text
    - Maintain the key message and intent
    - Provide variations in:
      * Phrasing and word choice
      * Sentence structure
      * Level of formality (if appropriate)
      * Length (slightly shorter or longer variations)
    - Each variant should feel natural and professional
    - Ensure variants are suitable for presentation slides
    - Do not change facts, statistics, or specific numbers

    Provide the requested number of distinct, high-quality alternatives.
    """


def get_user_prompt(selected_text: str, variant_count: int):
    return f"""
    ## Original Text
    {selected_text}

    ## Task
    Generate {variant_count} alternative versions of the above text.

    ## Requirements
    - Each variant must convey the same core message
    - Variants should be distinct from each other
    - Keep the same language and tone
    - Suitable for presentation slides
    """


async def generate_single_text_variant(
    selected_text: str,
    variant_index: int = 0,
) -> str:
    """
    Generate a single text variant using LLM.

    Args:
        selected_text: The text to generate a variant for
        variant_index: Index of the variant (for uniqueness)

    Returns:
        Single text variant string
    """
    try:
        llm_client = LLMClient()

        # Simplified prompt for single variant
        system_prompt = """
        Generate an alternative version of the provided text while maintaining the core meaning.

        Guidelines:
        - Keep the same language as the original
        - Maintain the key message and intent
        - Vary phrasing, word choice, and sentence structure
        - Keep it professional and suitable for presentation slides
        - Do not change facts, statistics, or specific numbers
        """

        user_prompt = f"""
        ## Original Text
        {selected_text}

        ## Task
        Generate 1 alternative version of the above text that conveys the same core message.
        """

        messages = [
            LLMSystemMessage(content=system_prompt),
            LLMUserMessage(content=user_prompt),
        ]

        # Single variant schema
        single_variant_schema = {
            "type": "object",
            "properties": {
                "variant": {
                    "type": "string",
                    "description": "Alternative version of the text"
                }
            },
            "required": ["variant"],
            "additionalProperties": False
        }

        # Use generate_structured method
        response_dict = await llm_client.generate_structured(
            model=get_model(),
            messages=messages,
            response_format=single_variant_schema,
            strict=True,
        )

        return response_dict["variant"]
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate text variant {variant_index}: {str(e)}")


async def generate_text_variants(
    selected_text: str,
    variant_count: int = 3,
) -> List[str]:
    """
    Generate alternative versions of selected text using LLM.

    Args:
        selected_text: The text to generate variants for
        variant_count: Number of variants to generate (default: 3, max: 5)

    Returns:
        List of text variants
    """
    try:
        # Ensure variant_count is within bounds
        variant_count = max(1, min(variant_count, 5))

        llm_client = LLMClient()

        messages = [
            LLMSystemMessage(content=get_system_prompt()),
            LLMUserMessage(content=get_user_prompt(selected_text, variant_count)),
        ]

        # Use generate_structured method with proper schema
        response_dict = await llm_client.generate_structured(
            model=get_model(),
            messages=messages,
            response_format=TextVariants.model_json_schema(),
            strict=True,
        )

        # Parse the response into our Pydantic model
        response = TextVariants(**response_dict)
        return response.variants
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate text variants: {str(e)}")
