const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const labelled = { innerText: "Артикул: 6200 128 BN-KR1", getClientRects: () => [1], closest: () => null };
const heading = { textContent: "Ручка Leroy чорна з кристалами м/о 128 мм" };
const document = {
  querySelectorAll(selector) {
    if (selector.includes("application/ld+json")) return [{ textContent: JSON.stringify({ "@type": "Product", sku: "00022707", name: heading.textContent }) }];
    return [labelled];
  },
  querySelector(selector) {
    if (selector === "h1") return heading;
    if (selector === ".selected-article") return { textContent: labelled.innerText };
    return null;
  }
};
const context = { document, location: { hostname: "shop.example", href: "https://shop.example/product" } };
vm.createContext(context); vm.runInContext(fs.readFileSync("core/formatter.js", "utf8"), context); vm.runInContext(fs.readFileSync("core/parser.js", "utf8"), context);
const parser = context.YSCParser;
const auto = parser.parse();
assert.deepEqual(Array.from(auto.candidates.article), ["00022707", "6200 128 BN-KR1"]);
assert.equal(parser.parse({ fields: { article: { enabled: true, source: "css", selector: ".selected-article" } } }).article, "6200 128 BN-KR1");
assert.equal(parser.cleanArticle("Артикул: MP14067345"), "MP14067345");
assert.equal(parser.cleanArticle("6200 128 BN-KR1"), "6200 128 BN-KR1");
console.log("parser regression tests passed");
