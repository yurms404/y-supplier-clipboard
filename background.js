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

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
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
