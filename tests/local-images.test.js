const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const helperSource = fs.readFileSync("storage/local-images.js", "utf8");
const helperContext = vm.createContext({ TextEncoder });
vm.runInContext(helperSource, helperContext);
const images = helperContext.YSCLocalImages;
const plain = value => JSON.parse(JSON.stringify(value));
assert.equal(images.filename('HÄFELE 262.11.117 Стяжка меблевая.'), "HÄFELE 262.11.117 Стяжка меблевая.jpg");
assert.equal(images.filename('A/B\\C: D*?"<>|'), "A-B-C- D------.jpg");
assert.equal(images.filename("CON"), "_CON.jpg");
assert.equal(images.filename("..."), "product.jpg");
assert.ok(new TextEncoder().encode(images.filename("😀".repeat(200))).length < 256);
const contain = images.settings({ mode: "contain", width: 300, height: 300 });
assert.deepEqual(plain(images.layout(800, 400, contain)), { width: 300, height: 300, x: 0, y: 75, drawWidth: 300, drawHeight: 150 });
assert.deepEqual(plain(images.layout(800, 400, { ...contain, mode: "cover" })), { width: 300, height: 300, x: -150, y: 0, drawWidth: 600, drawHeight: 300 });
assert.deepEqual(plain(images.layout(400, 800, contain)), { width: 300, height: 300, x: 75, y: 0, drawWidth: 150, drawHeight: 300 });
assert.deepEqual(plain(images.layout(400, 800, { ...contain, mode: "cover" })), { width: 300, height: 300, x: 0, y: -150, drawWidth: 300, drawHeight: 600 });
assert.deepEqual(plain(images.layout(800, 400, images.settings())), { width: 800, height: 400, x: 0, y: 0, drawWidth: 800, drawHeight: 400 });
for (const value of [{ mode: "contain", width: 0 }, { mode: "cover", width: 1.5 }, { mode: "contain", width: 8192, height: 8192 }]) assert.throws(() => images.settings(value), /local_image_invalid_size/);
for (const subfolder of ["../escape", "/absolute", "C:\\Images", "catalog/../escape", "catalog/NUL", "catalog//supplier"]) assert.throws(() => images.settings({ subfolder }), /local_image_invalid_subfolder/);
const nestedOptions = images.settings({ path: '"C:\\Images\\"', confirmedPath: "C:\\Images", subfolder: "Catalog/{supplier}" });
assert.equal(nestedOptions.path, "C:\\Images");
assert.deepEqual(plain(images.subfolders(nestedOptions, "A/B")), ["Catalog", "A-B"]);
assert.equal(images.displayPath(nestedOptions, "Images", "A/B", "Product.jpg"), "C:\\Images\\Catalog\\A-B\\Product.jpg");
assert.throws(() => images.subfolders(nestedOptions, ""), /local_image_supplier_required/);
assert.deepEqual(plain(images.cropRect({ x: 10, y: 20, width: 150, height: 100 }, { width: 800, height: 600 }, 1600, 1200)), { x: 20, y: 40, width: 300, height: 200 });
assert.deepEqual(plain(images.cropRect({ x: 0, y: 0, width: 800, height: 600 }, { width: 800, height: 600 }, 1000, 750)), { x: 0, y: 0, width: 1000, height: 750 });
for (const rect of [{ x: -1, y: 0, width: 10, height: 10 }, { x: 799, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: NaN, height: 10 }, { x: 0, y: 0, width: 0, height: 10 }]) assert.throws(() => images.cropRect(rect, { width: 800, height: 600 }, 1600, 1200), /invalid_capture_region/);

// Drive the real region picker with pointer events, including reverse drags and cleanup.
const documentEvents = new Map(), windowEvents = new Map(), frames = [], timers = [];
const element = () => ({ style: { setProperty(key, value) { this[key] = value; } }, children: [], append(...items) { this.children.push(...items); }, remove() { this.removed = true; } });
const root = element();
const pickerContext = vm.createContext({
  document: { createElement: element, documentElement: root, addEventListener(name, fn) { documentEvents.set(name, fn); }, removeEventListener(name, fn) { if (documentEvents.get(name) === fn) documentEvents.delete(name); } },
  window: { addEventListener(name, fn) { windowEvents.set(name, fn); }, removeEventListener(name) { windowEvents.delete(name); } },
  innerWidth: 800, innerHeight: 600,
  requestAnimationFrame: fn => frames.push(fn), setTimeout: fn => timers.push(fn)
});
vm.runInContext(fs.readFileSync("ui/element-picker.js", "utf8"), pickerContext);
const picker = pickerContext.YSCPicker;
let selection, cancelled = 0;
const event = (x, y, extra = {}) => ({ clientX: x, clientY: y, button: 0, preventDefault() {}, stopImmediatePropagation() {}, ...extra });
picker.startRegion("Select area", value => { selection = value; }, () => cancelled++);
let overlay = root.children.at(-1);
overlay.onpointerdown(event(240, 180)); overlay.onpointermove(event(40, 30)); overlay.onpointerup(event(40, 30));
assert.equal(overlay.removed, true);
assert.equal(overlay.children[0].style.width, "200px");
assert.equal(selection, undefined, "Capture waits for selection overlay to leave the frame");
frames.shift()(); frames.shift()();
assert.deepEqual(plain(selection), { rect: { x: 40, y: 30, width: 200, height: 150 }, viewport: { width: 800, height: 600 } });
assert.ok(documentEvents.has("click"), "The finishing click cannot activate a page link");
timers.splice(0).forEach(fn => fn());
assert.equal(documentEvents.size, 0); assert.equal(windowEvents.size, 0);
picker.startRegion("Select area", () => assert.fail("Escape must not capture"), () => cancelled++);
overlay = root.children.at(-1); documentEvents.get("keydown")(event(0, 0, { key: "Escape" }));
assert.equal(cancelled, 1); assert.equal(overlay.removed, true); timers.splice(0).forEach(fn => fn());
picker.startRegion("Select area", () => assert.fail("Tiny clicks must not capture"), () => cancelled++);
overlay = root.children.at(-1); overlay.onpointerdown(event(10, 10)); overlay.onpointerup(event(10, 10));
assert.notEqual(overlay.removed, true); windowEvents.get("resize")(); timers.splice(0).forEach(fn => fn());
assert.equal(cancelled, 2);

(async () => {
  const writes = [], existing = new Set(["Product.jpg"]);
  let failWrite = false, aborted = false;
  const folder = { async getFileHandle(name, options) {
    if (!options?.create) { if (existing.has(name)) return {}; throw Object.assign(new Error(), { name: "NotFoundError" }); }
    existing.add(name);
    return { async createWritable() { return { async write(blob) { if (failWrite) throw new Error("disk full"); writes.push({ name, blob }); }, async close() {}, async abort() { aborted = true; } }; } };
  } };
  const blob = new Blob(["JPEG bytes"], { type: "image/jpeg" });
  assert.equal(await images.save(blob, "Product", folder), "Product (1).jpg");
  assert.equal(writes[0].blob, blob);
  const created = [];
  const tree = { async getDirectoryHandle(name, options) { assert.equal(options.create, true); created.push(name); return tree; }, getFileHandle: folder.getFileHandle };
  assert.equal(await images.save(blob, "Nested", tree, nestedOptions, "A/B"), "Catalog/A-B/Nested.jpg");
  assert.deepEqual(created, ["Catalog", "A-B"]);
  await assert.rejects(images.writableDirectory(images.settings({ path: "C:\\New", confirmedPath: "C:\\Old" })), /local_image_confirm_path/);
  failWrite = true; await assert.rejects(images.save(blob, "Other", folder), /disk full/); assert.ok(aborted);

  // Exercise the worker boundary: permission, correct tab, high-DPI crop, JPEG and errors.
  let handler, granted = true, activeId = 7, closed = 0, captures = 0, saved, drawn;
  const canvases = [];
  let savedOptions;
  const tabActions = [];
  const backgroundContext = vm.createContext({
    importScripts() {},
    YSCLocalImages: { ...images, async writableDirectory() { if (!granted) throw new Error("choose_local_image_folder_first"); return folder; }, async save(value, name, handle, options, supplier) { saved = { blob: value, name, handle, options, supplier }; return options.subfolder ? "Catalog/VIYAR/Product.jpg" : "Product.jpg"; } },
    chrome: {
      commands: { onCommand: { addListener() {} } }, action: { onClicked: { addListener() {} } },
      storage: { local: { async get() { return { ysc_local_image_settings: savedOptions }; } } },
      runtime: { getURL: path => `chrome-extension://test/${path}`, onMessage: { addListener(fn) { handler = fn; } } },
      tabs: { async query() { return [{ id: activeId }]; }, async captureVisibleTab(windowId, options) { captures++; assert.equal(windowId, 9); assert.equal(options.format, "png"); return "data:image/png;base64,AAAA"; }, async sendMessage(id, value) { tabActions.push(["message", id, value.type]); return { ok: true }; }, async update(id) { tabActions.push(["activate", id]); }, async remove(id) { tabActions.push(["close", id]); } }
    },
    fetch: async () => ({ blob: async () => blob }), createImageBitmap: async () => ({ width: 1600, height: 1200, close() { closed++; } }),
    OffscreenCanvas: class { constructor(width, height) { this.width = width; this.height = height; canvases.push(this); } getContext() { return { fillRect() {}, drawImage(...args) { if (!drawn) drawn = args; } }; } async convertToBlob(options) { assert.equal(options.type, "image/jpeg"); return blob; } },
    Uint8Array, btoa: value => Buffer.from(value, "binary").toString("base64")
  });
  vm.runInContext(fs.readFileSync("background.js", "utf8"), backgroundContext);
  const message = { type: "YSC_CAPTURE_LOCAL_IMAGE", name: "Product", rect: { x: 40, y: 30, width: 200, height: 150 }, viewport: { width: 800, height: 600 } };
  const sender = { tab: { id: 7, windowId: 9 }, frameId: 0 };
  const send = (value = message, source = sender) => new Promise(resolve => assert.equal(handler(value, source, resolve), true));
  let reply = await send();
  assert.equal(reply.ok, true); assert.equal(reply.filename, "Product.jpg"); assert.match(reply.preview, /^data:image\/jpeg;base64,/);
  assert.equal(saved.blob.type, "image/jpeg"); assert.equal(saved.name, "Product"); assert.equal(saved.handle, folder);
  assert.deepEqual([canvases[0].width, canvases[0].height], [400, 300]);
  assert.deepEqual(drawn.slice(1), [80, 60, 400, 300, 0, 0, 400, 300]);
  assert.equal(closed, 1);
  granted = false; reply = await send(); assert.equal(reply.error, "choose_local_image_folder_first"); assert.equal(captures, 1);
  granted = true; activeId = 8; reply = await send(); assert.equal(reply.error, "capture_tab_not_active"); assert.equal(captures, 1);
  activeId = 7; reply = await send(message, { ...sender, frameId: 2 }); assert.equal(reply.error, "invalid_capture_region");
  reply = await send({ ...message, rect: { x: 800, y: 0, width: 200, height: 150 } }); assert.equal(reply.error, "invalid_capture_region"); assert.equal(closed, 2);
  for (const mode of ["contain", "cover"]) {
    savedOptions = { ...nestedOptions, mode, width: 300, height: 300, background: "#f0f0f0" };
    canvases.length = 0; drawn = null;
    reply = await send({ ...message, supplier: "VIYAR" }); assert.equal(reply.ok, true);
    assert.deepEqual([canvases[0].width, canvases[0].height], [300, 300]);
    const expected = images.layout(400, 300, images.settings(savedOptions));
    assert.deepEqual(drawn.slice(5), [expected.x, expected.y, expected.drawWidth, expected.drawHeight]);
    assert.equal(saved.supplier, "VIYAR");
    assert.equal(reply.path, "C:\\Images\\Catalog\\VIYAR\\Product.jpg");
  }
  reply = await send({ type: "YSC_LOCAL_IMAGE_RETURN", tabId: 7 }, { tab: { id: 10 }, url: "chrome-extension://test/ui/local-images.html?returnTab=7" });
  assert.equal(reply.ok, true); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(tabActions, [["message", 7, "YSC_LOCAL_IMAGE_CHANGED"], ["activate", 7], ["close", 10]]);
  // Drive the settings page itself: pasted paths must be confirmed, and Save returns.
  const fields = Object.fromEntries([...fs.readFileSync("ui/local-images.html", "utf8").matchAll(/id="([^"]+)"/g)].map(match => [match[1], { value: "", textContent: "", disabled: false }]));
  const dictionary = JSON.parse(fs.readFileSync("ui/locales/uk.json", "utf8"));
  const pageStored = { ysc_help_mode: "pro" }, returnMessages = [];
  let pagePreferenceChanged;
  let selectedName = "Images", pageHandle = { name: "Images", async queryPermission() { return "granted"; } };
  const page = vm.createContext({
    YSCI18n: { async load() {}, setLanguage() {}, language: "uk", t(key, params = {}) { return (dictionary[key] || key).replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match); } },
    YSCLocalImages: { ...images, async directory(handle) { if (handle) pageHandle = handle; return pageHandle; }, async writableDirectory(options) { if (options.path !== options.confirmedPath) throw new Error("local_image_confirm_path"); return pageHandle; } },
    document: { documentElement: {}, getElementById: id => fields[id] },
    chrome: { storage: { onChanged: { addListener(callback) { pagePreferenceChanged = callback; } }, local: { async get() { return structuredClone(pageStored); }, async set(value) { Object.assign(pageStored, structuredClone(value)); } } }, runtime: { async sendMessage(value) { returnMessages.push(value); return { ok: true }; } } },
    window: { async showDirectoryPicker() { return { name: selectedName, async queryPermission() { return "granted"; } }; } },
    location: { search: "?returnTab=7" }, URLSearchParams
  });
  vm.runInContext(fs.readFileSync("ui/local-images.js", "utf8"), page);
  await new Promise(resolve => setImmediate(resolve));
  for (const id of ["description", "beginner-help", "path-note", "subfolder-note", "size-note"]) assert.equal(fields[id].hidden, true, `${id}: local image explanations hidden in Pro`);
  assert.notEqual(fields.path.hidden, true); assert.notEqual(fields.folder.hidden, true); assert.notEqual(fields["save-return"].hidden, true);
  pagePreferenceChanged({ ysc_help_mode: { newValue: "novice" } }, "local");
  assert.equal(fields["size-note"].hidden, false); assert.equal(fields["beginner-help"].hidden, false);
  assert.equal(fields.path.value, "Images", "Existing selected directory is shown instead of a blank field");
  fields.path.value = '"C:\\Work\\Images"'; await fields.path.onchange();
  assert.equal(pageStored.ysc_local_image_settings.path, "C:\\Work\\Images");
  await fields["save-return"].onclick(); assert.equal(returnMessages.length, 0, "Pasting a new path alone cannot silently redirect writes");
  selectedName = "Other"; await fields.choose.onclick(); assert.equal(pageHandle.name, "Images", "A mismatched folder is not bound to the pasted path");
  selectedName = "Images"; await fields.choose.onclick();
  assert.equal(pageStored.ysc_local_image_settings.confirmedPath, "C:\\Work\\Images");
  fields.subfolder.value = "Catalog"; await fields["add-supplier"].onclick();
  assert.equal(fields.subfolder.value, "Catalog/{supplier}");
  fields.mode.value = "contain"; fields.width.value = "640"; fields.height.value = "480"; fields.background.value = "#eeeeee";
  await fields.mode.onchange(); assert.equal(fields.width.disabled, false); assert.equal(fields.background.disabled, false);
  assert.match(fields.preview.textContent, /C:\\Work\\Images\\Catalog\\\{supplier\}/);
  await fields["save-return"].onclick();
  assert.equal(returnMessages[0].tabId, 7); assert.equal(returnMessages[0].type, "YSC_LOCAL_IMAGE_RETURN");
  assert.equal(pageStored.ysc_local_image_settings.width, 640); assert.equal(pageStored.ysc_local_image_settings.height, 480);
  fields.mode.value = "original"; await fields.mode.onchange(); assert.equal(fields.width.disabled, true);
  console.log("Local JPG: path paste/confirmation, return-to-product, nested supplier folders, original/fit/crop geometry, file safety and capture checks passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
