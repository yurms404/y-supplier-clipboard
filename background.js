importScripts("storage/local-images.js");

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (!contexts.length) await chrome.offscreen.createDocument({
    url: "offscreen.html", reasons: ["CLIPBOARD"], justification: "Copy the extracted product text after a user command."
  });
}

const UPDATE_ENDPOINT = "https://api.github.com/repos/yurms404/y-supplier-clipboard/releases/latest";
const UPDATE_CHECK_INTERVAL = 12 * 60 * 60 * 1000;

function versionParts(value) {
  const match = String(value || "").trim().match(/^v?(\d+(?:\.\d+){0,2})$/i);
  return match ? match[1].split(".").map(Number) : null;
}

function isNewerVersion(candidate, current) {
  const candidateParts = versionParts(candidate), currentParts = versionParts(current);
  if (!candidateParts || !currentParts) return false;
  for (let index = 0; index < 3; index++) {
    const difference = (candidateParts[index] || 0) - (currentParts[index] || 0);
    if (difference) return difference > 0;
  }
  return false;
}

async function checkForUpdate(force = false) {
  const currentVersion = chrome.runtime.getManifest().version;
  const { ysc_update_check: cached } = await chrome.storage.local.get("ysc_update_check");
  if (!force && cached?.localVersion === currentVersion && Date.now() - cached.checkedAt < UPDATE_CHECK_INTERVAL) return cached.update || null;
  try {
    const response = await fetch(UPDATE_ENDPOINT, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const release = await response.json();
    const version = String(release.tag_name || "").replace(/^v/i, "");
    const update = isNewerVersion(version, currentVersion) && /^https:\/\//.test(release.html_url || "")
      ? { version, url: release.html_url }
      : null;
    await chrome.storage.local.set({ ysc_update_check: { localVersion: currentVersion, checkedAt: Date.now(), update } });
    return update;
  } catch (_) {
    return cached?.localVersion === currentVersion ? cached.update || null : null;
  }
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

let savingLocalImage = false;
async function captureLocalImage(message, sender) {
  if (savingLocalImage) throw new Error("local_image_busy");
  savingLocalImage = true;
  let bitmap;
  try {
    if (!sender.tab?.id || sender.frameId !== 0) throw new Error("invalid_capture_region");
    const { ysc_local_image_settings: savedOptions } = await chrome.storage.local.get("ysc_local_image_settings");
    const options = YSCLocalImages.settings(savedOptions);
    const folder = await YSCLocalImages.writableDirectory(options);
    YSCLocalImages.subfolders(options, message.supplier);
    const [active] = await chrome.tabs.query({ active: true, windowId: sender.tab.windowId });
    if (active?.id !== sender.tab.id) throw new Error("capture_tab_not_active");
    const screenshot = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" });
    const [stillActive] = await chrome.tabs.query({ active: true, windowId: sender.tab.windowId });
    if (stillActive?.id !== sender.tab.id) throw new Error("capture_tab_not_active");
    bitmap = await createImageBitmap(await (await fetch(screenshot)).blob());
    const rect = YSCLocalImages.cropRect(message.rect, message.viewport, bitmap.width, bitmap.height);
    const target = YSCLocalImages.layout(rect.width, rect.height, options);
    const canvas = new OffscreenCanvas(target.width, target.height), context = canvas.getContext("2d");
    context.fillStyle = options.background; context.fillRect(0, 0, target.width, target.height);
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, target.x, target.y, target.drawWidth, target.drawHeight);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 });
    // A small preview stays in this page only; the full JPEG is written to the chosen folder.
    const scale = Math.min(1, 600 / Math.max(target.width, target.height));
    const preview = new OffscreenCanvas(Math.max(1, Math.round(target.width * scale)), Math.max(1, Math.round(target.height * scale)));
    preview.getContext("2d").drawImage(canvas, 0, 0, preview.width, preview.height);
    const bytes = new Uint8Array(await (await preview.convertToBlob({ type: "image/jpeg", quality: 0.8 })).arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    const filename = await YSCLocalImages.save(blob, message.name, folder, options, message.supplier);
    const leaf = filename.split("/").at(-1);
    return { ok: true, filename, path: YSCLocalImages.displayPath(options, folder.name, message.supplier, leaf), preview: `data:image/jpeg;base64,${btoa(binary)}` };
  } finally { bitmap?.close(); savingLocalImage = false; }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.type === "YSC_LOCAL_IMAGE_SETTINGS") {
    chrome.tabs.create({ url: chrome.runtime.getURL(`ui/local-images.html${sender.tab?.id ? `?returnTab=${sender.tab.id}` : ""}`) }).then(() => reply({ ok: true }), error => reply({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "YSC_LOCAL_IMAGE_READY") {
    (async () => {
      const { ysc_local_image_settings: saved } = await chrome.storage.local.get("ysc_local_image_settings");
      const options = YSCLocalImages.settings(saved);
      await YSCLocalImages.writableDirectory(options); YSCLocalImages.subfolders(options, message.supplier);
      return { ok: true };
    })().then(reply, error => reply({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "YSC_LOCAL_IMAGE_RETURN" && sender.url?.startsWith(chrome.runtime.getURL("ui/local-images.html"))) {
    (async () => {
      if (!Number.isInteger(message.tabId) || message.tabId <= 0 || message.tabId === sender.tab?.id) throw new Error("local_image_return_unavailable");
      const changed = await chrome.tabs.sendMessage(message.tabId, { type: "YSC_LOCAL_IMAGE_CHANGED" });
      if (!changed?.ok) throw new Error(changed?.error || "local_image_return_unavailable");
      await chrome.tabs.update(message.tabId, { active: true });
      return { ok: true };
    })().then(async result => { reply(result); if (sender.tab?.id) await chrome.tabs.remove(sender.tab.id).catch(() => {}); }, error => reply({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "YSC_CAPTURE_LOCAL_IMAGE") {
    captureLocalImage(message, sender).then(reply, error => reply({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "YSC_CHECK_UPDATE") {
    checkForUpdate(Boolean(message.force)).then(update => reply({ update })).catch(() => reply({ update: null }));
    return true;
  }
  if (message.type === "YSC_SAVE_STYLE") {
    chrome.downloads.download({
      url: `data:application/json;charset=utf-8,${encodeURIComponent(String(message.text || ""))}`,
      filename: String(message.filename || "style.ysc-style.json"), saveAs: true
    }).then(() => reply({ ok: true })).catch(error => reply({ ok: false, error: error.message }));
    return true;
  }
  if (message.type !== "YSC_COPY") return;
  ensureOffscreen()
    .then(() => chrome.runtime.sendMessage({ type: "YSC_OFFSCREEN_COPY", text: String(message.text || "") }))
    .then(result => reply(result?.ok ? result : { ok: false, error: result?.error || "Offscreen-документ не підтвердив копіювання." }))
    .catch(error => reply({ ok: false, error: error.message }));
  return true;
});
