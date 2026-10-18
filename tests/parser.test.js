const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const labelled = { innerText: "Артикул: 6200 128 BN-KR1", getClientRects: () => [1], closest: () => null };
const heading = { textContent: "Ручка Leroy чорна з кристалами м/о 128 мм" };
const document = {
  querySelectorAll(selector) {
    if (selector.includes("application/ld+json")) return [{ textContent: JSON.stringify({ "@type": "Product", sku: "00022707", name: heading.textContent, image: "/images/handle.jpg" }) }];
    return [labelled];
  },
  querySelector(selector) {
    if (selector === "h1") return heading;
    if (selector === ".selected-article") return { textContent: labelled.innerText };
    return null;
  }
};
const context = { URL, document, location: { hostname: "shop.example", href: "https://shop.example/product" } };
vm.createContext(context); vm.runInContext(fs.readFileSync("core/formatter.js", "utf8"), context); vm.runInContext(fs.readFileSync("core/parser.js", "utf8"), context);
const parser = context.YSCParser;
const auto = parser.parse();
assert.equal(auto.unit, "шт.", "Ordinary products without a site unit default to pieces");
assert.equal(auto.unitDefaulted, true);
assert.deepEqual(Array.from(auto.candidates.unit), [], "The default is not presented as site metadata");
// The type owns the size fields, so it is the sheet and rod type that keeps a missing unit empty.
const typedAs = value => parser.parse({ fields: { usage: { enabled: true, source: "manual", value } } });
assert.equal(typedAs("Sheet").unit, "", "Sheets must not default to pieces");
assert.equal(typedAs("Rod").unit, "", "Rods must not default to pieces");
assert.equal(parser.parse({ format: { sheet: true } }).unit, "шт.", "A stored sheet flag no longer stands in for the type");
assert.equal(parser.parse({ fields: { unit: { enabled: false, source: "manual", value: "м" } } }).unit, "");
assert.equal(parser.parse({ fields: { unit: { enabled: true, source: "manual", value: "комплект" } } }).unit, "комплект");
assert.deepEqual(Array.from(auto.candidates.article), ["00022707", "6200 128 BN-KR1"]);
assert.equal(parser.parse({ fields: { article: { enabled: true, source: "css", selector: ".selected-article" } } }).article, "6200 128 BN-KR1");
assert.equal(parser.cleanArticle("Артикул: MP14067345"), "MP14067345");
assert.equal(parser.cleanArticle("6200 128 BN-KR1"), "6200 128 BN-KR1");
assert.equal(auto.imageUrl, "https://shop.example/images/handle.jpg");
for (const empty of [undefined, null, "", "   ", {}, { url: "" }]) assert.equal(parser.imageUrl(empty), "", "Missing image must not resolve to the page URL");
assert.equal(parser.parse({ fields: { imageUrl: { enabled: true, source: "manual", value: "https://cdn.example/image.jpg" } } }).imageUrl, "https://cdn.example/image.jpg");
context.location.hostname = "www.eamf.ee";
assert.equal(parser.parse().supplier, "eamf");
assert.equal(parser.parse({ supplier: "WWW" }).supplier, "eamf");
const originalQuery = document.querySelector;
let priceNode;
document.querySelector = selector => selector === ".chosen-price" ? priceNode : originalQuery(selector);
const priceRule = { fields: { price: { enabled: true, source: "css", selector: ".chosen-price" } } };
priceNode = { textContent: "€9.59" };
assert.equal(parser.parse(priceRule).price, "9.59", "Picking a currency-prefixed price works without translation");
priceNode = { textContent: "12,24 євро" };
assert.equal(parser.parse(priceRule).price, "12.24", "The translated EAMF price remains readable");
priceNode = { textContent: "", getAttribute: key => key === "data-price-amount" ? "9.59" : null };
assert.equal(parser.parse(priceRule).price, "9.59", "An attribute-only price is readable by the CSS picker");
priceNode = { textContent: "", querySelectorAll: () => [{ getAttribute: key => key === "content" ? "9.59" : null }] };
assert.equal(parser.parse(priceRule).price, "9.59", "Picking a wrapper reads its price child");
document.querySelector = originalQuery;
const originalAll = document.querySelectorAll;
document.querySelectorAll = selector => selector.includes("application/ld+json") ? [{ textContent: JSON.stringify({ "@type": "Product", name: "Switch", offers: { price: "12.24", priceCurrency: "EUR" } }) }] : [];
assert.equal(parser.parse().currency, "EUR", "JSON-LD offer currency is parsed separately");
assert.equal(parser.parse({ fields: { currency: { enabled: true, source: "manual", value: "UAH" } } }).currency, "UAH");
assert.equal(parser.parse({ fields: { currency: { enabled: false, source: "manual", value: "UAH" } } }).currency, "");
document.querySelectorAll = selector => selector.includes("application/ld+json") ? [] : selector.includes('[class*="price"') ? [{ textContent: "12,24 євро" }] : [];
assert.equal(parser.parse().currency, "EUR", "Visible translated prices provide a currency fallback");
assert.equal(parser.priceCurrency({ textContent: "€12.24" }), "EUR", "The clicked price provides its currency");
document.querySelectorAll = originalAll;
console.log("parser regression tests passed");
