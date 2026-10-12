/**
 * Puts text on the clipboard. `navigator.clipboard` needs a secure page and, inside an iframe, the
 * host's `allow="clipboard-write"`; without either the older `execCommand("copy")` on a hidden field
 * still works from a click. Resolves `false` when neither could.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // blocked by permissions policy or a missing gesture: try the fallback
  }
  if (typeof document === "undefined") return false;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.setAttribute("aria-hidden", "true");
  field.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";
  const active = document.activeElement as HTMLElement | null;
  document.body.appendChild(field);
  try {
    field.select();
    field.setSelectionRange(0, text.length);
    return typeof document.execCommand === "function" ? document.execCommand("copy") : false;
  } catch {
    return false;
  } finally {
    field.remove();
    active?.focus?.();
  }
}
