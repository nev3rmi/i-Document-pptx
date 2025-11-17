import { getHeader, getHeaderForFormData } from "./header";
import { IconSearch, ImageGenerate, ImageSearch, PreviousGeneratedImagesResponse } from "./params";
import { ApiResponseHandler } from "./api-error-handler";

export class PresentationGenerationApi {
  static async uploadDoc(documents: File[]) {
    const formData = new FormData();

    documents.forEach((document) => {
      formData.append("files", document);
    });

    try {
      const response = await fetch(
        `/api/v1/ppt/files/upload`,
        {
          method: "POST",
          headers: getHeaderForFormData(),
          body: formData,
          cache: "no-cache",
        }
      );

      return await ApiResponseHandler.handleResponse(response, "Failed to upload documents");
    } catch (error) {
      console.error("Upload error:", error);
      throw error;
    }
  }

  static async decomposeDocuments(documentKeys: string[]) {
    try {
      const response = await fetch(
        `/api/v1/ppt/files/decompose`,
        {
          method: "POST",
          headers: getHeader(),
          body: JSON.stringify({
            file_paths: documentKeys,
          }),
          cache: "no-cache",
        }
      );
      
      return await ApiResponseHandler.handleResponse(response, "Failed to decompose documents");
    } catch (error) {
      console.error("Error in Decompose Files", error);
      throw error;
    }
  }
 
   static async createPresentation({
    content,
    n_slides,
    file_paths,
    language,
    tone,
    verbosity,
    instructions,
    include_table_of_contents,
    include_title_slide,
    web_search,
    
  }: {
    content: string;
    n_slides: number | null;
    file_paths?: string[];
    language: string | null;
    tone?: string | null;
    verbosity?: string | null;
    instructions?: string | null;
    include_table_of_contents?: boolean;
    include_title_slide?: boolean;
    web_search?: boolean;
  }) {
    try {
      const response = await fetch(
        `/api/v1/ppt/presentation/create`,
        {
          method: "POST",
          headers: getHeader(),
          body: JSON.stringify({
            content,
            n_slides,
            file_paths,
            language,
            tone,
            verbosity,
            instructions,
            include_table_of_contents,
            include_title_slide,
            web_search,
          }),
          cache: "no-cache",
        }
      );
      
      return await ApiResponseHandler.handleResponse(response, "Failed to create presentation");
    } catch (error) {
      console.error("error in presentation creation", error);
      throw error;
    }
  }

  static async editSlide(
    slide_id: string,
    prompt: string
  ) {
    try {
      const response = await fetch(
        `/api/v1/ppt/slide/edit`,
        {
          method: "POST",
          headers: getHeader(),
          body: JSON.stringify({
            id: slide_id,
            prompt,
          }),
          cache: "no-cache",
        }
      );

      return await ApiResponseHandler.handleResponse(response, "Failed to update slide");
    } catch (error) {
      console.error("error in slide update", error);
      throw error;
    }
  }

  static async editSlideHtml(
    slide_id: string,
    prompt: string,
    html?: string
  ) {
    try {
      const response = await fetch(
        `/api/v1/ppt/slide/edit-html`,
        {
          method: "POST",
          headers: getHeader(),
          body: JSON.stringify({
            id: slide_id,
            prompt,
            html,
          }),
          cache: "no-cache",
        }
      );

      return await ApiResponseHandler.handleResponse(response, "Failed to update slide HTML");
    } catch (error) {
      console.error("error in slide HTML update", error);
      throw error;
    }
  }

  static async saveHtmlVariant(
    slide_id: string,
    html_content: string
  ) {
    try {
      const response = await fetch(
        `/api/v1/ppt/slide/save-html-variant`,
        {
          method: "POST",
          headers: getHeader(),
          body: JSON.stringify({
            id: slide_id,
            html_content,
          }),
          cache: "no-cache",
        }
      );

      return await ApiResponseHandler.handleResponse(response, "Failed to save HTML variant");
    } catch (error) {
      console.error("error in saving HTML variant", error);
      throw error;
    }
  }

  static async getSlide(slide_id: string) {
    try {
      const response = await fetch(
        `/api/v1/ppt/slide/${slide_id}`,
        {
          method: "GET",
          headers: getHeader(),
          cache: "no-cache",
        }
      );

      return await ApiResponseHandler.handleResponse(response, "Failed to fetch slide");
    } catch (error) {
      console.error("error fetching slide", error);
      throw error;
    }
  }

  static async generateLayoutVariants(
    html: string,
    full_slide_html: string,
    block_type: string,
    available_width: number,
    available_height: number,
    parent_container_info?: string,
    variant_count: number = 3,
    transformation_scope?: 'block' | 'section' | 'slide'
  ) {
    try {
      const startTime = Date.now();
      console.log('[API] Calling generateLayoutVariants:', {
        html_length: html?.length,
        full_slide_html_length: full_slide_html?.length,
        block_type,
        available_width,
        available_height,
        parent_container_info: parent_container_info?.substring(0, 50),
        variant_count,
        transformation_scope,
        timestamp: startTime
      });

      // Add timeout to prevent hanging forever
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 180 second timeout

      const response = await fetch(
        `/api/v1/ppt/slide/layout-variants`,
        {
          method: "POST",
          headers: getHeader(),
          body: JSON.stringify({
            html,
            full_slide_html,
            block_type,
            available_width,
            available_height,
            parent_container_info,
            variant_count,
            transformation_scope,
          }),
          cache: "no-cache",
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      console.log('[API] Response received:', response.status, response.statusText, `Duration: ${duration}ms (${(duration/1000).toFixed(1)}s)`);

      return await ApiResponseHandler.handleResponse(response, "Failed to generate layout variants");
    } catch (error) {
      console.error("[API] Error generating layout variants:", error);
      throw error;
    }
  }

  static async generateTextVariants(
    selected_text: string,
    variant_count: number = 3
  ) {
    try {
      const response = await fetch(
        `/api/v1/ppt/slide/text-variants`,
        {
          method: "POST",
          headers: getHeader(),
          body: JSON.stringify({
            selected_text,
            variant_count,
          }),
          cache: "no-cache",
        }
      );

      return await ApiResponseHandler.handleResponse(response, "Failed to generate text variants");
    } catch (error) {
      console.error("error in generating text variants", error);
      throw error;
    }
  }

  static async updatePresentationContent(body: any) {
    try {
      const response = await fetch(
        `/api/v1/ppt/presentation/update`,
        {
          method: "PATCH",
          headers: getHeader(),
          body: JSON.stringify(body),
          cache: "no-cache",
        }
      );
      
      return await ApiResponseHandler.handleResponse(response, "Failed to update presentation content");
    } catch (error) {
      console.error("error in presentation content update", error);
      throw error;
    }
  }

  static async presentationPrepare(presentationData: any) {
    try {
      const response = await fetch(
        `/api/v1/ppt/presentation/prepare`,
        {
          method: "POST",
          headers: getHeader(),
          body: JSON.stringify(presentationData),
          cache: "no-cache",
        }
      );
      
      return await ApiResponseHandler.handleResponse(response, "Failed to prepare presentation");
    } catch (error) {
      console.error("error in data generation", error);
      throw error;
    }
  }
  
  // IMAGE AND ICON SEARCH
  
  
  static async generateImage(imageGenerate: ImageGenerate) {
    try {
      const response = await fetch(
        `/api/v1/ppt/images/generate?prompt=${imageGenerate.prompt}`,
        {
          method: "GET",
          headers: getHeader(),
          cache: "no-cache",
        }
      );
      
      return await ApiResponseHandler.handleResponse(response, "Failed to generate image");
    } catch (error) {
      console.error("error in image generation", error);
      throw error;
    }
  }

  static getPreviousGeneratedImages = async (): Promise<PreviousGeneratedImagesResponse[]> => {
    try {
      const response = await fetch(
        `/api/v1/ppt/images/generated`,
        {
          method: "GET",
          headers: getHeader(),
        }
      );
      
      return await ApiResponseHandler.handleResponse(response, "Failed to get previous generated images");
    } catch (error) {
      console.error("error in getting previous generated images", error);
      throw error;
    }
  }
  
  static async searchIcons(iconSearch: IconSearch) {
    try {
      const response = await fetch(
        `/api/v1/ppt/icons/search?query=${iconSearch.query}&limit=${iconSearch.limit}`,
        {
          method: "GET",
          headers: getHeader(),
          cache: "no-cache",
        }
      );
      
      return await ApiResponseHandler.handleResponse(response, "Failed to search icons");
    } catch (error) {
      console.error("error in icon search", error);
      throw error;
    }
  }



  // EXPORT PRESENTATION
  static async exportAsPPTX(presentationData: any) {
    try {
      const response = await fetch(
        `/api/v1/ppt/presentation/export/pptx`,
        {
          method: "POST",
          headers: getHeader(),
          body: JSON.stringify(presentationData),
          cache: "no-cache",
        }
      );
      return await ApiResponseHandler.handleResponse(response, "Failed to export as PowerPoint");
    } catch (error) {
      console.error("error in pptx export", error);
      throw error;
    }
  }
  
  

}