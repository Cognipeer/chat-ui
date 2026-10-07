import type { ContentPart } from "../../types";

export interface InlineFile {
  name: string;
  content: string; // base64
  mimeType: string;
}

export function textOf(content: string | ContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .map((p) => (p.type === "text" && typeof (p as any).text === "string" ? (p as any).text : ""))
    .join("");
}

function decodeBase64Text(content: string): string | undefined {
  try {
    const binary = atob(content);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
}

const TEXT_MIME = /^(text\/|application\/(json|xml|yaml|x-yaml|csv))/;

/**
 * Builds user content for OpenAI-style APIs: images become `image_url` parts,
 * text files are inlined, anything else is mentioned by name so the model
 * knows it was attached.
 */
export function userContentWithFiles(
  text: string,
  files: InlineFile[] | undefined,
  imagePart: (dataUrl: string) => ContentPart,
  textPart: (text: string) => ContentPart
): string | ContentPart[] {
  if (!files || files.length === 0) return text;

  const parts: ContentPart[] = [];
  let body = text;
  for (const file of files) {
    if (file.mimeType.startsWith("image/")) {
      parts.push(imagePart(`data:${file.mimeType};base64,${file.content}`));
    } else if (TEXT_MIME.test(file.mimeType)) {
      const decoded = decodeBase64Text(file.content);
      body += decoded !== undefined
        ? `\n\n[Attached file: ${file.name}]\n${decoded}`
        : `\n\n[Attached file: ${file.name} (${file.mimeType})]`;
    } else {
      body += `\n\n[Attached file: ${file.name} (${file.mimeType})]`;
    }
  }
  return [textPart(body), ...parts];
}

export function makeId(): string {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
