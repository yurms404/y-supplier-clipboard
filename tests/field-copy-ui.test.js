/* Optional browser check: YSC_PLAYWRIGHT / YSC_BROWSER select the local runtime. */
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require(process.env.YSC_PLAYWRIGHT || "playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.YSC_BROWSER });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://localhost/**", route => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
      if (!pathname) return route.fulfill({ contentType: "text/html", body: '<html><head><meta charset="utf-8"></head><body><h1>Кріплення меблеве 20×20</h1><script type="application/ld+json">{"@type":"Product","name":"Кріплення меблеве 20×20","sku":"25225","brand":{"name":"Вибір ПКФ"},"offers":{"price":"138.51","priceCurrency":"UAH"}}</script></body></html>' });
      const file = path.resolve(pathname);
      if (!file.startsWith(process.cwd() + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith(".js") ? "text/javascript" : file.endsWith(".json") ? "application/json" : "text/css" });
    });
    await page.goto("http://localhost/");
    const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
    await page.evaluate(manifest => {
      const stored = { ysc_language: "uk" };
      window.copied = [];
      window.chrome = {
        storage: { local: { get: async () => ({ ...stored }), set: async value => Object.assign(stored, value) } },
        runtime: { getManifest: () => manifest, getURL: file => `http://localhost/${file}`,
          sendMessage: async message => { if (message.type === "YSC_COPY") window.copied.push(message.text); return { ok: true, update: null }; },
          onMessage: { addListener: callback => { window.extensionMessage = callback; } } }
      };
    }, manifest);
    for (const file of manifest.content_scripts[0].css) await page.addStyleTag({ path: file });
    for (const file of manifest.content_scripts[0].js) await page.addScriptTag({ path: file });
    await page.evaluate(() => window.extensionMessage({ type: "YSC_CONFIGURE" }));
    await page.waitForSelector("#ysc-copy-field-price");
    for (const width of [900, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const [key, value] of [["article", "00125-A"], ["name", "Ручна назва 20×20"], ["price", "1 004,46"]]) {
        await page.locator(`#ysc-value-${key}`).fill(value);
        const picker = page.locator(`#ysc-pick-${key}`), copy = page.locator(`#ysc-copy-field-${key}`);
        const a = await picker.boundingBox(), b = await copy.boundingBox();
        assert.ok(a.x + a.width <= b.x, `${width}px: picker and copy must not overlap`);
        await picker.focus(); await page.keyboard.press("Tab");
        assert.equal(await copy.evaluate(node => node === document.activeElement), true);
        await page.keyboard.press("Enter");
        assert.equal(await page.evaluate(() => window.copied.at(-1)), value);
      }
      assert.equal(await page.locator("#ysc-panel").evaluate(node => node.scrollWidth <= node.clientWidth), true);
    }
    if (process.env.YSC_SCREENSHOT) await page.screenshot({ path: process.env.YSC_SCREENSHOT });
    assert.deepEqual(errors, []);
    console.log("Field copy browser: real panel, narrow layout, no overlap, Tab/Enter and exact clipboard messages passed");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
