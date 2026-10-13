const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function load(query, ok = true) {
  const heading = {}, output = {}, requests = [];
  const document = { querySelector: id => id === "#document-title" ? heading : output };
  await vm.runInNewContext(fs.readFileSync("ui/help.js", "utf8"), {
    URL, document, location: { href: `https://example.test/help.html${query}` },
    chrome: { runtime: { getURL: name => `chrome-extension://test/${name}` } },
    fetch: async url => { requests.push(url); return { ok, status: 404, text: async () => "<b>literal document</b>" }; }
  });
  return { heading, output, requests };
}

(async () => {
  for (const [query, name] of [["?doc=readme", "README.md"], ["?doc=license", "LICENSE"], ["?doc=../../secret", "README.md"]]) {
    const result = await load(query);
    assert.equal(result.heading.textContent, name);
    assert.deepEqual(result.requests, [`chrome-extension://test/${name}`]);
    assert.equal(result.output.textContent, "<b>literal document</b>");
    assert.equal(result.output.innerHTML, undefined);
  }
  assert.match((await load("?doc=license", false)).output.textContent, /Could not load LICENSE: HTTP 404/);
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(manifest.version, pkg.version);
  assert.equal(pkg.license, "MIT");
  assert.match(fs.readFileSync("LICENSE", "utf8"), /MIT License/);
  console.log("Help tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
