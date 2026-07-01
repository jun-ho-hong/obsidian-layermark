import type { AnnotationDocument } from "./annotation-model";

export function getFabricJson(document: AnnotationDocument): unknown | null {
  return document.engine?.fabricJson ?? null;
}

export function putFabricJson(document: AnnotationDocument, fabricJson: unknown): AnnotationDocument {
  return {
    ...document,
    engine: {
      ...document.engine,
      fabricJson
    }
  };
}
