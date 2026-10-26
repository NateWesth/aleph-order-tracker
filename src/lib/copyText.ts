/** Copy on browsers/webviews, with a fallback when clipboard permission is denied. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* Try webview fallback. */ }
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  // Keep inside an active modal so its focus trap does not interrupt selection.
  const host = document.querySelector('[role="dialog"][data-state="open"]') || document.body;
  host.appendChild(field);
  const previous = document.activeElement;
  field.focus();
  field.select();
  field.setSelectionRange(0, text.length);
  let copied = false;
  try { copied = document.execCommand("copy"); }
  finally { field.remove(); if (previous instanceof HTMLElement) previous.focus(); }
  if (!copied) throw new Error("Clipboard access is unavailable. Select the text and copy it manually.");
}