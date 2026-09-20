export type AnnotationPromptMode = "exact" | "short" | "tag" | "empty";

export interface AnnotationPromptSettings {
  annotationMode: AnnotationPromptMode;
  atmosphere: boolean;
  quality: boolean;
  lensInfo: boolean;
  ignoreText: boolean;
  facialFeatures: boolean;
  jpegCompression: boolean;
  adversarialNoise: boolean;
  aiGenerated: boolean;
  additionalPromptContent: string;
}

export const defaultAnnotationPromptSettings: AnnotationPromptSettings = {
  annotationMode: "exact",
  atmosphere: false,
  quality: false,
  lensInfo: false,
  ignoreText: false,
  facialFeatures: false,
  jpegCompression: false,
  adversarialNoise: false,
  aiGenerated: false,
  additionalPromptContent: ""
};

export function generateAnnotationPrompt(settings: AnnotationPromptSettings) {
  const additional = settings.additionalPromptContent.trim();

  if (settings.annotationMode === "empty") {
    return additional;
  }

  let base: string;
  if (settings.annotationMode === "exact") {
    base =
      'Please describe each of the following images in a detailed and precise manner, as if you are creating caption of images. Try to include all the content in the image, including details. A photography of... / An artwork of... or proceed directly with description without using "This is..." or "This image shows..." at the beginning. Accurately describe the location of secondary subjects in relation to the main thing (or person) if the content is more complex. Accurately describe all special effects in the image, such as depth of field, chromatic aberration, lens flares, long exposure, or digital artifacts (if there are, skip if there\'s not). You can also describe the artistic style of the image, such as duotone or high contrast. Do not describe anything that is not present in the image. Avoid using uncertain language, such as saying a character "probably" doing something or "appears to be" a certain way, or that the image "likely" from a certain source. Do not list items separately; instead, include all the content in a single paragraph. No line breaks. Please note the use of half-width punctuation and spaces. Do not use rich text and markdown format. Check the format, and do not have two consecutive spaces. ';
  } else if (settings.annotationMode === "short") {
    base =
      'Please describe each of the following images, as if you are creating caption of images. Keep the text as short and concise as possible, only include the most essential parts. You can also describe the artistic style of the image, such as duotone or high contrast. Do not describe anything that is not present in the image. Avoid using uncertain language, such as saying a character "probably" doing something or "appears to be" a certain way, or that the image "likely" from a certain source. Do not list items separately; instead, include all the content in a few sentences. No line breaks. Please note the use of half-width punctuation and spaces. Do not use rich text and markdown format. Check the format, and do not have two consecutive spaces. ';
  } else {
    base =
      "Please describe each of the following images in a detailed and precise manner, as if you are creating caption of images. Do not use natural language to describe the image. List each element in the image (including actions if any), separated by commas and a space, and use all lowercase letters, like Booru tags. Accurately describe all special effects in the image, such as depth of field, chromatic aberration, lens flares, long exposure, or digital artifacts (if there are, ignore if there's not). You can also describe the artistic style of the image, such as duotone or high contrast. Do not describe anything that is not present in the image. List items separately without line break. Please note the use of half-width punctuation and spaces. ";
  }

  let extra = "";
  extra += settings.atmosphere
    ? "Try describing abstract concepts, such as the emotions or themes expressed in the image, or the feelings it evokes. "
    : "Do not describe abstract concepts, such as the emotions or themes expressed in the image, or the feelings it evokes. ";
  extra += settings.quality
    ? 'Use "worst quality", "bad quality", "medium quality", "high quality", "best quality" to assess each image\'s aesthetic quality. However, do not explain the reason for the rating. '
    : "No need to judge quality of the image. ";
  if (settings.lensInfo) {
    extra += "If it's a photograph, analyze aperture, shutter speed, and ISO; skip if not applicable. ";
  }
  extra += settings.ignoreText
    ? "Do not mention any text existing in the image. "
    : "If the image contains text, please precisely describe the text content and its location. ";
  if (settings.facialFeatures) {
    extra += "If the image contains one to three clearly visible human faces, attempt to describe their facial features. If a person is identifiable (e.g., a public figure), state their name instead of describing features. ";
  }
  if (settings.jpegCompression) {
    extra +=
      settings.annotationMode === "tag"
        ? 'Check for JPEG compression artifacts; if found, add the "jpeg artifacts" tag. '
        : "Please check whether the image has any quality loss due to JPEG compression. If present, indicate it in the annotation. If not, no need to mention it. ";
  }
  if (settings.adversarialNoise) {
    extra +=
      settings.annotationMode === "tag"
        ? 'Check for adversarial noise artifacts; if found, add the "adversarial noise" tag. '
        : "Please check whether the image has any traces similar to Adversarial Noise. If present, indicate it in the annotation. If not, no need to mention it. ";
  }
  if (settings.aiGenerated) {
    extra +=
      settings.annotationMode === "tag"
        ? 'Check for signs of AI generation (diffusion traces, overfitting artifacts, structural/logical inconsistencies); if found, add an "ai-generated" tag. '
        : "Please check whether the image shows signs of AI generation, such as diffusion traces, overfitting artifacts, or structural/logical inconsistencies. If present, indicate it in the annotation. If not, no need to mention it. ";
  }

  return `${base}${extra.trim()}${additional ? ` ${additional}` : ""}`;
}
