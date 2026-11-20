const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const code = fs.readFileSync("core/clipboard.js", "utf8");
function setup({ modern = false, existing = false, createError, race = false, supported = true, reply = { ok: true } } = {}) {
  const url = "chrome-extension://test/offscreen.html", messages = [];
  let open = existing, creates = 0, checks = 0;
  const runtime = { getURL: path => `chrome-extension://test/${path}`, sendMessage: async message => { messages.push(message); return reply; } };
  if (modern) runtime.getContexts = async filter => {
    assert.equal(filter.contextTypes[0], "OFFSCREEN_DOCUMENT");
    assert.equal(filter.documentUrls[0], url);
    checks++; return open ? [{}] : [];
  };
  const context = vm.createContext({
    chrome: { runtime, offscreen: supported ? { createDocument: async () => {
      creates++;
      if (createError) { open = race; throw new Error(createError); }
      open = true;
    } } : undefined },
    clients: { matchAll: async () => {
      checks++;
      // Other extension pages must not be mistaken for the offscreen document.
      return [{ url: "chrome-extension://test/ui/help.html" }, { url: `${url}?other` }, ...(open ? [{ url }] : [])];
    } }
  });
  vm.runInContext(code, context);
  return { copy: context.YSCClipboard.copy, messages, creates: () => creates, checks: () => checks };
}
(async () => {
  for (const modern of [false, true]) {
    for (const existing of [false, true]) {
      const worker = setup({ modern, existing });
      await worker.copy("VYBOR 25225\tКріплення\n138.51");
      await worker.copy("Наступний товар");
      assert.equal(worker.creates(), existing ? 0 : 1);
      assert.equal(worker.messages[0].type, "YSC_OFFSCREEN_COPY");
      assert.equal(worker.messages[0].text, "VYBOR 25225\tКріплення\n138.51");
    }
    const parallel = setup({ modern });
    await Promise.all([parallel.copy("a"), parallel.copy("b"), parallel.copy("c")]);
    assert.equal(parallel.creates(), 1);
    assert.equal(parallel.messages.length, 3);
    const raced = setup({ modern, createError: "Already open", race: true });
    await raced.copy("race");
    assert.equal(raced.messages.length, 1);
    const failed = setup({ modern, createError: "Creation rejected" });
    await assert.rejects(failed.copy("a"), /Creation rejected/);
    await assert.rejects(failed.copy("b"), /Creation rejected/);
    assert.equal(failed.creates(), 2); // Failed initialization must allow retry.
    assert.equal(failed.messages.length, 0);
  }
  const unsupported = setup({ supported: false });
  await assert.rejects(unsupported.copy("a"), /109.*offscreen/);
  assert.equal(unsupported.checks(), 0);
  await assert.rejects(setup({ reply: { ok: false, error: "Write denied" } }).copy("a"), /Write denied/);
  await assert.rejects(setup({ reply: null }).copy("a"), /Clipboard copy failed/);

  // Run the real offscreen handler with Clipboard API absent or rejecting writes.
  for (const clipboard of [undefined, { writeText: async () => { throw new Error("Not focused"); } }]) {
    for (const copied of [true, false]) {
      let listener, selected = false, removed = false;
      const context = vm.createContext({
        chrome: { runtime: { onMessage: { addListener: fn => { listener = fn; } } } },
        navigator: { clipboard },
        document: {
          createElement: () => ({ style: {}, setAttribute() {}, select() { selected = true; }, remove() { removed = true; } }),
          body: { append() {} }, execCommand: command => { assert.equal(command, "copy"); return copied; }
        }
      });
      vm.runInContext(fs.readFileSync("offscreen.js", "utf8"), context);
      const result = await new Promise(resolve => listener({ type: "YSC_OFFSCREEN_COPY", text: "Товар" }, {}, resolve));
      assert.equal(result.ok, copied);
      assert.equal(selected, true); assert.equal(removed, true);
    }
  }
  console.log("Clipboard: modern and Chrome 109 API paths, reuse, races, retries, unsupported browsers and DOM fallback passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
