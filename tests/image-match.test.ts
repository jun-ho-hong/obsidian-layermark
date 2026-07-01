import { describe, expect, it } from "vitest";
import { imageLooksLikeAnnotationTarget } from "../src/image-match";
import type { AnnotationDocument } from "../src/annotation-model";

const annotationFor01: AnnotationDocument = {
  version: 1,
  imagePath: "raw/Social Archives/Instagram/2026/06/assets/YYHNvj/01.jpg",
  imageSize: { width: 1440, height: 1440 },
  objects: [],
  updatedAt: "2026-07-01T00:00:00.000Z"
};

describe("image annotation matching", () => {
  it("matches the exact embedded image target by filename or path", () => {
    expect(
      imageLooksLikeAnnotationTarget(
        { src: "app://local/raw/Social%20Archives/Instagram/2026/06/assets/YYHNvj/01.jpg", alt: "assets/YYHNvj/01.jpg" },
        annotationFor01
      )
    ).toBe(true);
  });

  it("does not match a different image just because dimensions are identical", () => {
    expect(
      imageLooksLikeAnnotationTarget(
        {
          src: "app://local/raw/Social%20Archives/Instagram/2026/06/assets/YYHNvj/02.jpg",
          alt: "assets/YYHNvj/02.jpg",
          naturalWidth: 1440,
          naturalHeight: 1440
        },
        annotationFor01
      )
    ).toBe(false);
  });
});
