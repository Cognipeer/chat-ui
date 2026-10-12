import { describe, expect, it } from "vitest";
import { imagePartSource, isImageType, isRasterImageType, safeFileHref, safeImageSrc } from "./images";

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

describe("safeFileHref and the URL parser", () => {
  it("rejects script URLs written with characters the browser's URL parser ignores", () => {
    for (const url of [
      "java\nscript:alert(1)",
      "java\tscript:alert(1)",
      "java\rscript:alert(1)",
      "jav\n\tascript:alert(1)",
      "\u0001javascript:alert(1)",
      "\u0000javascript:alert(1)",
      "\u001f javascript:alert(1)",
      " \n javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "vbscript:msgbox(1)",
      "data:text/html;base64,PGgxPg==",
      "file:///etc/passwd",
    ]) {
      expect(safeFileHref(url), JSON.stringify(url)).toBeUndefined();
    }
  });

  it("also rejects them after leading and trailing whitespace", () => {
    expect(safeFileHref("  javascript:alert(1)  ")).toBeUndefined();
    expect(safeFileHref("\n\tjava\nscript:alert(1)")).toBeUndefined();
  });

  it("returns the address the browser will use, not the raw string", () => {
    expect(safeFileHref("  https://x.test/f  ")).toBe("https://x.test/f");
    expect(safeFileHref("ht\ntps://x.test/f")).toBe("https://x.test/f");
    expect(safeFileHref("https://x.test")).toBe("https://x.test/");
    expect(safeFileHref("HTTPS://X.TEST/F")).toBe("https://x.test/F");
  });

  it("keeps relative links, with the characters the parser would drop taken out", () => {
    expect(safeFileHref("/files/1")).toBe("/files/1");
    expect(safeFileHref("files/a b")).toBe("files/a b");
    expect(safeFileHref("/files/\n1")).toBe("/files/1");
    expect(safeFileHref("a/b:c")).toBe("a/b:c");
  });

  it("rejects anything that is not a string or is empty after cleaning", () => {
    expect(safeFileHref("")).toBeUndefined();
    expect(safeFileHref(" \n\t ")).toBeUndefined();
    expect(safeFileHref(null)).toBeUndefined();
    expect(safeFileHref(7)).toBeUndefined();
  });
});

describe("isRasterImageType", () => {
  it("is true for the pictures a browser shows without running anything", () => {
    for (const type of ["image/png", "IMAGE/JPEG", "image/jpg", "image/gif", "image/webp", "image/png; charset=binary"]) {
      expect(isRasterImageType(type), type).toBe(true);
    }
  });

  it("is false for SVG and other types", () => {
    for (const type of ["image/svg+xml", "image/heic", "image/tiff", "application/pdf", "", undefined]) {
      expect(isRasterImageType(type), String(type)).toBe(false);
    }
  });
});
