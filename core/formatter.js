/* Pure formatter; exposed for both extension and tests. */
globalThis.YSCFormatter = (() => {
  const defaults = { supplier: true, article: true, name: true, replaceComma: true, normalizeSpaces: true, stripControls: true, uppercaseSupplier: true, decimalDot: false, dimensionUnits: false, dimensionInMillimetres: false, optionalDimensions: false };
  function clean(value, options) {
    let text = String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ");
    if (options.replaceComma) text = text.replace(/,/g, "-");
    return options.normalizeSpaces ? text.replace(/\s+/g, " ").trim() : text.trim();
  }
  // Ukrainian Excel expects a comma; AVC and most CAD receivers require a period.
  const decimal = (value, options = {}) => options.decimalDot ? String(value) : String(value).replace(".", ",");
  function numberValue(value, options = {}) {
    const raw = String(value ?? "").trim().replace(/[\s\u00a0\u202f]/g, "");
    return /^-?\d+(?:[.,]\d+)?$/.test(raw) ? decimal(raw.replace(",", "."), options) : "";
  }
  const priceValue = (value, options = {}) => { const number = priceNumber(value); return number ? decimal(number, options) : ""; };
  // Sheet and cover materials are priced per square metre, rods and banding per running metre; anything else keeps the card price.
  function unitPrice(fields, options = {}) {
    const number = priceNumber(fields.price);
    if (!number) return "";
    const usage = String(fields.usage || "").trim().toLowerCase();
    const perMetre = ["rod", "banding"].includes(usage) || (!usage && Boolean(options.sheetRod));
    const perSquare = ["sheet", "cover"].includes(usage) || (!usage && Boolean(options.sheet) && !options.sheetRod);
    if (!perMetre && !perSquare) return number;
    const metres = value => dimensionNumber(value, options.sheetInputUnit || "mm");
    const length = metres(fields.sheetLength);
    if (!(length > 0)) return number;
    if (perMetre) return String(Number((Number(number) / length).toFixed(2)));
    const width = metres(fields.sheetWidth);
    if (!(width > 0)) return number;
    return String(Number((Number(number) / (length * width)).toFixed(2)));
  }
  function format(fields, format = {}) {
    if (format.excel) return formatExcel(fields, format);
    const options = { ...defaults, ...format };
    const supplier = clean(fields.supplier, options);
    const parts = [];
    if (options.supplier && supplier) parts.push(options.uppercaseSupplier ? supplier.toUpperCase() : supplier);
    if (options.article && fields.article) parts.push(clean(fields.article, options));
    if (options.name && fields.name) parts.push(clean(fields.name, options));
    const thickness = options.sheet && !options.sheetRod ? thicknessMm(fields.sheetThickness, options) : "";
    if (options.name && fields.name && thickness) parts.push(`- ${thickness}`);
    return parts.filter(Boolean).join(" ");
  }
  function priceNumber(value) {
    const currency = "(?:грн\\.?|₴|UAH|USD|EUR|GBP|PLN|CZK|CHF|CAD|AUD|SEK|NOK|DKK|ISK|JPY|CNY|euros?|євро|евро|US\\s*\\$|zł|Kč|kr\\.?|[$€£])";
    const raw = String(value ?? "").trim().replace(new RegExp(`^${currency}\\s*`, "iu"), "").replace(new RegExp(`\\s*${currency}(?:\\s*\\/\\s*[\\p{L}\\d²³. \\-–—−]+)?$`, "iu"), "").replace(/[\s\u00a0\u202f]/g, "");
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) return "";
    return raw.replace(",", ".");
  }
  function currencyCode(value) {
    const raw = String(value ?? "").trim();
    const codes = raw.toUpperCase().match(/\b(?:EUR|UAH|USD|GBP|PLN|CZK|CHF|CAD|AUD|SEK|NOK|DKK|ISK|JPY|CNY)\b/g) || [];
    if (/€|(?:^|[^\p{L}])(?:euros?|євро|евро)(?=$|[^\p{L}])/iu.test(raw)) codes.push("EUR");
    if (/₴|(?:^|[^\p{L}])грн\.?(?=$|[^\p{L}])/iu.test(raw)) codes.push("UAH");
    if (/£/.test(raw)) codes.push("GBP");
    if (/US\s*\$/i.test(raw)) codes.push("USD");
    if (/(?:^|[^\p{L}])zł(?=$|[^\p{L}])/iu.test(raw)) codes.push("PLN");
    if (/(?:^|[^\p{L}])Kč(?=$|[^\p{L}])/iu.test(raw)) codes.push("CZK");
    const distinct = [...new Set(codes)];
    return distinct.length === 1 ? distinct[0] : "";
  }
  function formatExcel(fields, options = {}) {
    // Nonadjacent destinations remain separate sessions, never padded with empty cells.
    if (options.excelColumns !== undefined || options.excelVertical || options.excelSeparator !== undefined) return excelBlocks(fields, options).map(block => block.text).join("\n");
    // TSV: the full formatted product description, unit and numeric price.
    const cell = value => {
      const cleaned = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
      return /^[=+@-]/.test(cleaned) ? `'${cleaned}` : cleaned;
    };
    return [cell(format(fields, { ...options, excel: false })), cell(sheetUnit(fields, options)), priceValue(fields.price, options)].join("\t");
  }
  // Numeric core: every dimension becomes metres, the display settings only decide how it is written out.
  function dimensionNumber(value, inputUnit = "mm") {
    const match = String(value ?? "").trim().match(/^(?:(?:довжина|ширина|длина|length|width|товщина|толщина|thickness)\s*[,:(]?\s*(мм|mm|м|m)?\s*[):]?\s*)?(\d+(?:[.,]\d+)?)\s*(мм|mm|м|m)?$/iu);
    if (!match) return 0;
    const unit = (match[3] || match[1] || inputUnit).toLowerCase();
    if (!["mm", "мм", "m", "м"].includes(unit)) return 0;
    const metres = Number(match[2].replace(",", ".")) / (["mm", "мм"].includes(unit) ? 1000 : 1);
    if (!Number.isFinite(metres) || metres <= 0 || metres > 100) return 0;
    return Number(metres.toFixed(6));
  }
  function dimensionMetres(value, inputUnit = "mm", options = {}) {
    const rounded = dimensionNumber(value, inputUnit);
    return rounded > 0 ? decimal(String(rounded), options) : "";
  }
  function sheetSize(fields, options = {}) {
    const length = dimensionMetres(fields.sheetLength, options.sheetInputUnit || "mm", options);
    if (options.sheetRod) return length ? `(${length})` : "";
    const width = dimensionMetres(fields.sheetWidth, options.sheetInputUnit || "mm", options);
    return length && width ? `(${length}*${width})` : "";
  }
  function thicknessMm(value, options = {}) {
    const millimetres = Number((dimensionNumber(value, "mm") * 1000).toFixed(3));
    return millimetres > 0 ? decimal(String(millimetres), options) : "";
  }
  function sheetUnit(fields, options = {}) {
    const unit = String(fields.unit || "").trim();
    const size = options.sheet ? sheetSize(fields, options) : "";
    return size ? `${unit} ${size}`.trim() : unit;
  }
  // A receiver such as AVC reads "-" as "leave the current value unchanged"; Excel would read it as a formula start.
  const protect = value => value.trim() === "-" ? "-" : /^[=+@-]/.test(value) ? `'${value}` : value;
  // AVC rules: dimensions may carry a unit, the receiver converts it into the drawing's units.
  function dimensionWithUnit(value, options = {}) {
    const metres = dimensionNumber(value, options.sheetInputUnit || "mm");
    if (!(metres > 0)) return "";
    const millimetres = options.dimensionInMillimetres;
    const number = millimetres ? Number((metres * 1000).toFixed(3)) : metres;
    if (!(number > 0)) return "";
    const text = decimal(String(number), options);
    return options.dimensionUnits ? `${text}${millimetres ? "mm" : "m"}` : text;
  }
  const thicknessWithUnit = (value, options = {}) => { const millimetres = thicknessMm(value, options); return millimetres && options.dimensionUnits ? `${millimetres}mm` : millimetres; };
  const excelLayout = { name: 2, unit: 5, price: 6 };
  const columnName = column => String.fromCharCode(64 + column);
  const excelFields = ["fullName", "supplier", "article", "name", "info", "unit", "plainUnit", "price", "pricePerUnit", "currency", "sheetLength", "sheetWidth", "sheetThickness", "sheetSize", "usage", "kind", "weight", "package", "url", "imageUrl", "imageFormula"];
  const excelJoin = "join";
  const isLiteralColumn = key => Boolean(key && typeof key === "object" && !Array.isArray(key) && typeof key.text === "string");
  function excelColumns(options = {}) {
    if (options.excelColumns !== undefined) {
      if (!Array.isArray(options.excelColumns) || options.excelColumns.length > 26 || options.excelColumns.some(key => key !== "skip" && key !== excelJoin && !excelFields.includes(key) && !isLiteralColumn(key))) throw new Error("Невірна схема стовпців Excel.");
      return Array.from({ length: 26 }, (_, i) => options.excelColumns[i] || "skip");
    }
    const layout = { ...excelLayout, ...options.excelLayout };
    const columns = [layout.name, layout.unit, layout.price];
    if (columns.some(n => !Number.isInteger(n) || n < 1 || n > 26) || new Set(columns).size !== 3) throw new Error("Для кожного поля виберіть окремий стовпець від A до Z.");
    const result = Array(26).fill("skip");
    result[layout.name - 1] = "fullName"; result[layout.unit - 1] = "unit"; result[layout.price - 1] = "price";
    return result;
  }
  function excelValue(key, fields, options = {}) {
    if (isLiteralColumn(key)) {
      const value = key.text.replace(/[\u0000-\u001f\u007f]/g, " ");
      return protect(value);
    }
    const formatting = { ...defaults, ...options };
    const imageSource = fields.localImagePath || fields.imageUrl || "";
    const imageFormula = `=IMAGE("${String(imageSource).replace(/"/g, '""')}")`;
    const values = {
      fullName: () => format(fields, { ...options, excel: false }),
      supplier: () => { const value = clean(fields.supplier, formatting); return formatting.uppercaseSupplier ? value.toUpperCase() : value; },
      article: () => clean(fields.article, formatting), name: () => clean(fields.name, formatting),
      info: () => clean(fields.info, formatting),
      unit: () => sheetUnit(fields, options), plainUnit: () => fields.unit,
      price: () => priceValue(fields.price, options), pricePerUnit: () => decimal(unitPrice(fields, options), options), url: () => fields.url,
      currency: () => fields.currency,
      usage: () => fields.usage, kind: () => fields.kind,
      weight: () => numberValue(fields.weight, options), package: () => numberValue(fields.package, options),
      imageUrl: () => options.excelImageFormula ? imageFormula : imageSource,
      imageFormula: () => imageFormula,
      sheetLength: () => dimensionWithUnit(fields.sheetLength, options),
      sheetWidth: () => dimensionWithUnit(fields.sheetWidth, options),
      sheetThickness: () => thicknessWithUnit(fields.sheetThickness, options), sheetSize: () => sheetSize(fields, options)
    };
    const raw = String(values[key]?.() ?? "").replace(/[\u0000-\u001f\u007f]/g, " ");
    const value = (fields.localImagePath && ["imageUrl", "imageFormula"].includes(key) ? raw : raw.replace(/\s+/g, " ")).trim();
    return key === "imageFormula" || key === "imageUrl" && options.excelImageFormula ? value : protect(value);
  }
  function excelBlocks(fields, options = {}) {
    const columns = excelColumns(options);
    const entries = [];
    for (let index = 0; index < columns.length; index++) {
      const key = columns[index];
      if (key === "skip") continue;
      if (key === excelJoin) {
        const previous = entries.at(-1), next = columns[index + 1];
        if (!previous || !excelFields.includes(next) && !isLiteralColumn(next)) throw new Error("Об’єднання через пробіл має стояти між двома полями.");
        previous.value = options.excelSeparator === "space"
          ? `${previous.value}   ${excelValue(next, fields, options)}`
          : [previous.value, excelValue(next, fields, options)].filter(Boolean).join(" ");
        previous.end = index + 2;
        previous.joined = true;
        index++;
        continue;
      }
      entries.push({ column: index + 1, end: index + 1, value: excelValue(key, fields, options), joined: false });
    }
    if (!entries.length) throw new Error("Оберіть хоча б одне поле для копіювання в Excel.");
    // Space means a single text cell, including fields separated by joins or unused slots.
    if (options.excelSeparator === "space") {
      const start = entries[0].column;
      const text = entries.map(entry => entry.value).filter(Boolean).join(" ");
      return [{ start, end: start, values: [text], target: columnName(start), text }];
    }
    const groups = [];
    for (const entry of entries) {
      const last = groups.at(-1);
      if (last && !last.joined && !entry.joined && last.end + 1 === entry.column) { last.end = entry.column; last.values.push(entry.value); }
      else groups.push({ start: entry.column, end: entry.column, values: [entry.value] });
    }
    const separatorMode = ["space", "tab", "enter", "ascii"].includes(options.excelSeparator) ? options.excelSeparator : (options.excelVertical ? "enter" : "tab");
    const vertical = separatorMode === "enter";
    const ascii = Number(options.excelAscii);
    const separator = separatorMode === "enter" ? "\r\n" : separatorMode === "space" ? " " : separatorMode === "ascii" && Number.isInteger(ascii) && ascii >= 1 && ascii <= 127 ? String.fromCharCode(ascii) : "\t";
    return groups.map(g => ({ ...g, target: g.values.length === 1 ? (vertical ? String(g.start) : columnName(g.start)) : (vertical ? `${g.start}:${g.end}` : `${columnName(g.start)}:${columnName(g.end)}`), text: g.values.join(separator) }));
  }
  return { clean, format, formatExcel, priceNumber, priceValue, numberValue, unitPrice, decimal, currencyCode, defaults, excelLayout, excelColumns, excelFields, excelValue, excelBlocks, columnName, dimensionNumber, dimensionMetres, sheetSize, sheetUnit, thicknessMm, isLiteralColumn };
})();
