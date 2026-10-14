const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
let dictionaryRequests = 0;
const context = {
  chrome: { runtime: { getURL: path => path } },
  fetch: async path => { dictionaryRequests++; return { ok: true, json: async () => JSON.parse(fs.readFileSync(path, "utf8")) }; }
};
vm.createContext(context); vm.runInContext(fs.readFileSync("ui/i18n.js", "utf8"), context);
const i18n = context.YSCI18n;
(async () => {
await Promise.all([i18n.load(), i18n.load()]);
await i18n.load();
assert.equal(dictionaryRequests, 7, "Bundled dictionaries are read only once per page");
assert.equal(i18n.language, "uk");
assert.equal(i18n.t("Скопіювати"), "Скопіювати");
for (const [key, translations] of Object.entries(i18n.dictionaries)) {
  for (const language of ["uk", "en", "ru", "de", "pl", "et", "lv"]) {
    assert.equal(typeof translations[language], "string", `${key}: missing ${language}`);
    const parameters = s => (s.match(/\{\w+\}/g) || []).sort();
    assert.deepEqual(parameters(translations[language]), parameters(translations.uk), `${key}: parameter mismatch in ${language}`);
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
for (const [language, settings, save] of [["de", "Einstellungen", "Profil speichern"], ["pl", "Ustawienia", "Zapisz profil"], ["et", "Seaded", "Salvesta profiil"], ["lv", "Iestatījumi", "Saglabāt profilu"]]) {
  i18n.setLanguage(language);
  assert.equal(i18n.t("settings"), settings);
  assert.equal(i18n.t("save_profile"), save);
  assert.ok(i18n.t("Прийнято в буфер{target}:\n{value}", { target: "", value: product }).endsWith(product));
  const locale = JSON.parse(fs.readFileSync(`ui/locales/${language}.json`, "utf8"));
  assert.deepEqual(Object.keys(locale).sort(), Object.keys(i18n.dictionaries).sort(), `${language}: dictionary keys must match`);
  const browserLocale = JSON.parse(fs.readFileSync(`_locales/${language}/messages.json`, "utf8"));
  assert.ok(browserLocale.extensionDescription.message);
  assert.ok(browserLocale.copyProduct.message);
}
i18n.setLanguage("de");
const saved = i18n.dictionaries.save_profile.de;
delete i18n.dictionaries.save_profile.de;
assert.equal(i18n.t("save_profile"), "Save profile", "A missing translation falls back to English");
i18n.dictionaries.save_profile.de = saved;
assert.equal(i18n.t("unknown_key"), "unknown_key");
console.log("Seven-language JSON coverage, caching, placeholders, fallback and product preservation passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
