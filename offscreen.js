chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message.type !== "YSC_OFFSCREEN_COPY") return;
  async function copy(text) {
    // Clipboard API is preferred, but Chromium can reject it in an offscreen
    // document when there is no transient page focus. execCommand is the
    // documented DOM fallback for that execution context.
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    } catch (clipboardError) {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("aria-hidden", "true");
      Object.assign(area.style, { position: "fixed", opacity: "0", pointerEvents: "none" });
      document.body.append(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      return copied ? { ok: true } : { ok: false, error: clipboardError.message || "Браузер відхилив запис у буфер." };
    }
  }
  copy(String(message.text || "")).then(reply, error => reply({ ok: false, error: error.message }));
  return true;
});
