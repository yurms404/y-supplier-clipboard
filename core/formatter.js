/* Pure formatter; exposed for both extension and tests. */
globalThis.YSCFormatter = (() => {
  const defaults = { supplier: true, article: true, name: true, replaceComma: true, normalizeSpaces: true, stripControls: true, uppercaseSupplier: true };
  function clean(value, options) {
    let text = String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ");
    if (options.replaceComma) text = text.replace(/,/g, "-");
    return options.normalizeSpaces ? text.replace(/\s+/g, " ").trim() : text.trim();
  }
  function format(fields, format = {}) {
    if (format.excel) return formatExcel(fields, format);
    const options = { ...defaults, ...format };
    const supplier = clean(fields.supplier, options);
    const parts = [];
    if (options.supplier && supplier) parts.push(options.uppercaseSupplier ? supplier.toUpperCase() : supplier);
    if (options.article && fields.article) parts.push(clean(fields.article, options));
    if (options.name && fields.name) parts.push(clean(fields.name, options));
    const thickness = options.sheet && !options.sheetRod ? thicknessMm(fields.sheetThickness) : "";
    if (options.name && fields.name && thickness) parts.push(`- ${thickness}`);
    return parts.filter(Boolean).join(" ");
  }
  function priceNumber(value) {
    const raw = String(value ?? "").trim().replace(/\s*(?:грн\.?|₴|UAH|USD|EUR|[$€])(?:\s*\/\s*[\p{L}\d²³. \-–—−]+)?$/iu, "").replace(/[\s\u00a0\u202f]/g, "");
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) return "";
    return raw.replace(",", ".");
  }
  function formatExcel(fields, options = {}) {
    // Nonadjacent destinations remain separate sessions, never padded with empty cells.
    if (options.excelColumns !== undefined || options.excelVertical || options.excelSeparator !== undefined) return excelBlocks(fields, options).map(block => block.text).join("\n");
    // TSV: the full formatted product description, unit and numeric price.
    const cell = value => {
      const cleaned = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
      return /^[=+@-]/.test(cleaned) ? `'${cleaned}` : cleaned;
    };
    return [cell(format(fields, { ...options, excel: false })), cell(sheetUnit(fields, options)), priceNumber(fields.price).replace(".", ",")].join("\t");
  }
  function dimensionMetres(value, inputUnit = "mm") {
    const match = String(value ?? "").trim().match(/^(?:(?:довжина|ширина|длина|length|width|товщина|толщина|thickness)\s*[,:(]?\s*(мм|mm|м|m)?\s*[):]?\s*)?(\d+(?:[.,]\d+)?)\s*(мм|mm|м|m)?$/iu);
    if (!match) return "";
    const unit = (match[3] || match[1] || inputUnit).toLowerCase();
    if (!["mm", "мм", "m", "м"].includes(unit)) return "";
    const metres = Number(match[2].replace(",", ".")) / (["mm", "мм"].includes(unit) ? 1000 : 1);
    if (!Number.isFinite(metres) || metres <= 0 || metres > 100) return "";
    const rounded = Number(metres.toFixed(6));
    return rounded > 0 ? String(rounded).replace(".", ",") : "";
  }
  function sheetSize(fields, options = {}) {
    const length = dimensionMetres(fields.sheetLength, options.sheetInputUnit || "mm");
    if (options.sheetRod) return length ? `(${length})` : "";
    const width = dimensionMetres(fields.sheetWidth, options.sheetInputUnit || "mm");
    return length && width ? `(${length}*${width})` : "";
  }
  function thicknessMm(value) {
    const metres = dimensionMetres(value, "mm");
    return metres ? String(Number((Number(metres.replace(",", ".")) * 1000).toFixed(3))).replace(".", ",") : "";
  }
  function sheetUnit(fields, options = {}) {
    const unit = String(fields.unit || "").trim();
    const size = options.sheet ? sheetSize(fields, options) : "";
    return size ? `${unit} ${size}`.trim() : unit;
  }
  const excelLayout = { name: 2, unit: 5, price: 6 };
  const columnName = column => String.fromCharCode(64 + column);
  const excelFields = ["fullName", "supplier", "article", "name", "unit", "plainUnit", "price", "sheetLength", "sheetWidth", "sheetThickness", "sheetSize", "url", "imageUrl", "imageFormula"];
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
      return /^[=+@-]/.test(value.trimStart()) ? `'${value}` : value;
    }
    const formatting = { ...defaults, ...options };
    const imageFormula = `=IMAGE("${String(fields.imageUrl || "").replace(/"/g, '""')}")`;
    const values = {
      fullName: () => format(fields, { ...options, excel: false }),
      supplier: () => { const value = clean(fields.supplier, formatting); return formatting.uppercaseSupplier ? value.toUpperCase() : value; },
      article: () => clean(fields.article, formatting), name: () => clean(fields.name, formatting),
      unit: () => sheetUnit(fields, options), plainUnit: () => fields.unit,
      price: () => priceNumber(fields.price).replace(".", ","), url: () => fields.url,
      imageUrl: () => options.excelImageFormula ? imageFormula : fields.imageUrl,
      imageFormula: () => imageFormula,
      sheetLength: () => dimensionMetres(fields.sheetLength, options.sheetInputUnit || "mm"),
      sheetWidth: () => dimensionMetres(fields.sheetWidth, options.sheetInputUnit || "mm"),
      sheetThickness: () => thicknessMm(fields.sheetThickness), sheetSize: () => sheetSize(fields, options)
    };
    const value = String(values[key]?.() ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    return key === "imageFormula" || key === "imageUrl" && options.excelImageFormula ? value : /^[=+@-]/.test(value) ? `'${value}` : value;
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
  return { clean, format, formatExcel, priceNumber, defaults, excelLayout, excelColumns, excelFields, excelValue, excelBlocks, columnName, dimensionMetres, sheetSize, sheetUnit, thicknessMm, isLiteralColumn };
})();
