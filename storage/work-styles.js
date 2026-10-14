globalThis.YSCWorkStyles = (() => {
  const keys = ["excel", "excelColumns", "excelSeparator", "excelAscii", "excelVertical", "excelImageFormula", ...Object.keys(YSCFormatter.defaults)];
  function normalize(source = {}) {
    const separator = ["space", "tab", "enter", "ascii"].includes(source.excelSeparator) ? source.excelSeparator : (source.excelVertical ? "enter" : "tab");
    const ascii = Number(source.excelAscii);
    const excelColumns = YSCFormatter.excelColumns(source).map(key => source.excelImageFormula && key === "imageUrl" ? "imageFormula" : key);
    return {
      ...YSCFormatter.defaults,
      ...structuredClone(source),
      excel: true,
      excelColumns,
      excelSeparator: separator,
      excelAscii: Number.isInteger(ascii) && ascii >= 1 && ascii <= 127 ? ascii : 44,
      excelVertical: separator === "enter",
      excelImageFormula: false
    };
  }
  const snapshot = format => normalize(Object.fromEntries(keys.filter(key => format[key] !== undefined).map(key => [key, structuredClone(format[key])])));
  const apply = (format, style) => { keys.forEach(key => delete format[key]); Object.assign(format, normalize(style.format)); };
  function migrate(preferences, format) {
    if (Array.isArray(preferences.ysc_work_styles) && preferences.ysc_work_styles.length) {
      const styles = preferences.ysc_work_styles.map(style => ({ ...style, format: normalize(style.format) }));
      const selected = styles.some(s => s.id === preferences.ysc_work_style) ? preferences.ysc_work_style : styles.at(-1).id;
      return { styles: [...styles.filter(s => s.id !== selected), styles.find(s => s.id === selected)], selected };
    }
    const common = { ...YSCFormatter.defaults, ...snapshot(format) };
    const generic = normalize({ ...common, excelColumns: ["fullName"], excelSeparator: "tab" });
    const excel = normalize({ ...common, excelColumns: YSCFormatter.excelColumns({ ...format, excelColumns: preferences.ysc_excel_columns ?? format.excelColumns, excelLayout: preferences.ysc_excel_layout ?? format.excelLayout }), excelVertical: preferences.ysc_excel_vertical ?? format.excelVertical ?? false, excelImageFormula: preferences.ysc_excel_image_formula ?? format.excelImageFormula ?? false });
    const styles = [{ id: "cad", name: "AVC / CAD", format: generic }, { id: "excel", name: "Excel", format: excel }];
    const selected = preferences.ysc_excel_mode ? "excel" : "cad";
    return { styles: [...styles.filter(s => s.id !== selected), styles.find(s => s.id === selected)], selected };
  }
  const save = state => chrome.storage.local.set({ ysc_work_styles: structuredClone(state.styles), ysc_work_style: state.selected });
  function uniqueName(name, styles, exceptId) {
    const base = String(name).trim().replace(/\s*\(\d+\)$/, "").slice(0, 70);
    const used = new Set(styles.filter(s => s.id !== exceptId).map(s => s.name.toLocaleLowerCase()));
    let candidate = String(name).trim().slice(0, 80), number = 2;
    while (used.has(candidate.toLocaleLowerCase())) candidate = `${base} (${number++})`;
    return candidate;
  }
  function exportStyle(style) {
    const format = snapshot(style.format);
    return {
      type: "Y Supplier Clipboard style", version: 1, name: style.name,
      separator: format.excelSeparator, asciiCode: format.excelAscii,
      columns: format.excelColumns,
      formatting: Object.fromEntries(Object.keys(YSCFormatter.defaults).map(key => [key, format[key]]))
    };
  }
  function importStyle(data) {
    const invalid = () => { throw new Error("Невірний файл стилю."); };
    if (!data || data.type !== "Y Supplier Clipboard style" || data.version !== 1 ||
        typeof data.name !== "string" || !data.name.trim() || data.name.trim().length > 80 ||
        !["space", "tab", "enter", "ascii"].includes(data.separator) ||
        !Number.isInteger(data.asciiCode) || data.asciiCode < 1 || data.asciiCode > 127 ||
        !Array.isArray(data.columns) || data.columns.length > 26 ||
        !data.formatting || typeof data.formatting !== "object" || Array.isArray(data.formatting)) invalid();
    const formatting = {};
    for (const key of Object.keys(YSCFormatter.defaults)) {
      if (data.formatting[key] !== undefined && typeof data.formatting[key] !== "boolean") invalid();
      if (data.formatting[key] !== undefined) formatting[key] = data.formatting[key];
    }
    let format;
    try { format = snapshot({ ...formatting, excelColumns: data.columns, excelSeparator: data.separator, excelAscii: data.asciiCode }); }
    catch (_) { invalid(); }
    return { name: data.name.trim(), format };
  }
  return { snapshot, apply, migrate, save, uniqueName, exportStyle, importStyle };
})();
