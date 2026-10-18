globalThis.YSCParser = (() => {
  // AVC property-palette fields that are not part of the standard product card.
  const extraFields = ["usage", "kind", "info", "weight", "package"];
  const jsonldFieldKeys = { name: "name", info: "description", kind: "category", usage: "usage", weight: "weight", package: "package" };
  const text = node => (node?.textContent || "").replace(/\s+/g, " ").trim();
  const safeQuery = selector => { try { return selector ? document.querySelector(selector) : null; } catch (_) { return null; } };
  function imageUrl(value) {
    const raw = typeof value === "object" && value ? (value.url || value.contentUrl || "") : value;
    if (typeof raw !== "string" || !raw.trim()) return "";
    try {
      const url = new URL(String(raw || ""), location.href);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch (_) { return ""; }
  }
  function removeBlocked(value, blacklist = []) {
    let cleaned = String(value ?? "");
    const phrases = [...new Set(blacklist.filter(v => typeof v === "string" && v.trim()).map(v => v.trim()))].sort((a, b) => b.length - a.length);
    for (const phrase of phrases) cleaned = cleaned.split(phrase).join("");
    return cleaned.replace(/\s+/g, " ").trim();
  }
  const cleanArticle = value => String(value || "").replace(/^\s*(?:артикул|article|sku|код товару)\s*[:：]\s*/i, "").replace(/\s+/g, " ").trim();
  function labelledArticles() {
    // Read only rendered page text, excluding our own editor and notifications.
    return [...document.querySelectorAll("p, li, div, span, td, dd")]
      .filter(el => !el.closest("#ysc-panel, [data-ysc-notice]") && el.getClientRects().length)
      .map(el => (el.innerText || "").trim())
      .filter(value => value.length < 160 && /^(?:артикул|article|sku|код товару)\s*[:：]/i.test(value) && !/[\r\n]/.test(value))
      .map(cleanArticle).filter(Boolean);
  }
  const jsonLd = () => [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(s => { try { const v = JSON.parse(s.textContent); return Array.isArray(v) ? v : [v]; } catch (_) { return []; } }).flatMap(v => v["@graph"] || [v]).filter(v => /Product/i.test(Array.isArray(v["@type"]) ? v["@type"].join(" ") : v["@type"] || ""));
  const offers = products => products.flatMap(p => Array.isArray(p.offers) ? p.offers : p.offers ? [p.offers] : []);
  const offerUnit = offer => offer?.priceSpecification?.referenceQuantity?.unitText || offer?.priceSpecification?.unitText || "";
  function priceNodes() {
    return [...document.querySelectorAll('[itemprop="price"], meta[property="product:price:amount"], [data-price], [class*="price" i]')]
      .filter(el => !el.closest?.('#ysc-panel, [data-ysc-notice], del, s, [class*="old" i], [class*="price-old" i]'));
  }
  function priceText(el) {
    if (!el) return "";
    const read = node => ["content", "data-price", "data-price-amount", "aria-label", "value"].map(attr => node.getAttribute?.(attr)).concat(node.value, text(node));
    const valid = values => values.find(value => YSCFormatter.priceNumber(value)) || "";
    let value = valid(read(el));
    if (value) return value;
    // Clicking a price wrapper must also work when its value is in a child attribute.
    const children = [...(el.querySelectorAll?.('[itemprop="price"], [data-price], [data-price-amount], [content], [aria-label], input') || [])];
    const prices = [...new Set(children.map(node => YSCFormatter.priceNumber(valid(read(node)))).filter(Boolean))];
    if (prices.length === 1) return prices[0];
    if (typeof getComputedStyle === "function") {
      try {
        value = valid(["::before", "::after"].map(pseudo => getComputedStyle(el, pseudo).content.replace(/^["']|["']$/g, "")));
      } catch (_) { /* Some documents do not expose computed pseudo-element styles. */ }
    }
    return value || "";
  }
  function priceCurrency(el) {
    if (!el) return "";
    const code = YSCFormatter.currencyCode;
    const values = [el.getAttribute?.("data-currency"), el.getAttribute?.("data-price-currency"), el.getAttribute?.("aria-label"), text(el)];
    for (const node of el.querySelectorAll?.('[itemprop="priceCurrency"], [data-currency], [data-price-currency]') || []) values.push(node.getAttribute?.("content"), node.getAttribute?.("data-currency"), node.getAttribute?.("data-price-currency"), text(node));
    return code(values.filter(Boolean).join(" "));
  }
  function unitFromPrice(value) { return String(value || "").match(/(?:грн\.?|₴|UAH)\s*\/\s*([\p{L}\d²³.\-–—−]+(?:\s*м)?)/iu)?.[1] || ""; }
  function sourceValue(rule, field, data) {
    if (!rule || !rule.enabled) return "";
    if (rule.source === "manual" || rule.source === "fixed") return field === "imageUrl" ? imageUrl(rule.value) : rule.value || "";
    if (rule.source === "url") { const value = new URL(location.href).searchParams.get(rule.value || rule.attribute || "") || ""; return field === "imageUrl" ? imageUrl(value) : value; }
    if (rule.source === "css" && field === "price") return priceText(safeQuery(rule.selector));
    if (rule.source === "css" || rule.source === "attribute") { const el = safeQuery(rule.selector); const value = rule.source === "attribute" ? el?.getAttribute(rule.attribute || "") || "" : field.startsWith("sheet") && /^(SELECT|INPUT)$/i.test(el?.tagName || "") ? text(el.selectedOptions?.[0]) || el.value || "" : text(el); return field === "imageUrl" ? imageUrl(value) : field === "article" ? cleanArticle(value) : field === "unit" ? unitFromPrice(value) || value : value; }
    if (rule.source === "regex") { try { const value = (document.body.innerText.match(new RegExp(rule.regex, "im")) || [])[1] || ""; return field === "imageUrl" ? imageUrl(value) : value; } catch (_) { return ""; } }
    if (rule.source === "jsonld") {
      if (field === "imageUrl") return imageUrl(Array.isArray(data.image) ? data.image[0] : data.image);
      if (["sheetLength", "sheetWidth", "sheetThickness"].includes(field)) return dimensionMetadata(data, field)[0] || "";
      if (field === "price") return String(offers([data])[0]?.price ?? "");
      if (field === "currency") return offers([data])[0]?.priceCurrency || offers([data])[0]?.priceSpecification?.priceCurrency || "";
      if (field === "unit") return offerUnit(offers([data])[0]);
      const raw = data[jsonldFieldKeys[field] || (field === "name" ? "name" : "sku")];
      return String((raw && typeof raw === "object" ? raw.value ?? raw.name ?? "" : raw) || "");
    }
    return "";
  }
  function candidates(field, blacklist = []) {
    if (field === "currency") {
      const metadata = [
        ...offers(jsonLd()).map(o => o.priceCurrency || o.priceSpecification?.priceCurrency),
        ...[...document.querySelectorAll('[itemprop="priceCurrency"], meta[property="product:price:currency"]')].map(el => el.getAttribute?.("content") || text(el))
      ].map(YSCFormatter.currencyCode).filter(Boolean);
      return [...new Set(metadata.length ? metadata : priceNodes().map(priceCurrency).filter(Boolean))];
    }
    if (field === "imageUrl") {
      const values = jsonLd().flatMap(product => Array.isArray(product.image) ? product.image : [product.image]).map(imageUrl);
      // JSON-LD represents the product gallery. Social metadata is only a fallback,
      // because it commonly repeats the first gallery image with a different CDN URL.
      if (!values.filter(Boolean).length) values.push(imageUrl(document.querySelector('meta[property="og:image"]')?.content), imageUrl(document.querySelector('meta[name="twitter:image"]')?.content));
      return [...new Set(values.filter(Boolean))];
    }
    if (["sheetLength", "sheetWidth", "sheetThickness"].includes(field)) return dimensionCandidates(field);
    if (field === "price") return [...new Set([
      ...offers(jsonLd()).map(o => o.price ?? o.priceSpecification?.price), ...priceNodes().map(priceText)
    ].map(v => YSCFormatter.priceNumber(removeBlocked(v, blacklist))).filter(Boolean))];
    if (field === "unit") return [...new Set([
      ...offers(jsonLd()).map(offerUnit), text(document.querySelector('[itemprop="unitText"]')),
      ...priceNodes().map(el => unitFromPrice(text(el)))
    ].filter(Boolean))];
    const products = jsonLd(); const key = field === "name" ? "name" : "sku";
    const values = products.map(p => p[key]).filter(v => typeof v === "string" && v.trim());
    if (field === "name") values.push(text(document.querySelector('[itemprop="name"]')), document.querySelector('meta[property="og:title"]')?.content, text(document.querySelector('h1')));
    if (field === "article") values.push(document.querySelector('[itemprop="sku"]')?.getAttribute("content"), text(document.querySelector('[itemprop="sku"], [data-sku], [class*="sku" i], [class*="article" i]')), ...labelledArticles());
    return [...new Set(values.filter(Boolean).map(v => field === "article" ? cleanArticle(v) : String(v).trim()))];
  }
  function dimensionMetadata(product, field) {
    const label = field === "sheetLength" ? /^(?:довжина|длина|length)$/iu : field === "sheetWidth" ? /^(?:ширина|width)$/iu : /^(?:товщина|толщина|thickness)$/iu;
    const values = [];
    const quantity = product[field === "sheetLength" ? "length" : field === "sheetWidth" ? "width" : "thickness"];
    if (quantity?.value != null && /^(?:mm|мм|m|м|MMT|MTR)$/i.test(quantity.unitText || quantity.unitCode || "")) values.push(`${quantity.value} ${/^(?:MMT)$/i.test(quantity.unitCode) ? "mm" : /^(?:MTR)$/i.test(quantity.unitCode) ? "m" : quantity.unitText || quantity.unitCode}`);
    for (const property of [].concat(product.additionalProperty || [])) {
      if (!label.test(String(property.name || "").split(",")[0].trim())) continue;
      const unit = property.unitText || property.unitCode || String(property.name).match(/,\s*(мм|mm|м|m)\s*$/iu)?.[1];
      if (property.value != null && unit) values.push(`${property.value} ${unit === "MMT" ? "mm" : unit === "MTR" ? "m" : unit}`);
    }
    return values;
  }
  function dimensionCandidates(field) {
    const label = field === "sheetLength" ? "(?:довжина|длина|length)" : field === "sheetWidth" ? "(?:ширина|width)" : "(?:товщина|толщина|thickness)";
    const pattern = new RegExp(`^${label}\\s*[,:(]?\\s*(мм|mm|м|m)\\s*[):]?\\s*(\\d+(?:[.,]\\d+)?)\\s*$`, "iu");
    const values = jsonLd().flatMap(product => dimensionMetadata(product, field));
    for (const el of document.querySelectorAll("tr, li, div, p, dd")) {
      if (el.closest?.("#ysc-panel, [data-ysc-notice]") || !el.getClientRects?.().length) continue;
      const value = text(el);
      if (value.length > 100) continue;
      const match = value.match(pattern);
      if (match) values.push(`${match[2]} ${match[1]}`);
    }
    return [...new Set(values.filter(v => YSCFormatter.dimensionMetres(v)))];
  }
  function parse(profile = {}) {
    const product = jsonLd()[0] || {};
    const fields = profile.fields || {};
    const cleanValues = values => [...new Set(values.map(v => removeBlocked(v, profile.blacklist)).filter(Boolean))];
    const articleValues = cleanValues(fields.article?.source === "auto" || !fields.article ? candidates("article") : [sourceValue(fields.article, "article", product)].filter(Boolean));
    const nameValues = cleanValues(fields.name?.source === "auto" || !fields.name ? candidates("name") : [sourceValue(fields.name, "name", product)].filter(Boolean));
    const valuesFor = key => cleanValues(fields[key]?.source === "auto" || !fields[key] ? candidates(key, profile.blacklist) : [sourceValue(fields[key], key, product)].filter(Boolean));
    const priceValues = valuesFor("price").map(YSCFormatter.priceNumber).filter(Boolean), unitValues = valuesFor("unit"), imageValues = valuesFor("imageUrl");
    const currencyValues = valuesFor("currency").map(YSCFormatter.currencyCode).filter(Boolean);
    const unitDefaulted = !unitValues.length && !profile.format?.sheet && fields.unit?.enabled !== false;
    const unit = unitValues[0] || (unitDefaulted ? "шт." : "");
    const hostnameParts = location.hostname.split(".");
    const hostnameSupplier = hostnameParts[0]?.toLowerCase() === "www" ? hostnameParts[1] : hostnameParts[0];
    const configuredSupplier = /^www$/i.test(String(profile.supplier || "").trim()) ? "" : profile.supplier;
    const supplier = removeBlocked(configuredSupplier || sourceValue(fields.supplier, "supplier", product) || hostnameSupplier, profile.blacklist);
    // The type of the position follows the unit of measure. When the unit says nothing (pieces, packages) the
    // sheet or rod mode of the domain decides, and a plain product stays an item.
    const detectedUsage = YSCFormatter.usages[YSCFormatter.detectUsage(unitDefaulted ? "" : unit)];
    const usageAuto = detectedUsage === "Item" && profile.format?.sheet ? (profile.format.sheetRod ? "Rod" : "Sheet") : detectedUsage;
    // AVC palette fields. A rule or a manual choice overrides the automatic type.
    const extras = Object.fromEntries(extraFields.map(key => {
      const rule = { enabled: true, selector: "", regex: "", attribute: "", value: "", ...(fields[key] || {}) };
      // The type is derived, not scraped, so a leftover rule can never switch the field off.
      if (key === "usage" && (!rule.source || rule.source === "auto")) return [key, usageAuto];
      if (!rule.enabled) return [key, ""];
      // Automatic detection for the palette fields reads the product metadata, where shops keep the description and the category.
      const source = !rule.source || rule.source === "auto" ? "jsonld" : rule.source;
      return [key, removeBlocked(sourceValue({ ...rule, source }, key, product), profile.blacklist)];
    }));
    const sheetLength = profile.format?.sheet ? valuesFor("sheetLength") : [], sheetWidth = profile.format?.sheet ? valuesFor("sheetWidth") : [];
    const sheetThickness = profile.format?.sheet ? [...new Set(valuesFor("sheetThickness").map(YSCFormatter.thicknessMm).filter(Boolean))] : [];
    return { ...extras, usageAuto, supplier, article: articleValues[0] || "", name: nameValues[0] || "", price: priceValues[0] || "", currency: currencyValues.length === 1 ? currencyValues[0] : "", unit, unitDefaulted, imageUrl: imageValues[0] || "", sheetLength: sheetLength[0] || "", sheetWidth: sheetWidth[0] || "", sheetThickness: sheetThickness[0] || "", candidates: { article: articleValues, name: nameValues, price: priceValues, currency: currencyValues, unit: unitValues, imageUrl: imageValues, sheetLength, sheetWidth, sheetThickness }, productDetected: Boolean(product.name || text(document.querySelector("h1"))) };
  }
  return { parse, candidates, safeQuery, text, cleanArticle, removeBlocked, imageUrl, priceText, priceCurrency, extraFields };
})();
