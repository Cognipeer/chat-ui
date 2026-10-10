import { describe, expect, it } from "vitest";
import { imagePartSource, isImageType, safeFileHref, safeImageSrc } from "./images";

describe("safeImageSrc", () => {
  it("allows https, blob, relative and same-origin URLs and raster data URLs", () => {
    for (const url of [
      "https://cdn.example.com/a.png",
      "blob:http://localhost:3000/1b2c",
      "/api/files/f1/content",
      "files/f1",
      "http://localhost:3000/x.png", // jsdom's page is http://localhost:3000
      "data:image/png;base64,iVBORw0KGgo=",
      "data:image/jpeg;base64,/9j/4AAQ",
      "data:image/webp;base64,UklGRg==",
    ]) {
      expect(safeImageSrc(url), url).toBe(url);
    }
  });

  it("drops script URLs, SVG and HTML data URLs, other schemes and non-strings", () => {
    for (const url of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:text/html;base64,PGgxPg==",
      "data:image/png,not-base64",
      "ftp://host/a.png",
      "file:///etc/passwd",
      "",
      "   ",
    ]) {
      expect(safeImageSrc(url), url).toBeUndefined();
    }
    expect(safeImageSrc(undefined)).toBeUndefined();
    expect(safeImageSrc(42)).toBeUndefined();
  });
});

describe("imagePartSource", () => {
  it("reads image_url, input_image and image parts", () => {
    expect(imagePartSource({ type: "image_url", image_url: { url: "https://x.test/a.png" } })).toEqual({ src: "https://x.test/a.png" });
    expect(imagePartSource({ type: "input_image", image_url: "https://x.test/b.png" })).toEqual({ src: "https://x.test/b.png" });
    expect(imagePartSource({ type: "input_image", image_url: { url: "https://x.test/c.png" } })).toEqual({ src: "https://x.test/c.png" });
    expect(imagePartSource({ type: "image", source: { type: "url", url: "https://x.test/d.png" } })).toEqual({ src: "https://x.test/d.png" });
    expect(imagePartSource({ type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } })).toEqual({
      src: "data:image/png;base64,iVBORw0KGgo=",
    });
  });

  it("refuses unsafe sources and other kinds of parts", () => {
    expect(imagePartSource({ type: "image_url", image_url: { url: "javascript:alert(1)" } })).toBeUndefined();
    expect(imagePartSource({ type: "image", source: { type: "base64", media_type: "image/svg+xml", data: "PHN2Zz4=" } })).toBeUndefined();
    expect(imagePartSource({ type: "text", text: "hi" })).toBeUndefined();
    expect(imagePartSource({ type: "image_url" })).toBeUndefined();
  });
});

describe("isImageType / safeFileHref", () => {
  it("recognises image media types", () => {
    expect(isImageType("image/png")).toBe(true);
    expect(isImageType("IMAGE/JPEG")).toBe(true);
    expect(isImageType("application/pdf")).toBe(false);
    expect(isImageType(undefined)).toBe(false);
  });

  it("keeps http(s), blob and relative download links only", () => {
    expect(safeFileHref("https://x.test/f")).toBe("https://x.test/f");
    expect(safeFileHref("/files/1")).toBe("/files/1");
    expect(safeFileHref("blob:http://localhost/1")).toBe("blob:http://localhost/1");
    expect(safeFileHref("javascript:alert(1)")).toBeUndefined();
    expect(safeFileHref("data:text/html,x")).toBeUndefined();
    expect(safeFileHref(undefined)).toBeUndefined();
  });
});
