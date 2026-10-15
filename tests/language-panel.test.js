// Render the real content script with a small DOM shim. This is not a browser test.
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.childNodes = []; this.style = {}; this.listeners = {}; this.textContent = ""; }
  get children() { return this.childNodes.filter(n => n.tagName !== "#TEXT"); }
  get parentElement() { return this.parent || null; }
  get isConnected() { return this === root || Boolean(this.parent?.isConnected); }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parent = this; this.childNodes.push(node); } }
  remove() { if (this.parent) this.parent.childNodes.splice(this.parent.childNodes.indexOf(this), 1); this.parent = null; }
  after(node) { const parent = this.parent; node.remove(); node.parent = parent; parent.childNodes.splice(parent.childNodes.indexOf(this) + 1, 0, node); }
  replaceWith(node) { this.after(node); this.remove(); }
  addEventListener(event, listener) { this.listeners[event] = listener; }
  setAttribute(name, value) { this[name] = value; }
  querySelectorAll(selector) {
    const matches = node => selector.startsWith("#") ? node.id === selector.slice(1) : selector.startsWith(".") ? node.className === selector.slice(1) : selector === "details[open]" ? node.tagName === "DETAILS" && node.open : node.tagName === selector.toUpperCase();
    const found = [];
    for (const node of this.childNodes) { if (matches(node)) found.push(node); found.push(...node.querySelectorAll(selector)); }
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
const root = new Element("html");
const document = { documentElement: root, createElement: tag => new Element(tag), createTextNode: value => Object.assign(new Element("#text"), { textContent: value }) };
const profile = { id: "viyar", domain: "viyar.example", supplier: "VIYAR", fields: Object.fromEntries(["article", "name", "price", "unit"].map(key => [key, { enabled: true, source: "auto" }])), format: {} };
let stored = {}, listener, availableUpdate = null;
const picked = [], exportedStyles = [];
const localImageMessages = [];
const scrollFrames = [];
let domainProfiles = [], allowDelete = true;
const deletedDomains = [], confirmations = [];
const navigations = [], selectedProfiles = [], rememberedPages = [];
const product = { supplier: "VIYAR", article: "190218", name: "Гвинт цинк", price: "1.02", unit: "шт", imageUrl: "https://images.example/one.jpg", productDetected: true, candidates: { article: ["190218"], name: ["Гвинт цинк"], price: ["1.02"], unit: ["шт"], imageUrl: ["https://images.example/one.jpg", "https://images.example/two.jpg"] } };
const context = {
  crypto: require("node:crypto"), TextEncoder, requestAnimationFrame: callback => scrollFrames.push(callback),
  document, structuredClone, location: { hostname: "viyar.example", href: "https://viyar.example/product?variant=18#details", assign(url) { navigations.push(url); } }, setTimeout: () => 0,
  fetch: async url => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(url.replace("chrome-extension://test/", ""), "utf8")) }),
  confirm: message => { confirmations.push(message); return allowDelete; },
  YSCProfiles: {
    get: async () => structuredClone(profile), all: async () => structuredClone(domainProfiles),
    remember: async (p, url) => { rememberedPages.push(url); return { lastUrl: url }; },
    select: async id => { selectedProfiles.push(id); },
    pageUrl: (value, domain) => { try { const url = new URL(value); return /^https?:$/.test(url.protocol) && url.hostname === domain && !url.username && !url.password ? url.href : ""; } catch { return ""; } },
    removeDomain: async domain => { deletedDomains.push(domain); domainProfiles = domainProfiles.filter(p => p.domain !== domain); }
  },
  YSCParser: { parse: () => structuredClone(product), removeBlocked: value => value },
  YSCPicker: { stop() {}, start(key, callback, cancelCallback) { picked.push(key); this.callback = callback; this.cancel = cancelCallback; }, startRegion(instructions, callback, cancelCallback) { this.regionInstructions = instructions; this.regionCallback = callback; this.regionCancel = cancelCallback; } },
  chrome: {
    storage: { local: { get: async () => ({ ...stored }), set: async value => Object.assign(stored, value) } },
    runtime: { getManifest: () => JSON.parse(fs.readFileSync("manifest.json", "utf8")), getURL: path => `chrome-extension://test/${path}`, sendMessage: async message => { if (message.type.startsWith("YSC_LOCAL_IMAGE") || message.type === "YSC_CAPTURE_LOCAL_IMAGE") { localImageMessages.push(message); return { ok: true, filename: "Product.jpg", path: "C:\\Images\\Catalog\\VIYAR\\Product.jpg", preview: "data:image/jpeg;base64,AAAA" }; } if (message.type === "YSC_SAVE_STYLE") exportedStyles.push(message); else if (message.type === "YSC_CHECK_UPDATE") return { update: availableUpdate }; else copied.push(message.text); return { ok: true }; }, onMessage: { addListener: callback => { listener = callback; } } }
  }
};
vm.createContext(context);
for (const path of ["ui/i18n.js", "core/formatter.js", "storage/work-styles.js", "storage/local-images.js", "content.js"]) vm.runInContext(fs.readFileSync(path, "utf8"), context);
const settle = () => new Promise(resolve => setImmediate(resolve));
const copied = [];
(async () => {
  const originalImage = product.imageUrl, originalImages = product.candidates.imageUrl;
  product.imageUrl = "";
  for (const missingImages of [[], undefined]) {
    product.candidates.imageUrl = missingImages;
    listener({ type: "YSC_CONFIGURE" }); await settle();
    const missingPanel = root.querySelector("#ysc-panel");
    assert.equal(missingPanel.querySelector("#ysc-image-choice").textContent, "Зображення не вдалось визначити");
    assert.equal(missingPanel.querySelector("#ysc-image-previous"), null);
    assert.equal(missingPanel.querySelector("#ysc-image-next"), null);
    const imagePicker = missingPanel.querySelector("#ysc-pick-image");
    assert.equal(imagePicker.ariaLabel, "Вибрати зображення товару на сторінці");
    assert.ok(imagePicker.querySelector(".ysc-cursor-icon"));
    imagePicker.onclick();
    assert.equal(picked.at(-1), "imageUrl");
    assert.equal(missingPanel.style.display, "none");
    context.YSCPicker.cancel();
    assert.equal(missingPanel.style.display, "flex", "Cancelling image selection restores the missing-image panel");
    let prevented = false;
    imagePicker.onkeydown({ key: "Enter", preventDefault() { prevented = true; } });
    assert.ok(prevented);
    assert.equal(missingPanel.style.display, "none", "The missing-image picker is keyboard accessible");
    context.YSCPicker.cancel();
    const localPicker = missingPanel.querySelector("#ysc-pick-local-image");
    assert.ok(localPicker.querySelector(".ysc-capture-square"), "Local capture has a distinct square beside the cursor");
    await localPicker.onclick();
    assert.equal(localImageMessages.at(-1).type, "YSC_LOCAL_IMAGE_READY");
    assert.equal(missingPanel.style.display, "none");
    context.YSCPicker.regionCancel();
    assert.equal(missingPanel.style.display, "flex");
    const correctedArticle = missingPanel.querySelector("#ysc-value-article");
    correctedArticle.value = "190218-local"; correctedArticle.listeners.input();
    await localPicker.onclick();
    await context.YSCPicker.regionCallback({ rect: { x: 10, y: 20, width: 100, height: 80 }, viewport: { width: 800, height: 600 } });
    assert.equal(localImageMessages.at(-1).name, "VIYAR 190218-local Гвинт цинк", "JPEG uses the ready name including manual corrections");
    let capturedPanel = root.querySelector("#ysc-panel");
    assert.match(capturedPanel.querySelector(".ysc-product-image-stage").style["--ysc-product-image"], /data:image\/jpeg;base64,AAAA/);
    assert.equal(capturedPanel.querySelector("#ysc-image-choice").textContent, "Скриншот", "A saved screenshot replaces the missing-image status");
    assert.equal(capturedPanel.querySelector("#ysc-value-article").value, "190218-local", "Screenshot capture preserves edited product data");
    stored.ysc_local_image_settings = { path: "C:\\Images", confirmedPath: "C:\\Images", subfolder: "Catalog/{supplier}" };
    stored.ysc_local_image_folder_name = "Images";
    const copiesBeforeReturn = copied.length;
    await new Promise(resolve => listener({ type: "YSC_LOCAL_IMAGE_CHANGED" }, {}, resolve));
    capturedPanel = root.querySelector("#ysc-panel");
    assert.equal(capturedPanel.querySelector("#ysc-local-image-path").textContent, "C:\\Images\\Catalog\\VIYAR");
    assert.equal(capturedPanel.querySelector("#ysc-value-article").value, "190218-local", "Returning from folder settings keeps manual edits");
    assert.equal(copied.length, copiesBeforeReturn, "Returning updates the panel without triggering copy-and-close");
    await capturedPanel.querySelector("#ysc-local-image-folder").onclick();
    assert.equal(localImageMessages.at(-1).type, "YSC_LOCAL_IMAGE_SETTINGS");
    const preferencesBeforeImageExport = structuredClone(stored), copiesBeforeImageExport = copied.length;
    const setImageColumn = async (column, value) => {
      const field = root.querySelector(`#ysc-excel-column-${column}`); field.value = value; await field.onchange();
    };
    await setImageColumn("A", "imageUrl"); await setImageColumn("D", "imageFormula");
    const savedPath = "C:\\Images\\Catalog\\VIYAR\\Product.jpg";
    assert.deepEqual(root.querySelectorAll(".ysc-preview-data").map(cell => cell.textContent), [savedPath, `=IMAGE("${savedPath}")`]);
    const imageOption = root.querySelector("#ysc-excel-column-A").children.find(option => option.value === "imageUrl");
    assert.equal(imageOption.textContent, "Шлях до локального зображення");
    await root.querySelector("#ysc-copy").onclick();
    assert.equal(copied.at(-1), savedPath, "A local screenshot copies even when no website image URL was found");
    root.querySelector("#ysc-settings").open = false;
    await root.querySelector("#ysc-copy").onclick();
    assert.equal(copied.at(-1), `=IMAGE("${savedPath}")`, "The image formula uses the same saved file");
    stored = preferencesBeforeImageExport; copied.length = copiesBeforeImageExport;
    capturedPanel.remove();
    delete stored.ysc_local_image_settings; delete stored.ysc_local_image_folder_name;
  }
  product.imageUrl = originalImage; product.candidates.imageUrl = originalImages;
  console.log("Missing-image message, manual picker, cancellation and keyboard access passed");
  listener({ type: "YSC_CONFIGURE" }); await settle();
  let panel = root.querySelector("#ysc-panel");
  assert.equal(panel.lang, "uk");
  assert.ok(panel.querySelector("#ysc-pick-local-image"), "Local capture also exists when online images are detected");
  assert.equal(panel.querySelectorAll("#ysc-excel-settings").length, 1, "Only one style layout editor exists");
  assert.equal(panel.querySelector("#ysc-style-settings").hidden, true);
  panel.querySelector("#ysc-style-edit").onclick();
  assert.equal(panel.querySelector("#ysc-style-settings").hidden, false);
  assert.ok(!panel.querySelector("#ysc-settings").open, "Style editor does not open app settings");
  panel.querySelector("#ysc-style-edit").onclick();
  assert.equal(panel.querySelector("#ysc-style-settings").hidden, true);
  const settingsMenu = panel.querySelector("#ysc-settings");
  assert.ok(settingsMenu.children.slice(1).every(child => child.tagName === "DETAILS"), "Settings opens as a list of collapsed subsections");
  assert.equal(settingsMenu.children[1].id, "ysc-global-settings");
  const globals = panel.querySelector("#ysc-global-settings"), localSettings = panel.querySelector("#ysc-local-image-settings"), profiles = panel.querySelector("#ysc-profiles");
  assert.equal(globals.querySelector("summary").textContent, "Глобальні");
  assert.ok(globals.querySelector("#ysc-language")); assert.ok(globals.querySelector("#ysc-accent-color"));
  assert.ok(!globals.querySelector("#ysc-local-image-folder"));
  assert.equal(globals.name, localSettings.name);
  assert.notEqual(globals.name, settingsMenu.name, "Opening a subsection must not close its ancestor");
  settingsMenu.open = true;
  const openSection = section => { section.open = true; section.listeners.toggle({ target: section }); };
  openSection(globals); openSection(localSettings);
  assert.equal(globals.open, false); assert.equal(settingsMenu.open, true);
  const scrollBody = panel.querySelector(".ysc-body");
  scrollBody.scrollTop = 100;
  scrollBody.getBoundingClientRect = () => ({ bottom: 800 });
  localSettings.getBoundingClientRect = () => ({ bottom: 1200 });
  let scrollTarget;
  scrollBody.scrollTo = options => { scrollTarget = options; };
  scrollFrames.splice(0).forEach(callback => callback());
  assert.equal(scrollTarget.top, 508, "Opening a settings subsection scrolls its last line into the panel viewport");
  assert.equal(scrollTarget.behavior, "smooth");
  openSection(profiles); assert.equal(localSettings.open, false);
  const nestedTools = panel.querySelector("#ysc-profile-tools"); openSection(nestedTools);
  assert.equal(profiles.open, true, "Nested settings keep their parent open");
  await settle();
  assert.ok(stored.ysc_settings_sections.includes("ysc-profiles"));
  assert.ok(!stored.ysc_settings_sections.includes("ysc-profile-tools"), "Only the main settings subsection is remembered");
  settingsMenu.open = false; settingsMenu.listeners.toggle({ target: settingsMenu });
  profiles.open = false;
  openSection(settingsMenu);
  assert.equal(profiles.open, true, "Reopening all settings restores the last active subsection");
  assert.equal(nestedTools.open, false, "Reopening all settings keeps administrative subsections collapsed");
  openSection(nestedTools);
  profiles.open = false; openSection(profiles);
  assert.equal(nestedTools.open, false, "Reopening a parent never automatically expands nested sections");
  assert.equal(globals.open, false, "Restoration keeps the accordion exclusive");
  nestedTools.open = false; profiles.open = false; settingsMenu.open = false;
  const accent = panel.querySelector("#ysc-accent-color"); accent.value = "#9933cc"; await accent.onchange();
  panel = root.querySelector("#ysc-panel");
  assert.equal(stored.ysc_accent_color, "#9933cc");
  assert.equal(panel.style["--ysc-accent"], "#9933cc");
  assert.equal(panel.querySelector("#ysc-accent-color-button").textContent, "R 153 G 51 B 204");
  assert.equal(panel.querySelector("#ysc-image-choice").textContent, "Зображення 1 з 2");
  panel.querySelector("#ysc-image-next").onclick();
  panel = root.querySelector("#ysc-panel");
  assert.equal(panel.querySelector("#ysc-image-choice").textContent, "Зображення 2 з 2");
  const imageStage = panel.querySelector(".ysc-product-image-stage");
  assert.match(imageStage.style["--ysc-product-image"], /two\.jpg/);
  assert.equal(imageStage.style["--ysc-image-overlay-opacity"], "50%");
  await panel.querySelector("#ysc-pick-local-image").onclick();
  await context.YSCPicker.regionCallback({ rect: { x: 10, y: 20, width: 100, height: 80 }, viewport: { width: 800, height: 600 } });
  panel = root.querySelector("#ysc-panel");
  assert.equal(panel.querySelector("#ysc-excel-column-A").children.find(option => option.value === "imageUrl").textContent, "Шлях до локального зображення");
  panel.querySelector("#ysc-image-next").onclick(); panel = root.querySelector("#ysc-panel");
  assert.equal(panel.querySelector("#ysc-excel-column-A").children.find(option => option.value === "imageUrl").textContent, "URL зображення товару", "Selecting a website image clears the local export source");
  panel.querySelector("#ysc-settings").open = true;
  openSection(panel.querySelector("#ysc-global-settings"));
  assert.equal(panel.querySelector("#ysc-help-mode").children.find(option => option.selected).value, "novice");
  assert.ok(panel.querySelectorAll(".ysc-explanation").length > 10, "Beginner mode adds contextual explanations to settings controls");
  assert.ok(panel.querySelectorAll(".ysc-explanation").every(hint => !hint.hidden));
  const editedName = panel.querySelector("#ysc-value-name"); editedName.value = "Гвинт цинк — вручну"; editedName.listeners.input();
  let modeSelect = panel.querySelector("#ysc-help-mode"); modeSelect.value = "pro"; await modeSelect.onchange();
  panel = root.querySelector("#ysc-panel");
  assert.equal(stored.ysc_help_mode, "pro");
  assert.ok(panel.querySelectorAll(".ysc-explanation").every(hint => hint.hidden), "Pro hides the extended explanations");
  assert.equal(panel.querySelector(".ysc-excel-session-hint").hidden, true, "Pro hides existing copy guidance too");
  assert.equal(panel.querySelector("#ysc-help-description").hidden, true);
  assert.equal(panel.querySelector("#ysc-value-name").value, "Гвинт цинк — вручну", "Help mode does not reparse or discard manual corrections");
  assert.ok(panel.querySelector(".ysc-excel-steps").querySelector("button"), "Copy actions remain available in Pro");
  assert.ok(panel.querySelector("#ysc-local-image-path"), "The effective local path remains available in Pro");
  const blacklistArea = panel.querySelector("#ysc-blacklist").querySelector("textarea");
  blacklistArea.value = Array.from({ length: 101 }, (_, index) => `phrase-${index}`).join("\n"); await blacklistArea.oninput();
  assert.equal(panel.querySelector("#ysc-blacklist-status").hidden, false, "Pro must still show validation errors");
  assert.match(panel.querySelector("#ysc-blacklist-status").textContent, /100/);
  panel.remove(); listener({ type: "YSC_CONFIGURE" }); await settle(); panel = root.querySelector("#ysc-panel");
  assert.equal(panel.querySelector("#ysc-help-mode").children.find(option => option.selected).value, "pro", "Help mode survives reopening the panel");
  modeSelect = panel.querySelector("#ysc-help-mode"); modeSelect.value = "novice"; await modeSelect.onchange(); panel = root.querySelector("#ysc-panel");
  assert.equal(stored.ysc_help_mode, "novice");
  assert.ok(panel.querySelectorAll(".ysc-explanation").every(hint => !hint.hidden));
  assert.equal(panel.querySelector(".ysc-excel-session-hint").hidden, false);
  console.log("Beginner/Pro: contextual and existing hints, persistent global choice and manual-data preservation passed");
  const help = panel.querySelector("#ysc-help");
  assert.equal(panel.querySelector("#ysc-settings").children.at(-1), help);
  assert.equal(help.querySelector("#ysc-help-name").textContent, "Y Supplier Clipboard");
  assert.match(help.querySelector("#ysc-help-description").textContent, /буфер обміну постачальника/);
  assert.equal(help.querySelector("#ysc-revision-date").textContent, "Дата редакції: 15.10.2026");
  assert.equal(help.querySelector("#ysc-code-version").textContent, `Версія коду: ${JSON.parse(fs.readFileSync("manifest.json", "utf8")).version}`);
  assert.deepEqual(help.querySelectorAll("a").map(a => a.href), ["chrome-extension://test/ui/help.html?doc=readme", "chrome-extension://test/ui/help.html?doc=license", "https://web.telegram.org/a/#-1001323392064_1018"]);
  const checkUpdate = help.querySelector("#ysc-check-update");
  assert.equal(checkUpdate.textContent, "Перевірити оновлення");
  await checkUpdate.onclick();
  assert.equal(help.querySelector("#ysc-update-status").textContent, `У вас встановлено найновішу версію ${JSON.parse(fs.readFileSync("manifest.json", "utf8")).version}.`);
  availableUpdate = { version: "2.11.0", url: "https://github.com/yurms404/y-supplier-clipboard/releases/tag/v2.11.0" };
  await checkUpdate.onclick();
  assert.equal(panel.querySelectorAll("#ysc-update-banner").length, 1);
  await checkUpdate.onclick();
  assert.equal(help.querySelector("#ysc-update-status").textContent, "Доступне оновлення 2.11.0", "An existing banner must not make a repeated check report the installed version as latest");
  assert.equal(panel.querySelectorAll("#ysc-update-banner").length, 1, "Repeated checks do not duplicate the banner");
  availableUpdate = null;
  panel.querySelector("#ysc-settings").open = true;
  openSection(panel.querySelector("#ysc-global-settings"));
  const article = panel.querySelector("#ysc-value-article"); article.value = "190218-corrected"; article.listeners.input();
  let select = panel.querySelector("#ysc-language"); select.value = "en"; await select.onchange();
  panel = root.querySelector("#ysc-panel");
  assert.equal(panel.lang, "en");
  assert.equal(panel.querySelector("#ysc-revision-date").textContent, "Revision date: 15.10.2026");
  assert.equal(panel.querySelector("#ysc-copy").textContent, "Copy → A");
  assert.equal(panel.querySelector("#ysc-value-article").value, "190218-corrected");
  assert.equal(panel.querySelector("#ysc-value-name").value, "Гвинт цинк");
  assert.equal(panel.querySelector("#ysc-settings").open, true);
  assert.equal(panel.querySelector("#ysc-global-settings").open, true, "Changing language keeps the active settings subsection open");
  assert.equal(panel.querySelector("#ysc-local-image-settings").open, false);
  assert.equal(stored.ysc_language, "en");
  select = panel.querySelector("#ysc-language"); select.value = "ru"; await select.onchange();
  assert.equal(root.querySelector("#ysc-copy").textContent, "Скопировать → A");
  root.querySelector("#ysc-panel").remove();
  listener({ type: "YSC_CONFIGURE" }); await settle();
  assert.equal(root.querySelector("#ysc-panel").lang, "ru");
  assert.equal(root.querySelector("#ysc-global-settings").open, true, "Recreating the panel restores the stored settings subsection");
  assert.equal(root.querySelector("#ysc-language").children.find(option => option.selected).value, "ru");
  console.log("Panel language switching, persisted preference and manual edits passed");
  assert.deepEqual(root.querySelector("#ysc-language").children.map(option => option.value), ["uk", "en", "ru", "de", "pl", "et", "lv"]);
  for (const [language, settingsText] of [["de", "Einstellungen"], ["pl", "Ustawienia"], ["et", "Seaded"], ["lv", "Iestatījumi"]]) {
    const articleBeforeLanguageSwitch = root.querySelector("#ysc-value-article").value;
    const languageSelect = root.querySelector("#ysc-language"); languageSelect.value = language; await languageSelect.onchange();
    assert.equal(root.querySelector("#ysc-panel").lang, language);
    assert.equal(root.querySelector("#ysc-settings").querySelector("summary").textContent, settingsText);
    assert.equal(root.querySelector("#ysc-value-article").value, articleBeforeLanguageSwitch);
    assert.equal(stored.ysc_language, language);
    root.querySelector("#ysc-panel").remove(); listener({ type: "YSC_CONFIGURE" }); await settle();
    assert.equal(root.querySelector("#ysc-panel").lang, language, "New language survives reopening");
  }
  const returnToRussian = root.querySelector("#ysc-language"); returnToRussian.value = "ru"; await returnToRussian.onchange();
  root.querySelector("#ysc-panel").remove();
  profile.format.sheet = true;
  for (const key of ["sheetLength", "sheetWidth"]) profile.fields[key] = { enabled: true, source: "auto" };
  Object.assign(product, { unit: "лист", sheetLength: "2800", sheetWidth: "2070" });
  stored.ysc_excel_mode = true;
  delete stored.ysc_work_styles;
  listener({ type: "YSC_RUN" }); await settle();
  panel = root.querySelector("#ysc-panel");
  assert.ok(panel, "Sheet mode must open the panel, never auto-copy");
  const targets = panel.querySelectorAll(".ysc-preview-target");
  assert.deepEqual(targets.map(label => label.textContent), ["B:", "E:F:"]);
  const previewData = panel.querySelectorAll(".ysc-preview-data");
  assert.equal(previewData[0].textContent, "VIYAR 190218 Гвинт цинк");
  assert.equal(previewData[1].textContent, "лист (2,8*2,07)\t1,02");
  assert.ok(targets.every(label => label.tagName === "DIV" && label.parent.className === "ysc-preview-block"));
  await panel.querySelector("#ysc-copy").onclick();
  assert.equal(copied.length, 0, "Unconfirmed dimensions must block clipboard writes");
  panel.querySelector("#ysc-sheet-confirm").onclick();
  const width = panel.querySelector("#ysc-value-sheetWidth"); width.value = "2080"; width.listeners.input();
  assert.equal(panel.querySelectorAll(".ysc-preview-data")[1].textContent, "лист (2,8*2,08)\t1,02");
  assert.deepEqual(panel.querySelectorAll(".ysc-preview-target").map(label => label.textContent), ["B:", "E:F:"]);
  await panel.querySelector("#ysc-copy").onclick();
  assert.equal(copied.length, 0, "Changing a dimension must invalidate confirmation");
  panel.querySelector("#ysc-sheet-confirm").onclick();
  await panel.querySelector("#ysc-copy").onclick();
  assert.equal(copied.length, 1);
  panel = root.querySelector("#ysc-panel");
  await panel.querySelector("#ysc-copy").onclick();
  assert.equal(copied[1], "лист (2,8*2,08)\t1,02");
  listener({ type: "YSC_RUN" }); await settle();
  await root.querySelector("#ysc-copy").onclick();
  assert.equal(copied.length, 2, "Reopening a product must require fresh confirmation");
  console.log("Sheet panel confirmation, edit invalidation and safe Excel blocks passed");
  stored.ysc_excel_mode = false;
  delete stored.ysc_work_styles;
  Object.assign(product, { unit: "", price: "", sheetLength: "", sheetWidth: "" });
  root.querySelector("#ysc-panel").remove();
  listener({ type: "YSC_RUN" }); await settle();
  assert.equal(copied.length, 3, "CAD must auto-copy without sheet dimensions, unit or price");
  assert.equal(copied[2], "VIYAR 190218 Гвинт цинк");
  listener({ type: "YSC_CONFIGURE" }); await settle();
  await root.querySelector("#ysc-copy").onclick();
  assert.equal(copied.length, 4, "CAD panel copy must not require sheet confirmation either");
  assert.equal(copied[3], "VIYAR 190218 Гвинт цинк");
  console.log("CAD sheet mode ignores dimensions, price and unit for shortcut and panel copying");
  listener({ type: "YSC_CONFIGURE" }); await settle();
  panel = root.querySelector("#ysc-panel");
  const thickness = panel.querySelector("#ysc-value-sheetThickness");
  assert.equal(thickness.parent.parent.parent.className, "ysc-sheet-meta");
  assert.equal(panel.querySelector("#ysc-sheet-input-unit").parent.parent.className, "ysc-sheet-meta");
  thickness.value = "18"; thickness.listeners.input();
  assert.equal(panel.querySelector(".ysc-preview-data").textContent, "VIYAR 190218 Гвинт цинк - 18");
  await panel.querySelector("#ysc-copy").onclick();
  assert.equal(copied[4], "VIYAR 190218 Гвинт цинк - 18");
  console.log("Compact thickness row and manual thickness in full CAD name passed");
  listener({ type: "YSC_CONFIGURE" }); await settle();
  panel = root.querySelector("#ysc-panel");
  const keys = ["article", "name", "price", "unit", "sheetLength", "sheetWidth", "sheetThickness"];
  assert.equal(panel.querySelectorAll(".ysc-field-picker").length, keys.length);
  assert.equal(panel.querySelectorAll(".ysc-pickers").length, 0);
  for (const key of keys) {
    const field = panel.querySelector(`#ysc-value-${key}`);
    const button = panel.querySelector(`#ysc-pick-${key}`);
    assert.equal(button.parent, field.parent, `${key}: icon must be embedded with its input`);
    assert.equal(button.textContent, "");
    const cursor = button.querySelector(".ysc-cursor-icon");
    assert.ok(cursor, `${key}: picker uses a cursor silhouette instead of a text arrow`);
    assert.equal(cursor["aria-hidden"], "true");
    assert.ok(button.title.length > 5);
    assert.equal(button.ariaLabel, button.title);
    assert.equal(button.type, "button");
    button.onclick();
    assert.equal(picked.at(-1), key);
  }
  assert.equal(panel.querySelector("#ysc-pick-article").title, "Выбрать артикул на странице");
  console.log("Seven inline picker icons: placement, translated hints, accessibility and field routing passed");
  panel.remove();
  stored.ysc_excel_mode = true;
  delete stored.ysc_work_styles;
  profile.format.sheet = false;
  Object.assign(product, { price: "1.02", unit: "шт" });
  product.candidates.price = ["1.02", "10.20"];
  product.candidates.unit = ["шт", "лист"];
  const beforeCopy = copied.length;
  listener({ type: "YSC_RUN" }); await settle();
  panel = root.querySelector("#ysc-panel");
  assert.ok(panel, "Alternatives still open the panel for review");
  for (const key of ["price", "unit"]) {
    assert.equal(panel.querySelector(`#ysc-choice-${key}`).children.find(option => option.selected).value, product[key]);
  }
  await panel.querySelector("#ysc-copy").onclick();
  assert.equal(copied.length, beforeCopy + 1, "Shown values must copy without explicit selection of alternatives");
  panel = root.querySelector("#ysc-panel");
  await panel.querySelector("#ysc-copy").onclick();
  assert.equal(copied.at(-1), "шт\t1,02");
  assert.equal(copied.length, beforeCopy + 2);
  for (const invalid of [{ unit: "", price: "1.02" }, { unit: "шт", price: "bad" }]) {
    Object.assign(product, invalid);
    listener({ type: "YSC_CONFIGURE" }); await settle();
    await root.querySelector("#ysc-copy").onclick();
    assert.equal(copied.length, beforeCopy + 2, "Missing unit or invalid price must still block Excel copying");
    root.querySelector("#ysc-panel").remove();
  }
  Object.assign(product, { unit: "лист", price: "1.02", sheetLength: "2800", sheetWidth: "2070" });
  profile.format.sheet = true;
  listener({ type: "YSC_CONFIGURE" }); await settle();
  await root.querySelector("#ysc-copy").onclick();
  assert.equal(copied.length, beforeCopy + 2, "Sheet confirmation remains mandatory despite accepting price/unit alternatives");
  console.log("Shown Excel values accepted; alternatives optional; invalid data and sheet confirmation still enforced");
  profile.format.sheet = false;
  stored.ysc_language = "uk";
  for (const [layout, hint] of [
    [{ name: 2, unit: 5, price: 6 }, "Сесій копіювання: 2 — B → E:F."],
    [{ name: 2, unit: 3, price: 4 }, "Одна сесія копіювання — B:D."],
    [{ name: 2, unit: 4, price: 6 }, "Сесій копіювання: 3 — B → D → F."]
  ]) {
    root.querySelector("#ysc-panel").remove();
    stored.ysc_excel_layout = layout;
    delete stored.ysc_work_styles;
    listener({ type: "YSC_CONFIGURE" }); await settle();
    assert.ok(root.querySelector(".ysc-excel-session-hint").textContent.startsWith(hint));
  }
  console.log("Dynamic Excel hints explain one, two and three copy sessions for selected column layouts");
  panel = root.querySelector("#ysc-panel");
  assert.equal(panel.querySelector(".ysc-excel-row").querySelectorAll("select").length, 26);
  assert.equal(panel.querySelectorAll(".ysc-excel-mapping").length, 0, "Old field-to-column controls are removed");
  const expectedOptions = ["skip", "fullName", "supplier", "article", "name", "unit", "plainUnit", "price", "currency", "sheetLength", "sheetWidth", "sheetThickness", "sheetSize", "url", "imageUrl", "imageFormula", "join", "anyText"];
  assert.deepEqual(panel.querySelector("#ysc-excel-column-A").children.map(option => option.value), expectedOptions);
  panel.querySelector(".ysc-excel-row").scrollLeft = 1200;
  panel.querySelector("#ysc-settings").open = true; panel.querySelector("#ysc-style-settings").hidden = false;
  let columnSelect = panel.querySelector("#ysc-excel-column-Z"); columnSelect.value = "supplier"; await columnSelect.onchange();
  panel = root.querySelector("#ysc-panel");
  assert.equal(stored.ysc_work_styles.find(s => s.id === stored.ysc_work_style).format.excelColumns[25], "supplier");
  assert.equal(panel.querySelector(".ysc-excel-row").scrollLeft, 1200);
  assert.equal(panel.querySelector("#ysc-style-settings").hidden, false);
  panel.remove();
  listener({ type: "YSC_CONFIGURE" }); await settle();
  panel = root.querySelector("#ysc-panel");
  assert.equal(panel.querySelector("#ysc-excel-column-Z").children.find(option => option.selected).value, "supplier", "Column layout persists across reopening");
  for (const [column, key] of [["B", "supplier"], ["C", "article"], ["D", "skip"], ["E", "name"], ["F", "skip"], ["Z", "skip"]]) {
    columnSelect = root.querySelector(`#ysc-excel-column-${column}`); columnSelect.value = key; await columnSelect.onchange();
  }
  panel = root.querySelector("#ysc-panel");
  for (const [key, value] of [["unit", ""], ["price", "bad"]]) {
    const field = panel.querySelector(`#ysc-value-${key}`); field.value = value; field.listeners.input();
  }
  const countBeforeCustom = copied.length;
  await panel.querySelector("#ysc-copy").onclick();
  await root.querySelector("#ysc-copy").onclick();
  assert.equal(copied.length, countBeforeCustom + 2);
  assert.deepEqual(copied.slice(-2), ["VIYAR\t190218", "Гвинт цинк"], "Custom components copy without unrelated unit/price requirements");
  stored.ysc_excel_columns = Array(26).fill("skip"); stored.ysc_excel_columns[0] = "supplier";
  delete stored.ysc_work_styles;
  Object.assign(product, { article: "", price: "", unit: "" });
  listener({ type: "YSC_RUN" }); await settle();
  assert.equal(copied.length, countBeforeCustom + 3, "Supplier-only shortcut does not require article/unit/price");
  assert.equal(copied.at(-1), "VIYAR");
  stored.ysc_excel_columns = Array(26).fill("skip");
  delete stored.ysc_work_styles;
  listener({ type: "YSC_RUN" }); await settle();
  await root.querySelector("#ysc-copy").onclick();
  assert.equal(copied.length, countBeforeCustom + 3, "An empty column composition never writes clipboard data");
  console.log("26 column comboboxes: persistence, horizontal position, component sessions, optional fields and empty-layout safeguard passed");
  const urlColumn = root.querySelector("#ysc-excel-column-A"); urlColumn.value = "url"; await urlColumn.onchange();
  assert.equal(stored.ysc_work_styles.find(s => s.id === stored.ysc_work_style).format.excelColumns[0], "url");
  assert.equal(root.querySelector(".ysc-preview-data").textContent, context.location.href);
  context.location.href = "https://viyar.example/other?size=2,8&variant=22#specs";
  await root.querySelector("#ysc-copy").onclick();
  assert.equal(copied.at(-1), context.location.href, "URL must be read at copy time, including query parameters and fragment");
  listener({ type: "YSC_CONFIGURE" }); await settle();
  assert.equal(root.querySelector("#ysc-excel-column-A").children.find(option => option.selected).value, "url");
  console.log("URL column: option, persistence, preview and live current-page clipboard address passed");
  for (const [column, field] of [["B", "supplier"], ["C", "name"]]) {
    const select = root.querySelector(`#ysc-excel-column-${column}`); select.value = field; await select.onchange();
  }
  let vertical = root.querySelector("#ysc-excel-separator"); vertical.value = "enter"; await vertical.onchange();
  assert.equal(stored.ysc_work_styles.find(s => s.id === stored.ysc_work_style).format.excelVertical, true);
  assert.ok(root.querySelector(".ysc-excel-session-hint").textContent.startsWith("Режим Enter:"));
  assert.equal(root.querySelector("#ysc-excel-column-A").parent.querySelector("label").textContent, "1");
  await root.querySelector("#ysc-copy").onclick();
  assert.equal(copied.at(-1), `${context.location.href}\r\nVIYAR\r\nГвинт цинк`);
  listener({ type: "YSC_CONFIGURE" }); await settle();
  assert.equal(root.querySelector("#ysc-excel-separator").children.find(option => option.selected).value, "enter");
  assert.equal(root.querySelector("#ysc-style-mode"), null);
  vertical = root.querySelector("#ysc-excel-separator"); vertical.value = "tab"; await vertical.onchange();
  assert.equal(stored.ysc_work_styles.find(s => s.id === stored.ysc_work_style).format.excelVertical, false);
  assert.equal(root.querySelector("#ysc-excel-column-A").parent.querySelector("label").textContent, "A");
  await root.querySelector("#ysc-copy").onclick();
  assert.equal(copied.at(-1), `${context.location.href}\tVIYAR\tГвинт цинк`);
  console.log("Tab/Enter separator: saved direction, row labels, guidance and actual clipboard separators passed");
  domainProfiles = [
    { ...structuredClone(profile), id: "viyar", domain: "viyar.example", enabled: true },
    { ...structuredClone(profile), id: "sirius1", domain: "sirius.example", enabled: true, lastUrl: "https://sirius.example/last?variant=2#spec" },
    { ...structuredClone(profile), id: "sirius2", domain: "sirius.example", enabled: false, lastUrl: "" },
    { ...structuredClone(profile), id: "other", domain: "other.example", enabled: true }
  ];
  listener({ type: "YSC_CONFIGURE" }); await settle();
  panel = root.querySelector("#ysc-panel");
  let domains = panel.querySelector("#ysc-domain-list");
  assert.equal(domains.size, 6);
  assert.deepEqual(domains.children.map(option => option.textContent), ["other.example (1)", "sirius.example (2)", "viyar.example (1)"]);
  assert.equal(domains.value, "viyar.example");
  domains.value = "sirius.example"; domains.onchange();
  assert.equal(panel.querySelector("#ysc-domain-profiles").children.length, 2);
  const openButtons = panel.querySelector("#ysc-domain-profiles").querySelectorAll("button").filter(button => button.textContent === "Відкрити");
  assert.ok(openButtons.every(button => !button.disabled), "Other-domain profiles can navigate to the supplier site");
  assert.ok(openButtons.every(button => button.className !== "secondary"), "Open is the primary action");
  assert.equal(panel.querySelector("#ysc-domain-profiles").querySelectorAll("button").length, 2, "Only Open buttons remain in the supplier directory");
  const tools = panel.querySelector("#ysc-profile-tools");
  assert.equal(tools.open, false, "Administrative actions are collapsed by default");
  assert.equal(panel.querySelector(".ysc-domain-manager").children.at(-1), tools, "Administration is last, after directory and Open actions");
  assert.equal(tools.children.at(-1).className, "ysc-backup-controls", "Import/export are at the very end");
  assert.equal(panel.querySelector("#ysc-delete-domain").parent, tools);
  await openButtons[0].onclick();
  assert.equal(navigations.at(-1), "https://sirius.example/last?variant=2#spec");
  assert.equal(selectedProfiles.at(-1), "sirius1");
  await openButtons[1].onclick();
  assert.equal(navigations.at(-1), "https://sirius.example/", "Old profiles without last URL use their domain homepage");
  assert.equal(selectedProfiles.at(-1), "sirius2");
  assert.ok(rememberedPages.includes(context.location.href));
  allowDelete = false; await panel.querySelector("#ysc-delete-domain").onclick();
  assert.equal(deletedDomains.length, 0, "Cancelling confirmation must not delete anything");
  allowDelete = true; await panel.querySelector("#ysc-delete-domain").onclick();
  assert.deepEqual(deletedDomains, ["sirius.example"]);
  assert.deepEqual(domainProfiles.map(p => p.domain), ["viyar.example", "other.example"]);
  assert.equal(panel.querySelector("#ysc-domain-list").children.length, 2);
  assert.ok(confirmations.at(-1).includes("sirius.example (2)"));
  domainProfiles = []; panel.remove(); listener({ type: "YSC_CONFIGURE" }); await settle();
  assert.equal(root.querySelector("#ysc-domain-list").disabled, true);
  assert.equal(root.querySelector("#ysc-delete-domain").disabled, true);
  console.log("All-domain listbox: grouped counts, disabled profiles, selection, confirmed deletion and empty state passed");
  stored.ysc_language = "uk";
  stored.ysc_excel_vertical = false;
  stored.ysc_excel_columns = ["unit"];
  delete stored.ysc_work_styles;
  profile.format = { excel: true };
  product.sheetLength = "5950.00мм"; product.sheetWidth = ""; product.unit = "пог.м";
  root.querySelector("#ysc-panel").remove(); listener({ type: "YSC_CONFIGURE" }); await settle();
  let rodToggle = root.querySelector("#ysc-rod-enabled"); rodToggle.checked = true; rodToggle.onchange();
  panel = root.querySelector("#ysc-panel");
  assert.equal(panel.querySelector("#ysc-sheet-enabled").checked, false);
  assert.equal(panel.querySelector("#ysc-value-sheetWidth"), null);
  assert.equal(panel.querySelector("#ysc-value-sheetThickness"), null);
  assert.equal(panel.querySelector("#ysc-value-sheetLength").value, "5950.00мм");
  const beforeRodCopy = copied.length;
  await panel.querySelector("#ysc-copy").onclick();
  assert.equal(copied.length, beforeRodCopy, "Rod length needs confirmation for Excel");
  panel.querySelector("#ysc-sheet-confirm").onclick();
  await panel.querySelector("#ysc-copy").onclick();
  assert.equal(copied.at(-1), "пог.м (5,95)", "Rod unit exports length without width");
  profile.format = { sheet: true, sheetRod: true };
  listener({ type: "YSC_CONFIGURE" }); await settle();
  assert.equal(root.querySelector("#ysc-rod-enabled").checked, true, "Saved profile restores rod mode");
  const sheetToggle = root.querySelector("#ysc-sheet-enabled"); sheetToggle.checked = true; sheetToggle.onchange();
  assert.equal(root.querySelector("#ysc-rod-enabled").checked, false);
  assert.ok(root.querySelector("#ysc-value-sheetWidth"), "Switching back to sheet restores width");
  console.log("Rod mode: length-only confirmation/export, restored profile and mutually exclusive sheet mode passed");
  // Styles remain global while supplier extraction/dimensions remain in site profiles.
  panel = root.querySelector("#ysc-panel");
  assert.ok(panel.querySelector("#ysc-quick-copy"));
  assert.equal(panel.querySelector("#ysc-excel-mode-label"), null);
  panel.querySelector("#ysc-style-name").value = "Excel — pictures";
  await panel.querySelector("#ysc-style-duplicate").onclick();
  const duplicateId = stored.ysc_work_style;
  assert.equal(stored.ysc_work_styles.at(-1).id, duplicateId);
  assert.equal(stored.ysc_work_styles.at(-1).name, "Копія Excel", "Duplicate prefixes the saved current name");
  assert.equal(root.querySelector(".ysc-style-actions").children.length, 3);
  assert.equal(root.querySelector("#ysc-style-add"), null);
  assert.equal(root.querySelector("#ysc-style-rename"), null);
  panel = root.querySelector("#ysc-panel");
  panel.querySelector("#ysc-style-name").value = "Excel — pictures";
  await panel.querySelector("#ysc-style-name").onchange();
  panel = root.querySelector("#ysc-panel");
  const pictureColumn = panel.querySelector("#ysc-excel-column-A"); pictureColumn.value = "imageUrl"; await pictureColumn.onchange();
  let styles = stored.ysc_work_styles;
  assert.equal(styles.find(s => s.id === duplicateId).format.excelColumns[0], "imageUrl");
  assert.equal(styles.find(s => s.id === "excel").format.excelColumns[0], "unit", "Editing a copied style preserves its source");
  let styleSelect = root.querySelector("#ysc-work-style"); styleSelect.value = "excel"; await styleSelect.onchange();
  assert.equal(root.querySelector("#ysc-excel-column-A").children.find(o => o.selected).value, "unit");
  styleSelect = root.querySelector("#ysc-work-style"); styleSelect.value = duplicateId; await styleSelect.onchange();
  assert.equal(root.querySelector("#ysc-excel-column-A").children.find(o => o.selected).value, "imageUrl");
  root.querySelector("#ysc-panel").remove(); listener({ type: "YSC_CONFIGURE" }); await settle();
  assert.equal(root.querySelector("#ysc-work-style").children.find(o => o.selected).value, duplicateId, "Selected style survives reopening");
  panel = root.querySelector("#ysc-panel");
  await panel.querySelector("#ysc-style-duplicate").onclick();
  const addedId = stored.ysc_work_style;
  const newName = root.querySelector("#ysc-style-name"); newName.value = "Custom delimiter"; await newName.onchange();
  assert.equal(stored.ysc_work_styles.at(-1).name, "Custom delimiter");
  await root.querySelector("#ysc-style-reset").onclick();
  assert.ok(stored.ysc_work_styles.at(-1).format.excelColumns.every(value => value === "skip"));
  assert.equal(stored.ysc_work_styles.find(s => s.id === duplicateId).format.excelColumns[0], "imageUrl", "Reset affects only the current copy");
  const beforeEmptyCopy = copied.length;
  await root.querySelector("#ysc-copy").onclick();
  assert.equal(copied.length, beforeEmptyCopy, "Reset layout cannot overwrite the clipboard with empty data");
  const customSeparator = root.querySelector("#ysc-excel-separator"); customSeparator.value = "ascii"; await customSeparator.onchange();
  let ascii = root.querySelector("#ysc-excel-ascii"); ascii.value = "59"; await ascii.onchange();
  assert.equal(stored.ysc_work_styles.find(s => s.id === addedId).format.excelSeparator, "ascii");
  assert.equal(stored.ysc_work_styles.find(s => s.id === addedId).format.excelAscii, 59);
  const quickArticle = root.querySelector("#ysc-value-article"); quickArticle.value = "190218"; quickArticle.listeners.input();
  await root.querySelector("#ysc-quick-copy").onclick();
  assert.equal(copied.at(-1), "VIYAR 190218 Гвинт цинк", "Top copy action is fixed independently of the selected style");
  root.querySelector("#ysc-panel").remove();
  listener({ type: "YSC_CONFIGURE" }); await settle();
  await root.querySelector("#ysc-style-delete").onclick();
  assert.equal(stored.ysc_work_styles.some(s => s.id === addedId), false);
  assert.equal(stored.ysc_work_style, duplicateId, "Deleting the current style returns to the previous stack entry");
  const literalChoice = root.querySelector("#ysc-excel-column-B"); literalChoice.value = "anyText"; await literalChoice.onchange();
  const literalInput = root.querySelector("#ysc-excel-text-B"); literalInput.value = "  Custom text  "; await literalInput.oninput();
  assert.equal(stored.ysc_work_styles.at(-1).format.excelColumns[1].text, "  Custom text  ", "Literal text saves automatically in the selected style");
  root.querySelector("#ysc-panel").remove(); listener({ type: "YSC_CONFIGURE" }); await settle();
  assert.equal(root.querySelector("#ysc-excel-text-B").value, "  Custom text  ", "Literal text survives reopening");
  await root.querySelector("#ysc-style-export").onclick();
  const exported = exportedStyles.at(-1), data = JSON.parse(exported.text);
  assert.equal(exported.filename, "Excel — pictures.ysc-style.json");
  assert.equal(data.name, "Excel — pictures");
  assert.equal(data.columns[0], "imageUrl");
  assert.deepEqual(Object.keys(data).sort(), ["asciiCode", "columns", "formatting", "name", "separator", "type", "version"].sort());
  const beforeImport = structuredClone(stored.ysc_work_styles);
  const styleFile = root.querySelector("#ysc-style-import-file");
  styleFile.files = [{ text: async () => exported.text }];
  await styleFile.onchange();
  assert.equal(stored.ysc_work_styles.length, beforeImport.length + 1);
  assert.equal(stored.ysc_work_styles.at(-1).name, "Копія Excel — pictures");
  assert.deepEqual(stored.ysc_work_styles.at(-1).format, beforeImport.at(-1).format, "Export/import preserves all style settings");
  assert.deepEqual(stored.ysc_work_styles.slice(0, -1), beforeImport, "Import preserves existing styles");
  const importedId = stored.ysc_work_style;
  const invalidFile = root.querySelector("#ysc-style-import-file");
  for (const invalid of ["broken JSON", JSON.stringify({ ...data, version: 999 }), JSON.stringify({ ...data, columns: ["unknown-field"] }), JSON.stringify({ ...data, formatting: { name: "yes" } })]) {
    invalidFile.files = [{ text: async () => invalid }];
    await invalidFile.onchange();
    assert.equal(stored.ysc_work_styles.length, beforeImport.length + 1, "Invalid import leaves the style list intact");
    assert.equal(stored.ysc_work_style, importedId);
  }
  const secondFile = root.querySelector("#ysc-style-import-file");
  secondFile.files = [{ text: async () => exported.text }]; await secondFile.onchange();
  assert.equal(stored.ysc_work_styles.at(-1).name, "Копія Excel — pictures (2)");
  await root.querySelector("#ysc-style-delete").onclick();
  await root.querySelector("#ysc-style-delete").onclick();
  assert.equal(stored.ysc_work_style, duplicateId);
  console.log("Single-style export/import: round trip, unique names, invalid files and existing styles passed");
  const active = stored.ysc_work_styles.find(s => s.id === duplicateId);
  Object.assign(active.format, { excel: true, excelColumns: ["price", "imageUrl"], supplier: false, article: false, name: false, excelSeparator: "enter", excelVertical: true });
  root.querySelector("#ysc-panel").remove(); listener({ type: "YSC_CONFIGURE" }); await settle();
  panel = root.querySelector("#ysc-panel");
  for (const [key, value] of [["article", "190218"], ["name", "Гвинт M4"], ["price", "bad"]]) {
    const field = panel.querySelector(`#ysc-value-${key}`); field.value = value; field.listeners.input();
  }
  assert.equal(panel.querySelector("#ysc-quick-preview").textContent, "VIYAR 190218 Гвинт M4");
  await panel.querySelector("#ysc-quick-copy").onclick();
  assert.equal(copied.at(-1), "VIYAR 190218 Гвинт M4", "Quick response ignores style flags, invalid price and unconfirmed sheet dimensions");
  assert.ok(root.querySelector("#ysc-panel"), "Quick copy leaves style editing available");
  assert.equal(context.YSCWorkStyles.uniqueName("Excel", [{ id: "1", name: "Excel" }, { id: "2", name: "Excel (2)" }]), "Excel (3)");
  console.log("Work styles: migration, isolated schemas, duplication, rename, create, delete, reopening and quick copy passed");
  profile.format.sheet = false;
  Object.assign(stored.ysc_work_styles.find(s => s.id === stored.ysc_work_style).format, { excel: true, excelColumns: ["name", "price"], sheet: false, excelSeparator: "tab" });
  product.price = ""; product.candidates.price = [];
  panel.remove(); listener({ type: "YSC_CONFIGURE" }); await settle();
  panel = root.querySelector("#ysc-panel");
  const manualName = panel.querySelector("#ysc-value-name"); manualName.value = "Manual product"; manualName.listeners.input();
  const beforeEmptyPrice = copied.length;
  await panel.querySelector("#ysc-copy").onclick();
  assert.equal(copied.length, beforeEmptyPrice + 1, "A missing price does not block copying");
  assert.equal(copied.at(-1), "Manual product\t", "The price destination is left empty, not filled with zero");
  listener({ type: "YSC_CONFIGURE" }); await settle(); panel = root.querySelector("#ysc-panel");
  const nameBeforePick = panel.querySelector("#ysc-value-name"); nameBeforePick.value = "Corrected name"; nameBeforePick.listeners.input();
  panel.querySelector("#ysc-pick-price").onclick();
  assert.equal(panel.style.display, "none", "Picker hides the panel while selecting on the page");
  context.YSCPicker.cancel();
  assert.equal(panel.style.display, "flex", "Cancelling selection returns to the panel without changing a field");
  panel.querySelector("#ysc-pick-price").onclick();
  product.price = "9.59"; product.candidates.price = ["9.59"];
  context.YSCPicker.callback({ selector: ".chosen-price", price: "12,24 євро", text: "12,24 євро" });
  panel = root.querySelector("#ysc-panel");
  assert.equal(panel.querySelector("#ysc-value-name").value, "Corrected name", "Picking a price preserves manual corrections");
  assert.equal(panel.querySelector("#ysc-value-price").value, "12.24", "The clicked price takes precedence over another value returned by the selector");
  const manualPrice = panel.querySelector("#ysc-value-price"); manualPrice.value = "12,34"; manualPrice.listeners.input();
  await panel.querySelector("#ysc-copy").onclick();
  assert.equal(copied.at(-1), "Corrected name\t12,34", "Manual price takes precedence over site data");
  console.log("Empty price export, picker preservation and manual price override passed");
  Object.assign(stored.ysc_work_styles.find(s => s.id === stored.ysc_work_style).format, { excelColumns: ["name", "plainUnit"] });
  Object.assign(product, { unit: "шт.", unitDefaulted: true }); product.candidates.unit = [];
  listener({ type: "YSC_CONFIGURE" }); await settle(); panel = root.querySelector("#ysc-panel");
  assert.equal(panel.querySelector("#ysc-value-unit").value, "шт.");
  await panel.querySelector("#ysc-copy").onclick();
  assert.ok(copied.at(-1).endsWith("\tшт."), "The default unit is exported");
  listener({ type: "YSC_CONFIGURE" }); await settle(); panel = root.querySelector("#ysc-panel");
  const manualUnit = panel.querySelector("#ysc-value-unit"); manualUnit.value = "комплект"; manualUnit.listeners.input();
  const unitSheetToggle = panel.querySelector("#ysc-sheet-enabled"); unitSheetToggle.checked = true; unitSheetToggle.onchange();
  assert.equal(root.querySelector("#ysc-value-unit").value, "комплект", "Mode switching preserves the user's unit");
  const piecesToggle = root.querySelector("#ysc-sheet-enabled"); piecesToggle.checked = false; piecesToggle.onchange();
  await root.querySelector("#ysc-copy").onclick();
  assert.ok(copied.at(-1).endsWith("\tкомплект"), "The manual unit overrides the pieces default");
  console.log("Pieces default and manual unit export passed");
  Object.assign(stored.ysc_work_styles.find(s => s.id === stored.ysc_work_style).format, { excelColumns: ["price", "currency"] });
  Object.assign(product, { price: "12.24", currency: "EUR" }); product.candidates.currency = ["EUR"];
  listener({ type: "YSC_CONFIGURE" }); await settle(); panel = root.querySelector("#ysc-panel");
  assert.equal(panel.querySelector("#ysc-value-currency").value, "EUR");
  const manualCurrency = panel.querySelector("#ysc-value-currency"); manualCurrency.value = "PLN"; manualCurrency.listeners.input();
  panel.querySelector("#ysc-pick-price").onclick(); context.YSCPicker.callback({ selector: ".eur-price", price: "12.24", currency: "EUR", text: "€12.24" });
  panel = root.querySelector("#ysc-panel");
  assert.equal(panel.querySelector("#ysc-value-currency").value, "PLN", "Manual currency survives price picking");
  await panel.querySelector("#ysc-copy").onclick();
  assert.equal(copied.at(-1), "12,24\tPLN");
  product.currency = ""; product.candidates.currency = [];
  listener({ type: "YSC_CONFIGURE" }); await settle();
  await root.querySelector("#ysc-copy").onclick();
  assert.equal(copied.at(-1), "12,24\t", "An unknown currency does not block numeric price export");
  const currencyStyle = stored.ysc_work_styles.find(s => s.id === stored.ysc_work_style);
  const roundTrip = context.YSCWorkStyles.importStyle(context.YSCWorkStyles.exportStyle(currencyStyle));
  assert.equal(roundTrip.format.excelColumns[1], "currency", "Currency columns survive style export/import");
  console.log("Currency display, manual override, optional export and style transfer passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
