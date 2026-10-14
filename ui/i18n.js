globalThis.YSCI18n = (() => {
  const languages = [
    { code: "uk", label: "UA · Українська" },
    { code: "en", label: "ENG · English" },
    { code: "ru", label: "RU · Русский" },
    { code: "de", label: "DE · Deutsch" },
    { code: "pl", label: "PL · Polski" },
    { code: "et", label: "ET · Eesti" },
    { code: "lv", label: "LV · Latviešu" }
  ];
  const dictionaries = {};
  let language = "uk", loading;
  let idsByText = {};
  // Bundled JSON files only. Read once per page; language switching stays synchronous.
  function load() {
    if (!loading) loading = Promise.all(languages.map(async ({ code }) => {
      const response = await fetch(chrome.runtime.getURL(`ui/locales/${code}.json`));
      if (!response.ok) throw new Error(`Cannot load language dictionary: ${code}`);
      const dictionary = await response.json();
      if (!dictionary || Array.isArray(dictionary) || typeof dictionary !== "object" || Object.values(dictionary).some(value => typeof value !== "string")) throw new Error(`Invalid language dictionary: ${code}`);
      return [code, dictionary];
    })).then(entries => {
      const locales = Object.fromEntries(entries);
      for (const id of Object.keys(locales.uk)) dictionaries[id] = Object.fromEntries(entries.map(([code, values]) => [code, values[id]]));
      // Legacy source/error messages remain compatible; UI code uses stable IDs.
      idsByText = Object.fromEntries(Object.entries(locales.uk).map(([id, text]) => [text, id]));
    }).catch(error => { loading = undefined; throw error; });
    return loading;
  }
  function setLanguage(value) { language = languages.some(item => item.code === value) ? value : "uk"; }
  function t(key, parameters = {}) {
    const leading = key.match(/^\s*/)[0], trailing = key.match(/\s*$/)[0];
    const lookup = key.trim();
    const id = Object.hasOwn(dictionaries, lookup) ? lookup : idsByText[lookup];
    const translated = dictionaries[id]?.[language] ?? dictionaries[id]?.en ?? dictionaries[id]?.uk ?? lookup;
    return (leading + translated + trailing).replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(parameters, name) ? String(parameters[name]) : match);
  }
  return { t, load, setLanguage, languages, get language() { return language; }, dictionaries };
})();
