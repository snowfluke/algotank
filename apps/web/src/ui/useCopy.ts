import { useState } from "react";

/**
 * Copies text to the clipboard. `onBlocked` runs when the browser refuses (the page
 * is not secure, or the click is not a gesture), so the caller can select the text for a manual copy.
 */
export function useCopy(text: string, onBlocked: () => void): { readonly copied: boolean; copy(): Promise<void> } {
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      onBlocked();
      setCopied(false);
    }
  }
  return { copied, copy };
}
