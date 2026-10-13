// Render the real content script with a small DOM shim. This is not a browser test.
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.childNodes = []; this.style = {}; this.listeners = {}; this.textContent = ""; }
  get children() { return this.childNodes.filter(n => n.tagName !== "#TEXT"); }
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
let stored = {}, listener;
const picked = [];
let domainProfiles = [], allowDelete = true;
const deletedDomains = [], confirmations = [];
const navigations = [], selectedProfiles = [], rememberedPages = [];
const product = { supplier: "VIYAR", article: "190218", name: "Гвинт цинк", price: "1.02", unit: "шт", productDetected: true, candidates: { article: ["190218"], name: ["Гвинт цинк"], price: ["1.02"], unit: ["шт"] } };
const context = {
  document, structuredClone, location: { hostname: "viyar.example", href: "https://viyar.example/product?variant=18#details", assign(url) { navigations.push(url); } }, setTimeout: () => 0,
  confirm: message => { confirmations.push(message); return allowDelete; },
  YSCProfiles: {
    get: async () => structuredClone(profile), all: async () => structuredClone(domainProfiles),
    remember: async (p, url) => { rememberedPages.push(url); return { lastUrl: url }; },
    select: async id => { selectedProfiles.push(id); },
    pageUrl: (value, domain) => { try { const url = new URL(value); return /^https?:$/.test(url.protocol) && url.hostname === domain && !url.username && !url.password ? url.href : ""; } catch { return ""; } },
    removeDomain: async domain => { deletedDomains.push(domain); domainProfiles = domainProfiles.filter(p => p.domain !== domain); }
  },
  YSCParser: { parse: () => structuredClone(product), removeBlocked: value => value },
  YSCPicker: { stop() {}, start(key) { picked.push(key); } },
  chrome: {
    storage: { local: { get: async () => ({ ...stored }), set: async value => Object.assign(stored, value) } },
    runtime: { getManifest: () => JSON.parse(fs.readFileSync("manifest.json", "utf8")), getURL: path => `chrome-extension://test/${path}`, sendMessage: async message => { copied.push(message.text); return { ok: true }; }, onMessage: { addListener: callback => { listener = callback; } } }
  }
};
vm.createContext(context);
for (const path of ["ui/i18n.js", "core/formatter.js", "content.js"]) vm.runInContext(fs.readFileSync(path, "utf8"), context);
const settle = () => new Promise(resolve => setImmediate(resolve));
const copied = [];
(async () => {
  listener({ type: "YSC_CONFIGURE" }); await settle();
  let panel = root.querySelector("#ysc-panel");
  assert.equal(panel.lang, "uk");
  const help = panel.querySelector("#ysc-help");
  assert.equal(panel.querySelector("#ysc-settings").children.at(-1), help);
  assert.equal(help.querySelector("#ysc-help-name").textContent, "Y Supplier Clipboard");
  assert.match(help.querySelector("#ysc-help-description").textContent, /буфер обміну постачальника/);
  assert.equal(help.querySelector("#ysc-revision-date").textContent, "Дата редакції: 12.10.2026");
  assert.equal(help.querySelector("#ysc-code-version").textContent, `Версія коду: ${JSON.parse(fs.readFileSync("manifest.json", "utf8")).version}`);
  assert.deepEqual(help.querySelectorAll("a").map(a => a.href), ["chrome-extension://test/ui/help.html?doc=readme", "chrome-extension://test/ui/help.html?doc=license", "https://web.telegram.org/a/#-1001323392064_1018"]);
  assert.equal(help.querySelector(".ysc-help-note"), null);
  panel.querySelector("#ysc-settings").open = true;
  const article = panel.querySelector("#ysc-value-article"); article.value = "190218-corrected"; article.listeners.input();
  let select = panel.querySelector("#ysc-language"); select.value = "en"; await select.onchange();
  panel = root.querySelector("#ysc-panel");
  assert.equal(panel.lang, "en");
  assert.equal(panel.querySelector("#ysc-revision-date").textContent, "Revision date: 12.10.2026");
  assert.equal(panel.querySelector("#ysc-copy").textContent, "Copy");
  assert.equal(panel.querySelector("#ysc-value-article").value, "190218-corrected");
  assert.equal(panel.querySelector("#ysc-value-name").value, "Гвинт цинк");
  assert.equal(panel.querySelector("#ysc-settings").open, true);
  assert.equal(stored.ysc_language, "en");
  select = panel.querySelector("#ysc-language"); select.value = "ru"; await select.onchange();
  assert.equal(root.querySelector("#ysc-copy").textContent, "Скопировать");
  root.querySelector("#ysc-panel").remove();
  listener({ type: "YSC_CONFIGURE" }); await settle();
  assert.equal(root.querySelector("#ysc-panel").lang, "ru");
  assert.equal(root.querySelector("#ysc-language").children.find(option => option.selected).value, "ru");
  console.log("Panel language switching, persisted preference and manual edits passed");
  root.querySelector("#ysc-panel").remove();
  profile.format.sheet = true;
  for (const key of ["sheetLength", "sheetWidth"]) profile.fields[key] = { enabled: true, source: "auto" };
  Object.assign(product, { unit: "лист", sheetLength: "2800", sheetWidth: "2070" });
  stored.ysc_excel_mode = true;
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
  assert.equal(panel.querySelector(".ysc-preview").textContent, "VIYAR 190218 Гвинт цинк - 18");
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
    listener({ type: "YSC_CONFIGURE" }); await settle();
    assert.ok(root.querySelector(".ysc-excel-session-hint").textContent.startsWith(hint));
  }
  console.log("Dynamic Excel hints explain one, two and three copy sessions for selected column layouts");
  panel = root.querySelector("#ysc-panel");
  assert.equal(panel.querySelector(".ysc-excel-row").querySelectorAll("select").length, 26);
  assert.equal(panel.querySelectorAll(".ysc-excel-mapping").length, 0, "Old field-to-column controls are removed");
  const expectedOptions = ["skip", "fullName", "supplier", "article", "name", "unit", "plainUnit", "price", "sheetLength", "sheetWidth", "sheetThickness", "sheetSize", "url"];
  assert.deepEqual(panel.querySelector("#ysc-excel-column-A").children.map(option => option.value), expectedOptions);
  panel.querySelector(".ysc-excel-row").scrollLeft = 1200;
  panel.querySelector("#ysc-settings").open = true; panel.querySelector("#ysc-excel-settings").open = true;
  let columnSelect = panel.querySelector("#ysc-excel-column-Z"); columnSelect.value = "supplier"; await columnSelect.onchange();
  panel = root.querySelector("#ysc-panel");
  assert.equal(stored.ysc_excel_columns[25], "supplier");
  assert.equal(panel.querySelector(".ysc-excel-row").scrollLeft, 1200);
  assert.equal(panel.querySelector("#ysc-excel-settings").open, true);
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
  Object.assign(product, { article: "", price: "", unit: "" });
  listener({ type: "YSC_RUN" }); await settle();
  assert.equal(copied.length, countBeforeCustom + 3, "Supplier-only shortcut does not require article/unit/price");
  assert.equal(copied.at(-1), "VIYAR");
  stored.ysc_excel_columns = Array(26).fill("skip");
  listener({ type: "YSC_RUN" }); await settle();
  await root.querySelector("#ysc-copy").onclick();
  assert.equal(copied.length, countBeforeCustom + 3, "An empty column composition never writes clipboard data");
  console.log("26 column comboboxes: persistence, horizontal position, component sessions, optional fields and empty-layout safeguard passed");
  const urlColumn = root.querySelector("#ysc-excel-column-A"); urlColumn.value = "url"; await urlColumn.onchange();
  assert.equal(stored.ysc_excel_columns[0], "url");
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
  let vertical = root.querySelector("#ysc-excel-vertical"); vertical.checked = true; await vertical.onchange();
  assert.equal(root.querySelector("#ysc-excel-mode-label").childNodes.at(-1).textContent, " Для Excel: вибрана компоновка в стовпчик");
  assert.equal(stored.ysc_excel_vertical, true);
  assert.ok(root.querySelector(".ysc-excel-session-hint").textContent.startsWith("Режим Enter:"));
  assert.equal(root.querySelector("#ysc-excel-column-A").parent.querySelector("label").textContent, "1");
  await root.querySelector("#ysc-copy").onclick();
  assert.equal(copied.at(-1), `${context.location.href}\r\nVIYAR\r\nГвинт цинк`);
  listener({ type: "YSC_CONFIGURE" }); await settle();
  assert.equal(root.querySelector("#ysc-excel-vertical").checked, true);
  assert.equal(root.querySelector("#ysc-excel-mode-label").childNodes.at(-1).textContent, " Для Excel: вибрана компоновка в стовпчик");
  vertical = root.querySelector("#ysc-excel-vertical"); vertical.checked = false; await vertical.onchange();
  assert.equal(stored.ysc_excel_vertical, false);
  assert.equal(root.querySelector("#ysc-excel-mode-label").childNodes.at(-1).textContent, " Для Excel: вибрана компоновка в рядок");
  assert.equal(root.querySelector("#ysc-excel-column-A").parent.querySelector("label").textContent, "A");
  await root.querySelector("#ysc-copy").onclick();
  assert.equal(copied.at(-1), `${context.location.href}\tVIYAR\tГвинт цинк`);
  console.log("Tab/Enter checkbox: saved direction, row labels, guidance and actual clipboard separators passed");
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
})().catch(error => { console.error(error); process.exitCode = 1; });
