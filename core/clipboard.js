/* Worker-side clipboard adapter. Offscreen document owns the DOM clipboard API. */
globalThis.YSCClipboard = (() => {
  let creating;
  async function hasDocument() {
    const url = chrome.runtime.getURL("offscreen.html");
    if (typeof chrome.runtime.getContexts === "function") {
      const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
      return contexts.length > 0;
    }
    // Chrome 109–115: the worker's clients API predates runtime.getContexts.
    const clients = await globalThis.clients.matchAll();
    return clients.some(client => client.url === url);
  }
  async function ensureDocument() {
    if (typeof chrome.offscreen?.createDocument !== "function") {
      throw new Error("Для копіювання потрібен Chrome/Chromium 109 або новіший із підтримкою offscreen.");
    }
    if (creating) return creating;
    creating = (async () => {
      if (await hasDocument()) return;
      try {
        await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["CLIPBOARD"],
          justification: "Copy the extracted product text after a user command." });
      } catch (error) {
        if (!(await hasDocument())) throw error;
      }
    })();
    try { await creating; } finally { creating = undefined; }
  }
  return Object.freeze({ async copy(text) {
    await ensureDocument();
    const result = await chrome.runtime.sendMessage({ type: "YSC_OFFSCREEN_COPY", text: String(text || "") });
    if (!result?.ok) throw new Error(result?.error || "Clipboard copy failed");
    return result;
  } });
})();
