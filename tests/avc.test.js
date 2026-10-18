const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
let saved = {};
const context = { structuredClone, chrome: { storage: { local: { set: async payload => { Object.assign(saved, payload); }, get: async () => saved } } } };
vm.createContext(context);
for (const path of ["core/formatter.js", "storage/work-styles.js"]) vm.runInContext(fs.readFileSync(path, "utf8"), context);
const formatter = context.YSCFormatter, workStyles = context.YSCWorkStyles;

// 1. The A>V>C> palette style ships with a fresh install and is seeded once for an existing one.
const fresh = workStyles.migrate({}, {});
const style = fresh.styles.find(s => s.id === "avc-import-14");
assert.ok(style, "The AVC palette style is created on first run");
assert.equal(style.name, "AVC · 14 полів (A:N)");
const expectedColumns = ["avcName", "usage", "kind", "info", "sheetLength", "sheetWidth", "sheetThickness", "supplier", "article", "pricePerUnit", "weight", "package", "url", "imageUrl"];
assert.equal(style.format.excelColumns.slice(0, 14).join("|"), expectedColumns.join("|"), "A>V>C> expects 14 fields in a fixed order");
assert.ok(style.format.excelColumns.slice(14).every(key => key === "skip"), "Nothing follows the fourteenth palette field");
assert.equal(style.format.excelSeparator, "tab");
assert.equal(style.format.decimalDot, true, "The palette requires a period as the decimal separator");
assert.equal(style.format.dimensionUnits, false, "The palette wants bare numbers in the size fields");
assert.equal(style.format.dimensionInMillimetres, true, "Those bare numbers are whole millimetres");
assert.equal(style.format.replaceComma, false, "Commas inside the description must survive");
assert.equal(style.format.uppercaseSupplier, false);
assert.equal(style.format.optionalDimensions, true, "The palette accepts rows whose size fields stay empty");

const existing = workStyles.migrate({ ysc_work_styles: [{ id: "cad", name: "AVC / CAD", format: {} }], ysc_work_style: "cad" }, {});
assert.ok(existing.styles.some(s => s.id === "avc-import-14"), "An existing install gains the palette style");
assert.equal(existing.selected, "cad", "Seeding a style does not change the selected style");
assert.equal(existing.styles.at(-1).id, "cad", "The selected style stays last in the list");
const seededTwice = workStyles.migrate({ ysc_work_styles: existing.styles, ysc_work_style: "cad" }, {});
assert.equal(seededTwice.styles.filter(s => s.id === "avc-import-14").length, 1, "Seeding is idempotent");
workStyles.save({ styles: [], selected: "cad" });
assert.equal(saved.ysc_avc_style_added, true, "Saving the styles marks the palette style as seeded once");
const afterDelete = workStyles.migrate({ ysc_work_styles: [{ id: "cad", name: "AVC / CAD", format: {} }], ysc_work_style: "cad", ysc_avc_style_added: true }, {});
assert.ok(!afterDelete.styles.some(s => s.id === "avc-import-14"), "A palette style the user deleted stays deleted");
console.log("AVC palette style: fresh install, seeded existing install, one time seeding, order, separator and formatting flags passed");

// 2. A sheet material becomes exactly one copy session of 14 tab separated values.
const sheetRow = {
  supplier: "Viyar", article: "29699", name: "ДСП Kronospan 9455 PR Горіх Гварнері 2800x2070x16 мм",
  info: "ДСП Kronospan 9455 PR Горіх Гварнері 2800x2070x16 мм", usage: "Sheet", kind: "ДСП", weight: "11.2", package: "1",
  price: "657", currency: "UAH", unit: "лист", sheetLength: "2800", sheetWidth: "2070", sheetThickness: "16",
  url: "https://viyar.ua/ua/catalog/kronospan_9455_pr_orekh_gvarneri_2800kh2070kh16_mm/",
  imageUrl: "https://viyar.ua/cdn-cgi/image/w=578/https://viyarua-www-prod.s3.eu-central-1.amazonaws.com/dsp/ph29699.jpg"
};
const sheetFormat = { ...style.format, sheet: true, sheetInputUnit: "mm" };
const sheetBlocks = formatter.excelBlocks(sheetRow, sheetFormat);
assert.equal(sheetBlocks.length, 1, "A palette row must be a single copy session, never several blocks");
assert.equal(sheetBlocks[0].target, "A:N");
assert.equal(sheetBlocks[0].text.split("\t").length, 14, "The clipboard text carries exactly 14 fields");
assert.equal(sheetBlocks[0].text, [
  "ДСП Kronospan 9455 PR Горіх Гварнері 2800x2070x16 мм",
  "Sheet", "ДСП",
  "ДСП Kronospan 9455 PR Горіх Гварнері 2800x2070x16 мм",
  "2800", "2070", "16",
  "Viyar", "29699", "113.35", "11.2", "1",
  sheetRow.url, sheetRow.imageUrl
].join("\t"));
console.log("AVC sheet row: one session, 14 fields, bare millimetres, period decimals and per square metre price passed");

// 3. An item product keeps its commas, its own price and its dimensions.
const itemRow = {
  supplier: "Viyar", article: "Z-02-MAXI-W", name: "Уголок мебельный двойной белый Z-02 maxi",
  info: "Уголок мебельный двойной, пластик, белый", usage: "Item", kind: "Фурнитура", weight: "0.005", package: "100",
  price: "3.50", currency: "UAH", unit: "шт", sheetLength: "40", sheetWidth: "20", sheetThickness: "20",
  url: "https://viyar.ua/ua/catalog/ugolok_mebelnyy_dvoynoy_belyy_z_02_maxi/", imageUrl: "https://viyar.ua/cdn-cgi/image/w=578/ph38468.jpg"
};
const itemFields = formatter.excelBlocks(itemRow, { ...sheetFormat, sheetRod: false })[0].text.split("\t");
assert.equal(itemFields[3], "Уголок мебельный двойной, пластик, белый", "Description commas are preserved");
assert.equal(itemFields[4], "40", "A small size needs no unit to be read as millimetres");
assert.equal(itemFields[6], "20", "The thickness is a bare number too");
assert.equal(itemFields[9], "3.50", "An item keeps the card price instead of a per square metre one");
assert.equal(itemFields[7], "Viyar", "The supplier case is kept as typed");
console.log("AVC item row: preserved commas, bare millimetres and card price passed");

// 4. Rod materials are priced per running metre.
const rodRow = { ...sheetRow, usage: "Rod", unit: "пог.м", sheetLength: "5950", sheetWidth: "", sheetThickness: "18" };
assert.equal(formatter.excelValue("pricePerUnit", rodRow, { ...sheetFormat, sheetRod: true }), "110.42");
assert.equal(formatter.excelValue("sheetThickness", rodRow, { ...sheetFormat, sheetRod: true }), "18");
console.log("AVC rod row: running metre price and bare thickness passed");

// 5. The palette name drops the characters A>V>C> forbids in a block name.
assert.equal(formatter.avcName('A<>/\\":;?*|,=`B'), "A" + "-".repeat(13) + "B", "Every forbidden character becomes a dash");
assert.equal(formatter.avcName("  ДСП  Орех  "), "ДСП Орех", "Spaces collapse and the ends are trimmed");
assert.equal(formatter.avcName(""), "", "An empty name stays empty");
assert.equal(formatter.avcName("я".repeat(300)).length, 255, "A block name never exceeds 255 characters");
assert.equal(formatter.excelValue("avcName", { name: "ДСП Орех, 16 мм" }, {}), "ДСП Орех- 16 мм", "The name field is sanitised on its way out");
assert.equal(formatter.excelValue("avcName", { name: "Гвинт" }, {}), "Гвинт", "A clean name is copied as is");
console.log("AVC name: forbidden characters, spacing, empty name, length limit and the name field passed");

// 6. Decimal separator, dimension units and the name are style settings, not global ones.
assert.equal(formatter.excelValue("price", { price: "12,24" }, {}), "12,24", "Ukrainian Excel keeps the comma by default");
assert.equal(formatter.excelValue("price", { price: "12,24" }, { decimalDot: true }), "12.24");
assert.equal(formatter.excelValue("sheetLength", { sheetLength: "2800" }, { sheetInputUnit: "mm" }), "2,8");
assert.equal(formatter.excelValue("sheetLength", { sheetLength: "2800" }, { sheetInputUnit: "mm", decimalDot: true }), "2.8");
assert.equal(formatter.excelValue("sheetLength", { sheetLength: "2800" }, { sheetInputUnit: "mm", decimalDot: true, dimensionUnits: true }), "2.8m");
assert.equal(formatter.excelValue("sheetLength", { sheetLength: "2800" }, { sheetInputUnit: "mm", decimalDot: true, dimensionInMillimetres: true }), "2800", "Bare millimetres carry no unit");
assert.equal(formatter.excelValue("sheetLength", { sheetLength: "2800" }, { sheetInputUnit: "mm", decimalDot: true, dimensionUnits: true, dimensionInMillimetres: true }), "2800mm");
assert.equal(formatter.excelValue("sheetLength", { sheetLength: "2.8 м" }, { sheetInputUnit: "mm", decimalDot: true, dimensionInMillimetres: true }), "2800", "A metre value is converted, not copied");
assert.equal(formatter.excelValue("sheetThickness", { sheetThickness: "18" }, { decimalDot: true, dimensionUnits: true }), "18mm");
assert.equal(formatter.excelValue("weight", { weight: "11,2" }, { decimalDot: true }), "11.2");
assert.equal(formatter.numberValue("не число", { decimalDot: true }), "");
console.log("AVC number formatting: period, units, millimetres, weight normalisation and Excel comma default passed");

// 7. The palette fields are parsed from the unit of measure, defaulted and rule driven.
context.document = {
  querySelectorAll: selector => selector.includes("application/ld+json")
    ? [{ textContent: JSON.stringify({ "@type": "Product", name: "Ручка", sku: "6200", description: "Опис з метаданих", offers: { price: "192.00" } }) }] : [],
  querySelector: selector => selector === "h1" ? { textContent: "Ручка" } : null
};
context.location = { hostname: "example.com", href: "https://example.com/p" };
vm.runInContext(fs.readFileSync("core/parser.js", "utf8"), context);
const parser = context.YSCParser;
const withUnit = value => parser.parse({ fields: { unit: { enabled: true, source: "manual", value } } });
assert.equal(parser.parse().usage, "Item", "A product outside sheet mode is an item");
assert.equal(parser.parse({ format: { sheet: true } }).usage, "Sheet", "With no useful unit the sheet mode decides");
assert.equal(parser.parse({ format: { sheet: true, sheetRod: true } }).usage, "Rod", "Rod mode overrides sheet mode");
assert.equal(withUnit("пог.м").usage, "Rod", "Running metres need no mode to be recognised");
assert.equal(withUnit("м²").usage, "Sheet", "A square metre unit means a sheet material");
assert.equal(withUnit("лист").usage, "Sheet", "A sheet unit means a sheet material");
assert.equal(withUnit("м3").usage, "Volume", "A cubic metre unit means a volume material");
assert.equal(withUnit("шт").usage, "Item", "A piece unit means an item");
assert.equal(withUnit("").usage, "Item", "An unknown unit falls back to an item");
assert.equal(parser.parse({ format: { sheet: true }, fields: { unit: { enabled: true, source: "manual", value: "шт" } } }).usage, "Sheet", "Pieces leave the decision to the sheet mode");
const covered = parser.parse({ format: { sheet: true }, fields: { usage: { enabled: true, source: "manual", value: "Cover" } } });
assert.equal(covered.usage, "Cover", "A manual value wins over the unit of measure");
assert.equal(parser.parse({ fields: { weight: { enabled: true, source: "manual", value: "0.005" } } }).weight, "0.005");
assert.equal(parser.parse({ fields: { package: { enabled: true, source: "manual", value: "100" } } }).package, "100");
assert.equal(parser.parse({ fields: { kind: { enabled: true, source: "manual", value: "Фурнитура" } } }).kind, "Фурнитура");
assert.equal(parser.parse({ fields: { info: { enabled: true, source: "jsonld" } } }).info, "Опис з метаданих");
assert.equal(parser.parse({ fields: { info: { enabled: true, source: "auto" } } }).info, "Опис з метаданих", "Automatic detection reads the product metadata");
assert.equal(parser.parse({ fields: { kind: { enabled: true, source: "auto" } } }).kind, "", "Missing metadata stays empty instead of turning into an object");
assert.equal(parser.parse({ fields: { info: { enabled: true, source: "manual", value: "Вручну" } } }).info, "Вручну", "A typed value wins over metadata");
assert.equal(parser.parse({ fields: { info: { enabled: false } } }).info, "", "A disabled field stays empty");
assert.equal([...parser.extraFields].join("|"), ["usage", "kind", "info", "weight", "package"].join("|"));
console.log("AVC palette fields: usage from the unit, manual override, jsonld rule and disabled field passed");

console.log("A>V>C> property palette import compatibility passed");
