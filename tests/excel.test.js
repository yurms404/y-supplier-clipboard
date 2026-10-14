const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const context = {};
vm.createContext(context); vm.runInContext(fs.readFileSync("core/formatter.js", "utf8"), context);
const formatter = context.YSCFormatter;
assert.equal(formatter.format({ supplier: "SIRIUS", article: "6200", name: "Ручка, чорна", unit: "шт", price: "192.00 грн/шт" }, { excel: true }), "SIRIUS 6200 Ручка- чорна\tшт\t192,00");
assert.equal(formatter.format({ supplier: "VIYAR", article: "190218", name: "Гвинт M4 L=25 цинк", unit: "шт", price: "1.02" }, { excel: true }), "VIYAR 190218 Гвинт M4 L=25 цинк\tшт\t1,02");
assert.equal(formatter.format({ supplier: "VIYAR", article: "190218", name: "Гвинт", unit: "шт", price: "1.02" }, { excel: true, supplier: false }), "190218 Гвинт\tшт\t1,02");
assert.equal(formatter.format({ supplier: "SIRIUS", article: "6200", name: "Ручка, чорна", unit: "шт", price: "192" }), "SIRIUS 6200 Ручка- чорна");
assert.equal(formatter.priceNumber("1 234,50 грн/м²"), "1234.50");
assert.equal(formatter.priceNumber("100–200 грн"), "");
assert.equal(formatter.priceNumber("192 грн 240 грн"), "");
assert.equal(formatter.formatExcel({ name: "=SUM(A1:A3)\nТовар", unit: "шт", price: "0" }), "'=SUM(A1:A3) Товар\tшт\t0");
const product = { supplier: "VIYAR", article: "190218", name: "Гвинт", unit: "шт", price: "1.02" };
assert.equal(formatter.excelBlocks(product, { excelColumns: [{ text: "Мій текст" }, "article"] })[0].text, "Мій текст\t190218");
assert.equal(formatter.excelBlocks(product, { excelColumns: ["name", "join", { text: "на замовлення" }] })[0].text, "Гвинт на замовлення");
assert.equal(formatter.excelBlocks(product, { excelColumns: [{ text: "  Два  пробіли  " }] })[0].text, "  Два  пробіли  ");
assert.equal(formatter.excelValue({ text: "=1+1" }, product), "'=1+1");
assert.throws(() => formatter.excelColumns({ excelColumns: [{ text: 12 }] }), /Невірна/);
const pageUrl = "https://shop.example/product?size=2,8&variant=18#details";
assert.equal(formatter.excelBlocks({ ...product, url: pageUrl }, { excelColumns: ["url"] })[0].text, pageUrl);
const imageUrl = "https://cdn.shop.example/images/190218.jpg";
assert.equal(formatter.excelBlocks({ ...product, imageUrl }, { excelColumns: ["imageUrl"] })[0].text, imageUrl);
assert.equal(formatter.excelBlocks({ ...product, imageUrl }, { excelColumns: ["imageUrl"], excelImageFormula: true })[0].text, `=IMAGE("${imageUrl}")`);
assert.equal(formatter.excelBlocks({ ...product, imageUrl }, { excelColumns: ["imageFormula"] })[0].text, `=IMAGE("${imageUrl}")`);
assert.equal(formatter.excelBlocks({ ...product, url: pageUrl }, { excelColumns: ["article", "url"] })[0].text, `190218\t${pageUrl}`);
const blocks = formatter.excelBlocks(product);
const verticalBlocks = formatter.excelBlocks(product, { excelVertical: true });
assert.equal(verticalBlocks[0].target, "2");
assert.equal(verticalBlocks[1].target, "5:6");
assert.equal(verticalBlocks[1].text, "шт\r\n1,02");
assert.equal(formatter.excelBlocks(product, { excelVertical: true, excelColumns: ["supplier", "article", "name"] })[0].text, "VIYAR\r\n190218\r\nГвинт");
assert.equal(formatter.excelBlocks(product, { excelVertical: false, excelColumns: ["supplier", "article", "name"] })[0].text, "VIYAR\t190218\tГвинт");
assert.equal(formatter.excelBlocks(product, { excelSeparator: "enter", excelColumns: ["supplier", "article", "name"] })[0].text, "VIYAR\r\n190218\r\nГвинт");
assert.equal(formatter.excelBlocks(product, { excelSeparator: "space", excelColumns: ["supplier", "article", "name"] })[0].text, "VIYAR 190218 Гвинт");
assert.deepEqual(Array.from(formatter.excelBlocks(product, { excelSeparator: "space", excelColumns: ["name", "join", "supplier", "article"] }), block => [block.target, block.text]), [["A", "Гвинт   VIYAR 190218"]]);
assert.deepEqual(Array.from(formatter.excelBlocks(product, { excelSeparator: "space", excelColumns: ["skip", "name", "join", "supplier", "skip", "article"] }), block => [block.target, block.text]), [["B", "Гвинт   VIYAR 190218"]]);
assert.equal(formatter.excelBlocks({ ...product, supplier: "" }, { excelSeparator: "space", excelColumns: ["name", "join", "supplier", "article"] })[0].text, "Гвинт    190218");
assert.equal(formatter.excelBlocks(product, { excelSeparator: "ascii", excelAscii: 59, excelColumns: ["supplier", "article", "name"] })[0].text, "VIYAR;190218;Гвинт");
assert.equal(formatter.excelBlocks(product, { excelSeparator: "ascii", excelAscii: 999, excelColumns: ["supplier", "article"] })[0].text, "VIYAR\t190218");
assert.deepEqual(Array.from(formatter.excelBlocks(product, { excelColumns: ["supplier", "join", "article", "name"] }), block => [block.target, block.text]), [["A", "VIYAR 190218"], ["D", "Гвинт"]]);
assert.equal(formatter.excelBlocks(product, { excelColumns: ["supplier", "join", "article", "join", "name"] })[0].text, "VIYAR 190218 Гвинт");
assert.throws(() => formatter.excelBlocks(product, { excelColumns: ["join", "supplier"] }), /Об’єднання/);
assert.equal(blocks.length, 2);
assert.equal(blocks[0].target, "B");
assert.equal(blocks[0].text, "VIYAR 190218 Гвинт");
assert.equal(blocks[1].target, "E:F");
assert.equal(blocks[1].text, "шт\t1,02");
const row = ["№", "стара назва", "5", "459", "од", "ціна"];
for (const block of blocks) block.text.split("\t").forEach((v, i) => { row[block.start - 1 + i] = v; });
assert.deepEqual(row, ["№", "VIYAR 190218 Гвинт", "5", "459", "шт", "1,02"]);
assert.equal(formatter.excelBlocks(product, { excelLayout: { name: 2, unit: 3, price: 4 } }).length, 1);
assert.equal(formatter.excelBlocks(product, { excelLayout: { name: 6, unit: 5, price: 2 } })[0].text, "1,02");
assert.throws(() => formatter.excelBlocks(product, { excelLayout: { name: 2, unit: 2, price: 6 } }), /окремий/);
assert.throws(() => formatter.excelBlocks(product, { excelLayout: { name: 0, unit: 5, price: 6 } }), /окремий/);
const columns = Array(26).fill("skip");
columns[1] = "supplier"; columns[2] = "article"; columns[4] = "name"; columns[5] = "price"; columns[25] = "article";
const customBlocks = formatter.excelBlocks(product, { excelColumns: columns });
assert.deepEqual(Array.from(customBlocks, block => block.target), ["B:C", "E:F", "Z"]);
assert.deepEqual(Array.from(customBlocks, block => block.text), ["VIYAR\t190218", "Гвинт\t1,02", "190218"]);
const untouchedRow = Array(26).fill("keep");
for (const block of customBlocks) block.text.split("\t").forEach((value, offset) => { untouchedRow[block.start - 1 + offset] = value; });
assert.equal(untouchedRow[0], "keep"); assert.equal(untouchedRow[3], "keep"); assert.equal(untouchedRow[24], "keep");
assert.equal(formatter.excelBlocks(product, { excelColumns: ["name"] })[0].text, "Гвинт");
assert.equal(formatter.excelBlocks(product, { excelColumns: ["fullName"] })[0].text, "VIYAR 190218 Гвинт");
assert.equal(formatter.excelBlocks(product, { excelColumns: ["supplier", "article"], supplier: false, article: false })[0].text, "VIYAR\t190218", "Explicit component columns are independent of full-name flags");
assert.equal(formatter.excelBlocks({ ...product, article: "=1+1" }, { excelColumns: ["article"] })[0].text, "'=1+1");
const sheet = { ...product, unit: "лист", sheetLength: "2800 мм", sheetWidth: "2070 мм", sheetThickness: "18" };
assert.equal(formatter.excelBlocks(sheet, { sheet: true, excelColumns: ["sheetLength", "sheetWidth", "sheetThickness", "sheetSize", "plainUnit", "unit"] })[0].text, "2,8\t2,07\t18\t(2,8*2,07)\tлист\tлист (2,8*2,07)");
assert.throws(() => formatter.excelBlocks(product, { excelColumns: Array(26).fill("skip") }), /хоча б одне/);
assert.throws(() => formatter.excelColumns({ excelColumns: ["invalid"] }), /Невірна/);
assert.throws(() => formatter.excelColumns({ excelColumns: Array(27).fill("skip") }), /Невірна/);
assert.deepEqual(Array.from(formatter.excelColumns({ excelLayout: { name: 2, unit: 5, price: 6 } })).slice(0, 6), ["skip", "fullName", "skip", "skip", "unit", "price"]);
console.log("Column-field constructor: legacy migration, components, repeated fields, dimensions, skipped cells and safe text passed");
context.document = {
  querySelectorAll(selector) {
    if (selector.includes("application/ld+json")) return [{ textContent: JSON.stringify({ "@type": "Product", name: "Ручка", sku: "6200", offers: { price: "192.00", priceSpecification: { referenceQuantity: { unitText: "шт" } } } }) }];
    return [];
  },
  querySelector() { return null; }
};
context.location = { hostname: "example.com" };
vm.runInContext(fs.readFileSync("core/parser.js", "utf8"), context);
assert.equal(context.YSCParser.parse().price, "192.00");
assert.equal(context.YSCParser.parse().unit, "шт");
context.document = {
  querySelectorAll(selector) {
    if (selector.includes("application/ld+json")) return [];
    if (selector.includes('itemprop="price"')) return [
      { textContent: "240.00 грн/шт", closest: () => ({ tagName: "DEL" }) },
      { textContent: "192.00 грн/шт", closest: () => null, getAttribute: () => null }
    ];
    return [];
  },
  querySelector(selector) { return selector === "h1" ? { textContent: "Ручка" } : null; }
};
assert.equal(context.YSCParser.parse().price, "192.00");
assert.equal(context.YSCParser.parse().unit, "шт");
console.log("Excel formatting and price extraction tests passed");
for (const unit of ["к-т", "к–т", "к—т", "к−т", "комплект"]) {
  const priceText = `3 806.10 ₴ / ${unit}`;
  const priceNode = { textContent: priceText, closest: () => null, getAttribute: () => null };
  context.document.querySelectorAll = selector => selector.includes('itemprop="price"') ? [priceNode] : [];
  context.document.querySelector = selector => selector === ".picked-price" ? priceNode : selector === "h1" ? { textContent: "Комплект шухляди" } : null;
  const parsed = context.YSCParser.parse();
  assert.equal(parsed.unit, unit);
  assert.equal(parsed.price, "3806.10");
  assert.equal(context.YSCParser.parse({ fields: { unit: { enabled: true, source: "css", selector: ".picked-price" } } }).unit, unit);
  assert.equal(formatter.formatExcel(parsed).split("\t")[1], unit);
  assert.equal(formatter.priceNumber(priceText), "3806.10");
}
console.log("Hyphenated комплект units: auto, picker and clipboard tests passed");
