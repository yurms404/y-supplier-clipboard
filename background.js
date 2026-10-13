async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (!contexts.length) await chrome.offscreen.createDocument({
    url: "offscreen.html", reasons: ["CLIPBOARD"], justification: "Copy the extracted product text after a user command."
  });
}

chrome.commands.onCommand.addListener(async command => {
  if (command !== "copy-product") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try { await chrome.tabs.sendMessage(tab.id, { type: "YSC_RUN" }); }
  catch (_) { await chrome.tabs.sendMessage(tab.id, { type: "YSC_NOTICE", text: "Оновіть сторінку та спробуйте ще раз." }).catch(() => {}); }
});

chrome.action.onClicked.addListener(async tab => {
  if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: "YSC_CONFIGURE" }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message.type !== "YSC_COPY") return;
  ensureOffscreen()
    .then(() => chrome.runtime.sendMessage({ type: "YSC_OFFSCREEN_COPY", text: String(message.text || "") }))
    .then(result => reply(result?.ok ? result : { ok: false, error: result?.error || "Offscreen-документ не підтвердив копіювання." }))
    .catch(error => reply({ ok: false, error: error.message }));
  return true;
});
