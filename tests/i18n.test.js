const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const context = {};
vm.createContext(context); vm.runInContext(fs.readFileSync("ui/i18n.js", "utf8"), context);
const i18n = context.YSCI18n;
assert.equal(i18n.language, "uk");
assert.equal(i18n.t("Скопіювати"), "Скопіювати");
for (const [key, translations] of Object.entries(i18n.dictionaries)) {
  for (const language of ["uk", "en", "ru"]) {
    assert.equal(typeof translations[language], "string", `${key}: missing ${language}`);
    const parameters = s => (s.match(/\{\w+\}/g) || []).sort();
    assert.deepEqual(parameters(translations[language]), parameters(key), `${key}: parameter mismatch in ${language}`);
  }
}
const content = fs.readFileSync("content.js", "utf8");
for (const match of content.matchAll(/\bt\(("(?:\\.|[^"\\])*")/g)) {
  const key = JSON.parse(match[1]).trim();
  assert.ok(i18n.dictionaries[key], `Untranslated interface key: ${key}`);
}
i18n.setLanguage("en");
assert.equal(i18n.t("Скопіювати → {target}", { target: "E:F" }), "Copy → E:F");
const product = "VIYAR 190218 Гвинт M4 L=25 цинк";
assert.equal(i18n.t("Прийнято в буфер{target}:\n{value}", { target: "", value: product }), `Copied to clipboard:\n${product}`);
i18n.setLanguage("ru");
assert.equal(i18n.t("Зберегти профіль"), "Сохранить профиль");
assert.equal(i18n.t(" Для Excel: повна назва · одиниця · ціна"), " Для Excel: полное название · единица · цена");
i18n.setLanguage("invalid");
assert.equal(i18n.language, "uk");
console.log("Three-language coverage, interpolation and product preservation passed");
