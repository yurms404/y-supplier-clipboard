globalThis.YSCProfiles = (() => {
  const KEY = "ysc_profiles", VERSION = 1;
  const SELECTED = "ysc_selected_profiles";
  function pageUrl(value, domain) {
    try { const url = new URL(value); return /^https?:$/.test(url.protocol) && url.hostname === domain && !url.username && !url.password ? url.href : ""; }
    catch (_) { return ""; }
  }
  const defaultSupplier = domain => {
    const parts = String(domain || "").split(".").filter(Boolean);
    return (parts[0]?.toLowerCase() === "www" ? parts[1] : parts[0] || "").toUpperCase();
  };
  const base = domain => ({ schemaVersion: VERSION, id: crypto.randomUUID(), domain, enabled: true, supplier: defaultSupplier(domain), urlPattern: "", fields: { article: { enabled: true, source: "auto", selector: "", regex: "", attribute: "", value: "" }, name: { enabled: true, source: "auto", selector: "", regex: "", attribute: "", value: "" }, brand: { enabled: true, source: "auto", selector: "", regex: "", attribute: "", value: "" } }, format: {} });
  function normalize(profile) {
    const defaults = base(profile.domain || "");
    const fields = { ...defaults.fields, price: { enabled: true, source: "auto" }, currency: { enabled: true, source: "auto" }, unit: { enabled: true, source: "auto" }, imageUrl: { enabled: true, source: "auto" }, sheetLength: { enabled: true, source: "auto" }, sheetWidth: { enabled: true, source: "auto" }, sheetThickness: { enabled: true, source: "auto" }, usage: { enabled: true, source: "auto" }, kind: { enabled: true, source: "auto" }, info: { enabled: true, source: "manual" }, weight: { enabled: true, source: "manual" }, package: { enabled: true, source: "manual" } };
    for (const key of Object.keys(fields)) fields[key] = { selector: "", regex: "", attribute: "", value: "", ...fields[key], ...profile.fields?.[key] };
    const supplier = String(profile.supplier || "").trim().toLowerCase() === "www" ? defaults.supplier : profile.supplier;
    return { ...defaults, ...profile, supplier, lastUrl: pageUrl(profile.lastUrl, defaults.domain), blacklist: Array.isArray(profile.blacklist) ? profile.blacklist.filter(v => typeof v === "string").slice(0, 100) : [], fields, format: { excel: false, ...profile.format } };
  }
  const all = async () => ((await chrome.storage.local.get(KEY))[KEY] || []).map(normalize);
  let writes = Promise.resolve();
  function enqueue(write) {
    const pending = writes.then(write);
    writes = pending.catch(() => {});
    return pending;
  }
  async function get(url = location.href) {
    const profiles = await all(), selected = (await chrome.storage.local.get(SELECTED))[SELECTED] || {};
    const matching = profiles.filter(p => p.enabled && p.domain === location.hostname && (!p.urlPattern || url.includes(p.urlPattern)));
    return matching.find(p => p.id === selected[location.hostname]) || matching[0] || null;
  }
  function remember(profile, url = location.href) {
    const lastUrl = pageUrl(url, profile.domain);
    if (!lastUrl) return Promise.resolve();
    const snapshot = normalize(structuredClone(profile));
    return enqueue(async () => {
      const profiles = await all();
      let saved = profiles.find(p => p.id === snapshot.id && p.domain === snapshot.domain);
      if (!saved) { saved = snapshot; profiles.push(saved); }
      saved.lastUrl = lastUrl; saved.lastUsedAt = new Date().toISOString();
      await chrome.storage.local.set({ [KEY]: profiles });
      return { lastUrl: saved.lastUrl, lastUsedAt: saved.lastUsedAt };
    });
  }
  function select(id) {
    return enqueue(async () => {
      const profiles = await all(), profile = profiles.find(p => p.id === id);
      if (!profile) throw new Error("Профіль більше не існує.");
      const selected = (await chrome.storage.local.get(SELECTED))[SELECTED] || {};
      // Choosing a profile explicitly activates it; other profiles are kept unchanged.
      profile.enabled = true; selected[profile.domain] = profile.id;
      await chrome.storage.local.set({ [KEY]: profiles, [SELECTED]: selected });
    });
  }
  function save(profile) {
    const snapshot = structuredClone(profile);
    return enqueue(async () => {
      const profiles = await all(); const i = profiles.findIndex(p => p.id === snapshot.id);
      if (i >= 0) profiles[i] = snapshot; else profiles.push(snapshot);
      await chrome.storage.local.set({ [KEY]: profiles }); return snapshot;
    });
  }
  function saveSupplier(profile, supplier) {
    const { domain, id } = profile;
    return enqueue(async () => {
      const profiles = await all();
      const matches = profiles.filter(p => p.domain === domain);
      if (matches.length) matches.forEach(p => { p.supplier = supplier; });
      else profiles.push({ ...base(domain), id, supplier });
      // Only persist the domain's supplier, not unsaved extraction edits.
      await chrome.storage.local.set({ [KEY]: profiles });
    });
  }
  function saveField(profile, key, patch) {
    const { domain, id } = profile;
    // Only the domain's remembered value is written; unsaved rule edits stay untouched.
    const changes = Object.fromEntries(Object.entries(patch || {}).filter(([, value]) => typeof value === "string"));
    return enqueue(async () => {
      const profiles = await all();
      const matches = profiles.filter(p => p.domain === domain);
      if (matches.length) matches.forEach(p => { p.fields[key] = { ...p.fields[key], ...changes }; });
      else { const created = normalize({ ...base(domain), id }); created.fields[key] = { ...created.fields[key], ...changes }; profiles.push(created); }
      await chrome.storage.local.set({ [KEY]: profiles });
    });
  }
  function remove(id) { return enqueue(async () => { await chrome.storage.local.set({ [KEY]: (await all()).filter(p => p.id !== id) }); }); }
  function removeDomain(domain) {
    if (typeof domain !== "string" || !domain.trim()) return Promise.reject(new Error("Не вибрано домен."));
    return enqueue(async () => {
      const profiles = await all(), remaining = profiles.filter(p => p.domain !== domain);
      await chrome.storage.local.set({ [KEY]: remaining });
      return profiles.length - remaining.length;
    });
  }
  function saveBlacklist(profile, blacklist) {
    const { domain, id } = profile;
    const snapshot = [...blacklist];
    return enqueue(async () => {
      const profiles = await all(), matches = profiles.filter(p => p.domain === domain);
      if (matches.length) matches.forEach(p => { p.blacklist = snapshot; });
      else profiles.push({ ...base(domain), id, blacklist: snapshot });
      await chrome.storage.local.set({ [KEY]: profiles });
    });
  }
  function validate(value) { if (!Array.isArray(value)) throw new Error("Очікується масив профілів"); return value.map(p => normalize({ ...p, schemaVersion: VERSION })); }
  return { base: domain => normalize(base(domain)), all, get, save, saveSupplier, saveBlacklist, saveField, remove, removeDomain, validate, pageUrl, remember, select };
})();
