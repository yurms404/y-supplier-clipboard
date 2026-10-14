(() => {
  const t = (key, parameters) => YSCI18n.t(key, parameters);
  let panel, profile, result, toggling = false, nextExcelBlock = 0;
  let workStyles, styleWrites = Promise.resolve(), styleSettingsVisible = false;
  let accentColor = "#ef7900";
  function persistStyle() {
    const selected = workStyles.styles.find(s => s.id === workStyles.selected);
    const previous = structuredClone(selected.format);
    selected.format = YSCWorkStyles.snapshot(profile.format);
    const state = structuredClone(workStyles);
    const pending = styleWrites.then(() => YSCWorkStyles.save(state)).catch(error => {
      if (workStyles.selected === selected.id && JSON.stringify(selected.format) === JSON.stringify(state.styles.find(s => s.id === selected.id).format)) {
        selected.format = previous; YSCWorkStyles.apply(profile.format, selected);
      }
      throw error;
    });
    styleWrites = pending.catch(() => {});
    return pending;
  }
  function workStyleControls() {
    const box = $("div", { className: "ysc-work-styles" });
    const select = $("select", { id: "ysc-work-style", ariaLabel: t("Стиль роботи") });
    workStyles.styles.forEach(style => select.append($("option", { value: style.id, textContent: style.name, selected: style.id === workStyles.selected })));
    select.onchange = async () => {
      try {
        await styleWrites;
        const selected = workStyles.styles.find(s => s.id === select.value);
        const state = { styles: [...workStyles.styles.filter(s => s.id !== select.value), selected], selected: select.value };
        await YSCWorkStyles.save(state); workStyles = state;
        YSCWorkStyles.apply(profile.format, workStyles.styles.find(s => s.id === state.selected));
        nextExcelBlock = 0; render();
      } catch (error) { toast(t(error.message), true); }
    };
    const edit = $("button", { id: "ysc-style-edit", className: "secondary", textContent: "✎", title: t("Редагувати стиль"), ariaLabel: t("Редагувати стиль") });
    edit.onclick = () => {
      styleSettingsVisible = !styleSettingsVisible;
      panel.querySelector("#ysc-style-settings").hidden = !styleSettingsVisible;
      edit.setAttribute("aria-expanded", String(styleSettingsVisible));
    };
    box.append($("label", { htmlFor: select.id, textContent: t("Стиль роботи") }), $("div", { className: "ysc-style-select" }, [select, edit]));
    return box;
  }
  function styleSettings() {
    const current = workStyles.styles.find(s => s.id === workStyles.selected);
    const box = $("section", { id: "ysc-style-settings", hidden: !styleSettingsVisible });
    const name = $("input", { id: "ysc-style-name", value: current.name, maxLength: 80 });
    box.append($("label", { htmlFor: name.id, textContent: t("Назва стилю") }), name);
    name.onchange = async () => {
      const previous = current.name;
      const value = name.value.trim();
      if (!value) { name.value = previous; return toast(t("Вкажіть назву стилю."), true); }
      current.name = YSCWorkStyles.uniqueName(value, workStyles.styles, current.id);
      name.value = current.name;
      const option = [...panel.querySelector("#ysc-work-style").children].find(item => item.value === current.id);
      if (option) option.textContent = current.name;
      try { await persistStyle(); }
      catch (error) { current.name = previous; name.value = previous; if (option) option.textContent = previous; toast(t(error.message), true); }
    };
    const actions = $("div", { className: "ysc-style-actions" });
    const action = (id, title, run) => { const button = $("button", { id, className: "secondary", textContent: t(title) }); button.onclick = async () => { try { await styleWrites; await run(); } catch (error) { toast(t(error.message), true); } }; actions.append(button); };
    action("ysc-style-duplicate", "Дублювати", async () => {
      const id = crypto.randomUUID();
      workStyles.styles.push({ id, name: YSCWorkStyles.uniqueName(`${t("Копія")} ${current.name}`, workStyles.styles), format: YSCWorkStyles.snapshot(profile.format) });
      workStyles.selected = id; await persistStyle(); nextExcelBlock = 0; render();
      const field = panel.querySelector("#ysc-style-name"); field.focus?.(); field.select?.();
    });
    action("ysc-style-reset", "Скинути", async () => { profile.format.excelColumns = Array(26).fill("skip"); await persistStyle(); nextExcelBlock = 0; render(); });
    action("ysc-style-delete", "Видалити", async () => { if (workStyles.styles.length < 2) throw new Error(t("Залиште хоча б один стиль.")); if (!confirm(t("Видалити стиль «{name}»?", { name: current.name }))) return; workStyles.styles = workStyles.styles.filter(s => s.id !== current.id); const previous = workStyles.styles.at(-1); workStyles.selected = previous.id; YSCWorkStyles.apply(profile.format, previous); await persistStyle(); nextExcelBlock = 0; render(); });
    box.append(actions);
    const transfer = $("div", { className: "ysc-style-transfer" });
    const exporter = $("button", { id: "ysc-style-export", className: "secondary", textContent: t("Експорт стилю") });
    exporter.onclick = async () => {
      try {
        await styleWrites;
        const selected = workStyles.styles.find(s => s.id === workStyles.selected);
        const filename = (selected.name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/[. ]+$/, "") || "style") + ".ysc-style.json";
        const reply = await chrome.runtime.sendMessage({ type: "YSC_SAVE_STYLE", filename, text: JSON.stringify(YSCWorkStyles.exportStyle(selected), null, 2) });
        if (!reply?.ok) throw new Error(reply?.error || t("Не вдалося зберегти файл."));
      } catch (error) { toast(t("Не вдалося експортувати стиль: {error}", { error: error.message }), true); }
    };
    const importer = $("input", { id: "ysc-style-import-file", type: "file", accept: ".json,application/json", hidden: true });
    importer.onchange = async () => {
      try {
        const file = importer.files?.[0];
        if (!file) return;
        const imported = YSCWorkStyles.importStyle(JSON.parse(await file.text()));
        await styleWrites;
        const collision = workStyles.styles.some(s => s.name.toLocaleLowerCase() === imported.name.toLocaleLowerCase());
        const style = { id: crypto.randomUUID(), name: YSCWorkStyles.uniqueName(collision ? `${t("Копія")} ${imported.name}` : imported.name, workStyles.styles), format: imported.format };
        const state = { styles: [...workStyles.styles, style], selected: style.id };
        await YSCWorkStyles.save(state);
        workStyles = state; YSCWorkStyles.apply(profile.format, style);
        nextExcelBlock = 0; styleSettingsVisible = true; render();
        const field = panel.querySelector("#ysc-style-name"); field.focus?.(); field.select?.();
        toast(t("Стиль імпортовано"));
      } catch (error) { toast(t("Не вдалося імпортувати стиль: {error}", { error: t(error.message) }), true); }
      finally { importer.value = ""; }
    };
    const importButton = $("button", { id: "ysc-style-import", className: "secondary", textContent: t("Імпорт стилю") });
    importButton.onclick = () => importer.click();
    transfer.append(exporter, importButton, importer);
    box.append(transfer);
    box.append(excelSettings());
    return box;
  }
  const $ = (tag, attrs = {}, children = []) => { const e = document.createElement(tag); Object.assign(e, attrs); children.forEach(c => e.append(c)); return e; };
  function toast(message, error = false) { const n = $("div", { textContent: message, className: error ? "ysc-error" : "" }); Object.assign(n.style, { position:"fixed", zIndex:2147483647, bottom:"20px", right:"20px", background:"#172033", color:"white", padding:"10px 14px", borderRadius:"7px", maxWidth:"min(600px, calc(100vw - 40px))", overflowWrap:"anywhere", whiteSpace:"pre-wrap" }); document.documentElement.append(n); setTimeout(() => n.remove(), 8000); }
  function input(label, value, change, type = "text", event = "input") { const l = $("label", { textContent: t(label) }), i = $("input", { type, value: value || "" }); i.addEventListener(event, () => change(i.value, i)); return [l, i]; }
  function inlinePicker(field, key, title, pick = () => pickField(key)) {
    const wrapper = $("div", { className: "ysc-field-picker" });
    const cursor = $("span", { className: "ysc-cursor-icon" });
    cursor.setAttribute("aria-hidden", "true");
    const button = $("button", { id: `ysc-pick-${key}`, type: "button", className: "ysc-pick-icon", title: t(title), ariaLabel: t(title) }, [cursor]);
    button.onclick = pick;
    field.after(wrapper); wrapper.append(field, button);
    return wrapper;
  }
  function folded(key, title, children) {
    return $("details", { id: `ysc-${key}` }, [$("summary", { textContent: t(title) }), ...children]);
  }
  function languageSelector() {
    const select = $("select", { value: YSCI18n.language, id: "ysc-language" });
    for (const [value, label] of [["uk", "UA · Українська"], ["en", "ENG · English"], ["ru", "RU · Русский"]]) select.append($("option", { value, textContent: label, selected: value === YSCI18n.language }));
    select.onchange = async () => {
      const previous = YSCI18n.language;
      try {
        await chrome.storage.local.set({ ysc_language: select.value });
        YSCI18n.setLanguage(select.value);
        render();
      } catch (error) { select.value = previous; toast(t("Не вдалося зберегти мову: {error}", { error: error.message }), true); }
    };
    return $("div", { className: "ysc-language" }, [$("label", { htmlFor: "ysc-language", textContent: t("Мова інтерфейсу") }), select]);
  }
  function rerun() { nextExcelBlock = 0; result = YSCParser.parse(profile); render(); }
  function outputFields() {
    const cleaned = { ...result, url: location.href };
    for (const key of ["supplier", "article", "name", "unit", "price"]) cleaned[key] = YSCParser.removeBlocked(result[key], profile.blacklist);
    return cleaned;
  }
  function blacklistSettings() {
    const area = $("textarea", { rows: 3, maxLength: 5000, value: (profile.blacklist || []).join("\n"), placeholder: "Код товара:\nКод товару:" });
    const status = $("p", { textContent: t("Для цього сайту. Один зайвий текст на рядок. Зберігається автоматично; збіг точний, з урахуванням регістру.") });
    let revision = 0;
    area.oninput = async () => {
      const entries = [...new Set(area.value.split(/\r?\n/).map(v => v.trim()).filter(Boolean))];
      if (entries.length > 100 || entries.some(v => v.length > 200)) { status.textContent = t("Максимум 100 записів по 200 символів."); return; }
      profile.blacklist = entries;
      const currentRevision = ++revision;
      const parsed = YSCParser.parse(profile);
      for (const key of ["supplier", "article", "name", "price", "unit"]) {
        result[key] = parsed[key];
        const field = panel.querySelector(`#ysc-value-${key}`);
        if (field) field.value = result[key];
      }
      result.candidates = parsed.candidates; result.confirmed = {}; result.sheetConfirmed = false;
      refreshPreview(); status.textContent = t("Зберігаю…");
      try {
        await YSCProfiles.saveBlacklist(profile, entries);
        if (revision === currentRevision) status.textContent = t("Збережено для цього сайту. Текст видаляється з полів автоматично.");
      } catch (error) { if (revision === currentRevision) status.textContent = t("Помилка збереження: {error}", { error: t(error.message) }); }
    };
    return folded("blacklist", t("Чорний список: прибрати зайвий текст"), [area, status]);
  }
  function previewElement() {
    const preview = $("div", { className: "ysc-preview" });
    if (!profile.format.excel) {
      preview.textContent = YSCFormatter.format(outputFields(), profile.format) || t("Заповніть поля нижче");
      return preview;
    }
    try {
      for (const block of YSCFormatter.excelBlocks(outputFields(), profile.format)) {
        preview.append($("div", { className: "ysc-preview-block" }, [
          $("div", { className: "ysc-preview-target", textContent: `${block.target}:` }),
          $("div", { className: "ysc-preview-data", textContent: block.text })
        ]));
      }
    } catch (error) { preview.textContent = t(error.message); }
    return preview;
  }
  function refreshPreview() {
    nextExcelBlock = 0;
    panel.querySelector(".ysc-preview").replaceWith(previewElement());
    panel.querySelector("#ysc-quick-preview").textContent = quickText();
    const sheetStatus = panel.querySelector("#ysc-sheet-status");
    if (sheetStatus) sheetStatus.textContent = result.sheetConfirmed ? t("Підтверджено: {unit}", { unit: YSCFormatter.sheetUnit(outputFields(), profile.format) }) : t("Перевірте розмір: {unit}", { unit: YSCFormatter.sheetUnit(outputFields(), profile.format) });
    const steps = panel.querySelector(".ysc-excel-steps");
    if (steps) steps.replaceWith(excelSteps());
    const copyButton = panel.querySelector("#ysc-copy");
    if (copyButton) {
      try { copyButton.textContent = profile.format.excel ? t("Скопіювати → {target}", { target: YSCFormatter.excelBlocks(outputFields(), profile.format)[0].target }) : t("Скопіювати"); }
      catch (_) { copyButton.textContent = t("Скопіювати"); }
    }
  }
  function excelSteps() {
    const steps = $("div", { className: "ysc-excel-steps" });
    if (!profile.format.excel) return steps;
    try {
      const blocks = YSCFormatter.excelBlocks(outputFields(), profile.format);
      if (profile.format.excelVertical) steps.append($("p", { className: "ysc-excel-session-hint", textContent: t("Режим Enter: значення вставляються вниз. Сесій: {count}; рядки: {targets}. Виберіть початкову комірку кожного блоку в одному стовпці. Пропущені рядки не змінюються.", { count: blocks.length, targets: blocks.map(block => block.target).join(" → ") }) }));
      else
      steps.append($("p", { className: "ysc-excel-session-hint", textContent: blocks.length > 1
        ? t("Сесій копіювання: {count} — {targets}. По черзі копіюйте кожен блок і вставляйте в його початковий стовпець того самого рядка. Пропущені комірки залишаться незмінними.", { count: blocks.length, targets: blocks.map(block => block.target).join(" → ") })
        : t("Одна сесія копіювання — {target}. Скопіюйте один раз і вставте у стовпець {column}: усі вибрані поля заповняться одним вставленням.", { target: blocks[0].target, column: YSCFormatter.columnName(blocks[0].start) }) }));
      blocks.forEach((block, index) => {
        const button = $("button", { className: "secondary", textContent: t("{step}. Скопіювати → {target}", { step: index + 1, target: block.target }) });
        button.onclick = () => copy(index); steps.append(button);
      });
    } catch (error) { steps.append($("p", { className: "ysc-error", textContent: t(error.message) })); }
    return steps;
  }
  function excelSettings() {
    const settings = $("section", { id: "ysc-excel-settings" });
    const separator = $("select", { id: "ysc-excel-separator" });
    const currentSeparator = ["space", "tab", "enter", "ascii"].includes(profile.format.excelSeparator) ? profile.format.excelSeparator : (profile.format.excelVertical ? "enter" : "tab");
    for (const [value, label] of [["space", "Пробіл — текст в одну комірку"], ["tab", "Tab — текст в один рядок"], ["enter", "Enter — текст в один стовпчик"], ["ascii", "Користувацький ASCII-код"]]) separator.append($("option", { value, textContent: t(label), selected: currentSeparator === value }));
    separator.onchange = async () => {
      try { profile.format.excelSeparator = separator.value; profile.format.excelVertical = separator.value === "enter"; await persistStyle(); nextExcelBlock = 0; render(); }
      catch (error) { toast(t(error.message), true); }
    };
    settings.append($("label", { htmlFor: separator.id, textContent: t("Роздільник") }), separator);
    if (currentSeparator === "ascii") {
      const ascii = $("input", { id: "ysc-excel-ascii", type: "number", min: "1", max: "127", value: String(profile.format.excelAscii ?? 44) });
      ascii.onchange = async () => {
        const value = Number(ascii.value);
        if (!Number.isInteger(value) || value < 1 || value > 127) { toast(t("Код ASCII має бути від 1 до 127."), true); ascii.value = String(profile.format.excelAscii ?? 44); return; }
        profile.format.excelAscii = value; try { await persistStyle(); nextExcelBlock = 0; render(); } catch (error) { toast(t(error.message), true); }
      };
      settings.append($("label", { htmlFor: ascii.id, textContent: t("Код ASCII (1–127)") }), ascii);
    }
    if (profile.format.excelVertical) settings.append($("p", { textContent: t("У режимі Enter схема задає рядки 1–26 замість стовпців A–Z. Для одного вставлення розмістіть поля поруч без пропусків. Вставляйте у вибрану комірку, не в режимі її редагування.") }));
    const columns = YSCFormatter.excelColumns(profile.format);
    const labels = { skip: t("Не чіпати"), fullName: t("Повна назва"), supplier: t("Постачальник"), article: t("Артикул"), name: t("Назва товару"), unit: t("Одиниця з розміром"), plainUnit: t("Одиниця без розміру"), price: t("Ціна"), sheetLength: t("Довжина (м)"), sheetWidth: t("Ширина (м)"), sheetThickness: t("Товщина (мм)"), sheetSize: t("Розмір листа (м)"), url: t("URL поточної сторінки"), imageUrl: t("URL зображення товару"), imageFormula: t("Зображення =IMAGE(\"URL\")"), join: t("Об’єднати через пробіл") };
    const strip = $("div", { className: "ysc-excel-row" });
    // Literal text belongs to the selected style, independently for each cell.
    labels.anyText = t("Any Text");
    for (let index = 0; index < 26; index++) {
      const column = YSCFormatter.columnName(index + 1), key = columns[index];
      const literal = YSCFormatter.isLiteralColumn(key), selectedKey = literal ? "anyText" : key;
      const select = $("select", { id: `ysc-excel-column-${column}`, ariaLabel: t("Стовпець {column}", { column }), title: labels[selectedKey] });
      for (const [value, textContent] of Object.entries(labels)) select.append($("option", { value, textContent, selected: value === selectedKey }));
      select.onchange = async () => {
        const previous = profile.format.excelColumns;
        const proposed = [...YSCFormatter.excelColumns(profile.format)]; proposed[index] = select.value === "anyText" ? { text: literal ? key.text : "" } : select.value;
        try {
          YSCFormatter.excelColumns({ excelColumns: proposed });
          profile.format.excelColumns = proposed; nextExcelBlock = 0;
          await persistStyle();
          render();
          if (select.value === "anyText") panel.querySelector(`#ysc-excel-text-${column}`)?.focus?.();
        } catch (error) { profile.format.excelColumns = previous; select.value = selectedKey; toast(t(error.message), true); }
      };
      const value = $("span", { className: "ysc-cell-value" }, [$("span", { className: "ysc-cell-text", textContent: literal ? "" : labels[key] })]);
      value.setAttribute("aria-hidden", "true");
      const cell = $("div", { className: literal ? "ysc-cell-literal" : key !== "skip" ? "ysc-cell-write" : "ysc-cell-skip" }, [$("label", { htmlFor: select.id, textContent: profile.format.excelVertical ? String(index + 1) : column }), value, select]);
      if (literal) {
        const text = $("textarea", { id: `ysc-excel-text-${column}`, className: "ysc-cell-literal-input", value: key.text, placeholder: t("Any Text"), ariaLabel: `${t("Any Text")} · ${column}`, rows: 3 });
        text.oninput = async () => {
          const previous = profile.format.excelColumns;
          const proposed = [...YSCFormatter.excelColumns(profile.format)]; proposed[index] = { text: text.value };
          profile.format.excelColumns = proposed; nextExcelBlock = 0; refreshPreview();
          try { await persistStyle(); }
          catch (error) { profile.format.excelColumns = previous; toast(t(error.message), true); }
        };
        cell.append(text);
      }
      strip.append(cell);
    }
    settings.append(strip);
    if (!profile.format.excelVertical) settings.append($("p", { textContent: t("Для кожного стовпця виберіть поле або «Не чіпати». Поля можна повторювати. Прокрутіть схему вправо, щоб налаштувати стовпці до Z.") }), $("p", { textContent: t("Суміжні стовпці об’єднуються в одну сесію копіювання. Якщо між ними є пропуски — розширення готує окремі сесії. Схема зберігається автоматично; початкову комірку в Excel вибираєте ви.") }));
    settings.append(excelSteps());
    return settings;
  }
  function imageSettings() {
    const settings = $("section", { id: "ysc-image-settings", className: "ysc-image-settings" });
    const saved = Number(profile.format.imageBackgroundOpacity);
    const opacity = Number.isFinite(saved) ? Math.max(0, Math.min(100, Math.round(saved))) : 50;
    const label = $("label", { htmlFor: "ysc-image-opacity", textContent: t("Прозорість: {value}%", { value: opacity }) });
    const slider = $("input", { id: "ysc-image-opacity", type: "range", min: "0", max: "100", value: String(opacity) });
    slider.oninput = () => { label.textContent = t("Прозорість: {value}%", { value: slider.value }); };
    slider.onchange = async () => {
      const value = Math.max(0, Math.min(100, Number(slider.value) || 0));
      try {
        await chrome.storage.local.set({ ysc_image_background_opacity: value });
        profile.format.imageBackgroundOpacity = value; render();
      } catch (error) { slider.value = String(opacity); toast(t(error.message), true); }
    };
    settings.append($("div", { className: "ysc-compact-setting" }, [label, slider]));
    const rgb = hex => {
      const value = hex.slice(1);
      return `R ${parseInt(value.slice(0, 2), 16)} G ${parseInt(value.slice(2, 4), 16)} B ${parseInt(value.slice(4, 6), 16)}`;
    };
    const color = $("input", { id: "ysc-accent-color", type: "color", value: accentColor, ariaLabel: t("Колір акцентів") });
    const colorButton = $("button", { id: "ysc-accent-color-button", type: "button", className: "ysc-accent-color-button", textContent: rgb(accentColor), title: accentColor });
    colorButton.onclick = () => color.showPicker?.();
    color.onchange = async () => {
      if (!/^#[0-9a-f]{6}$/i.test(color.value)) return;
      try { await chrome.storage.local.set({ ysc_accent_color: color.value }); accentColor = color.value; render(); }
      catch (error) { color.value = accentColor; toast(t(error.message), true); }
    };
    settings.append($("div", { className: "ysc-compact-setting" }, [$("label", { htmlFor: colorButton.id, textContent: t("Колір акцентів") }), $("div", { className: "ysc-accent-picker" }, [colorButton, color]) ]));
    return settings;
  }
  function excelValidationError() {
    const columns = YSCFormatter.excelColumns(profile.format);
    if (columns.every(key => key === "skip")) return t("Оберіть хоча б одне поле для копіювання в Excel.");
    const needs = key => columns.includes(key);
    if ((needs("article") || needs("fullName") && profile.format.article !== false) && !result.article) return t("Не знайдено артикул — налаштуйте поле.");
    if ((needs("supplier") || needs("fullName") && profile.format.supplier !== false) && !result.supplier) return t("Вкажіть постачальника.");
    if ((needs("unit") || needs("plainUnit")) && !result.unit) return t("Заповніть поле «{field}» для вибраного стовпця.", { field: t("Одиниця") });
    if (needs("price") && !YSCFormatter.priceNumber(result.price)) return t("Вкажіть коректну ціну для вибраного стовпця.");
    if ((needs("imageUrl") || needs("imageFormula")) && !result.imageUrl) return t("Не знайдено URL зображення — налаштуйте поле.");
    for (const [key, title] of [["sheetLength", "Довжина (м)"], ["sheetWidth", "Ширина (м)"], ["sheetThickness", "Товщина (мм)"], ["sheetSize", "Розмір листа (м)"]]) {
      if (needs(key) && !YSCFormatter.excelValue(key, result, profile.format)) return t("Заповніть поле «{field}» для вибраного стовпця.", { field: t(title) });
    }
    return "";
  }
  function sheetConfirmationRequired() {
    if (!profile.format.sheet) return false;
    const columns = YSCFormatter.excelColumns(profile.format);
    return ["unit", "sheetLength", "sheetWidth", "sheetSize"].some(key => columns.includes(key));
  }
  function updateSupplier(value) {
    result.supplier = value;
    profile.supplier = value;
    refreshPreview();
    YSCProfiles.saveSupplier(profile, value).catch(error => toast(t("Не вдалося зберегти постачальника: {error}", { error: t(error.message) }), true));
  }
  function domainManager(backupControls = []) {
    const box = $("section", { className: "ysc-domain-manager" });
    const list = $("select", { id: "ysc-domain-list", size: 6, ariaLabel: t("Усі профільовані домени") });
    const details = $("div", { id: "ysc-domain-profiles" });
    const adminProfiles = $("div", { id: "ysc-domain-admin" });
    const status = $("p", { textContent: t("Завантаження…") });
    const remove = $("button", { id: "ysc-delete-domain", className: "secondary", textContent: t("Видалити домен та його профілі"), disabled: true });
    let profiles = [], busy = false;
    function showSelected() {
      for (const child of [...details.childNodes]) child.remove();
      for (const child of [...adminProfiles.childNodes]) child.remove();
      const selected = profiles.filter(p => p.domain === list.value);
      remove.disabled = busy || !selected.length;
      selected.forEach(p => {
        const row = $("section", { className: "ysc-domain-profile" });
        const enabled = $("input", { type: "checkbox", checked: p.enabled });
        enabled.onchange = async () => {
          try { await YSCProfiles.save({ ...p, enabled: enabled.checked }); p.enabled = enabled.checked; }
          catch (error) { enabled.checked = p.enabled; toast(t(error.message), true); }
        };
        const destination = YSCProfiles.pageUrl(p.lastUrl, p.domain) || YSCProfiles.pageUrl(`https://${p.domain}/`, p.domain);
        const use = $("button", { textContent: t("Відкрити"), disabled: !destination, title: t("Відкрити останню сторінку та активувати профіль") });
        use.onclick = async () => {
          if (!destination) return;
          try {
            await YSCProfiles.select(p.id);
            if (destination === location.href) await run(true);
            else location.assign(destination);
          } catch (error) { toast(t(error.message), true); }
        };
        const del = $("button", { className: "secondary", textContent: t("Видалити") });
        del.onclick = async () => {
          if (!confirm(t("Видалити профіль «{name}» домену {domain}?", { name: p.supplier || p.domain, domain: p.domain }))) return;
          try { await YSCProfiles.remove(p.id); if (p.id === profile.id) await run(true); else await refresh(); }
          catch (error) { toast(t(error.message), true); }
        };
        const name = `${p.supplier || p.domain}${p.urlPattern ? ` · ${p.urlPattern}` : ""}`;
        row.append($("div", { className: "ysc-profile-open" }, [use, $("span", { textContent: name })]));
        if (p.lastUrl) row.append($("p", { className: "ysc-last-url", textContent: p.lastUrl }));
        details.append(row);
        adminProfiles.append($("section", { className: "ysc-domain-profile" }, [$("label", {}, [enabled, document.createTextNode(` ${name}`)]), del]));
      });
    }
    async function refresh() {
      try {
        profiles = await YSCProfiles.all();
        if (!box.isConnected) return;
        const previous = list.value;
        for (const option of [...list.childNodes]) option.remove();
        const domains = [...new Set(profiles.map(p => p.domain))].sort((a, b) => a.localeCompare(b));
        const selected = domains.includes(previous) ? previous : domains.includes(location.hostname) ? location.hostname : domains[0] || "";
        domains.forEach(domain => list.append($("option", { value: domain, textContent: `${domain} (${profiles.filter(p => p.domain === domain).length})`, selected: domain === selected })));
        list.value = selected; list.disabled = !domains.length;
        status.textContent = domains.length ? t("Доменів: {count}. Число в дужках — кількість профілів, включно з вимкненими.", { count: domains.length }) : t("Збережених профілів немає.");
        showSelected();
      } catch (error) { status.textContent = t("Помилка збереження: {error}", { error: error.message }); }
    }
    list.onchange = showSelected;
    remove.onclick = async () => {
      if (busy || !list.value) return;
      const domain = list.value, count = profiles.filter(p => p.domain === domain).length;
      if (!confirm(t("Видалити всі профілі домену {domain} ({count})? Для відновлення потрібен раніше експортований JSON.", { domain, count }))) return;
      busy = true; remove.disabled = true;
      try {
        await YSCProfiles.removeDomain(domain);
        toast(t("Видалено профілі домену {domain}.", { domain }));
        if (domain === profile.domain) await run(true); else { busy = false; await refresh(); }
      } catch (error) { busy = false; remove.disabled = false; toast(t(error.message), true); }
    };
    box.append($("label", { htmlFor: list.id, textContent: t("Усі профільовані домени") }), list, details,
      folded("profile-tools", t("Службові дії та резервна копія"), [status, adminProfiles, remove, $("div", { className: "ysc-backup-controls" }, backupControls)]));
    refresh(); return box;
  }
  function sheetControls() {
    const box = $("section", { className: "ysc-sheet" });
    const enabled = $("input", { id: "ysc-sheet-enabled", type: "checkbox", checked: Boolean(profile.format.sheet && !profile.format.sheetRod) });
    const rod = $("input", { id: "ysc-rod-enabled", type: "checkbox", checked: Boolean(profile.format.sheet && profile.format.sheetRod) });
    const changeMode = (active, isRod) => {
      profile.format.sheet = active;
      profile.format.sheetRod = active && isRod;
      for (const key of ["sheetLength", "sheetWidth", "sheetThickness"]) profile.fields[key] ||= { enabled: true, source: "auto", selector: "" };
      const parsed = YSCParser.parse(profile);
      result.sheetLength = parsed.sheetLength || ""; result.sheetWidth = parsed.sheetWidth || ""; result.sheetThickness = parsed.sheetThickness || "";
      result.sheetConfirmed = false;
      nextExcelBlock = 0; render();
    };
    enabled.onchange = () => changeMode(enabled.checked, false);
    rod.onchange = () => changeMode(rod.checked, true);
    box.append($("label", {}, [enabled, document.createTextNode(t(" Плитний матеріал — розмір листа"))]));
    box.append($("label", {}, [rod, document.createTextNode(t(" Хлист — довжина хлиста"))]));
    if (!profile.format.sheet) return box;
    for (const key of ["sheetLength", "sheetWidth", "sheetThickness"]) profile.fields[key] ||= { enabled: true, source: "auto", selector: "" };
    const units = $("select", { id: "ysc-sheet-input-unit" });
    for (const [value, title] of [["mm", "Міліметри (мм)"], ["m", "Метри (м)"]]) units.append($("option", { value, textContent: t(title), selected: value === (profile.format.sheetInputUnit || "mm") }));
    units.onchange = () => { profile.format.sheetInputUnit = units.value; result.sheetConfirmed = false; render(); };
    const unitsBox = $("div", {}, [$("label", { htmlFor: units.id, textContent: t("Одиниці розмірів") }), units]);
    const thicknessBox = $("div");
    const [thicknessLabel, thicknessField] = input(t("Товщина, мм"), result.sheetThickness, value => { result.sheetThickness = value; refreshPreview(); });
    thicknessField.id = "ysc-value-sheetThickness"; thicknessLabel.htmlFor = thicknessField.id;
    thicknessField.setAttribute("list", "ysc-thickness-options");
    const thicknessOptions = $("datalist", { id: "ysc-thickness-options" });
    for (const value of result.candidates.sheetThickness || []) thicknessOptions.append($("option", { value }));
    thicknessBox.append(thicknessLabel, thicknessField, thicknessOptions);
    inlinePicker(thicknessField, "sheetThickness", t("Вибрати товщину на сторінці"), () => {
      panel.style.display = "none";
      YSCPicker.start("sheetThickness", selected => {
        profile.fields.sheetThickness = { ...profile.fields.sheetThickness, enabled: true, source: "css", selector: selected.selector };
        const parsed = YSCParser.parse(profile);
        result.sheetThickness = parsed.sheetThickness || "";
        result.candidates.sheetThickness = parsed.candidates.sheetThickness || [];
        nextExcelBlock = 0; render();
      });
    });
    box.append($("div", { className: "ysc-sheet-meta" }, profile.format.sheetRod ? [unitsBox] : [unitsBox, thicknessBox]));
    const row = $("div", { className: "ysc-pricing" });
    const status = $("p", { id: "ysc-sheet-status" });
    const updateStatus = () => {
      const unit = YSCFormatter.sheetUnit(outputFields(), profile.format);
      status.textContent = result.sheetConfirmed ? t("Підтверджено: {unit}", { unit }) : t("Перевірте розмір: {unit}", { unit });
    };
    for (const [key, title, buttonTitle] of [["sheetLength", "Довжина листа", "Вибрати довжину на сторінці"], ["sheetWidth", "Ширина листа", "Вибрати ширину на сторінці"]]) {
      if (profile.format.sheetRod && key === "sheetWidth") continue;
      const column = $("div");
      const [label, field] = input(profile.format.sheetRod ? t("Довжина хлиста") : title, result[key], value => { result[key] = value; result.sheetConfirmed = false; updateStatus(); refreshPreview(); });
      field.id = `ysc-value-${key}`;
      label.htmlFor = field.id;
      column.append(label, field);
      inlinePicker(field, key, buttonTitle, () => {
        panel.style.display = "none";
        YSCPicker.start(key, selected => {
          profile.fields[key] = { ...profile.fields[key], enabled: true, source: "css", selector: selected.selector };
          result[key] = YSCParser.parse(profile)[key] || "";
          result.sheetConfirmed = false; nextExcelBlock = 0; render();
        });
      });
      row.append(column);
    }
    const confirm = $("button", { id: "ysc-sheet-confirm", textContent: t("Підтвердити розмір") });
    confirm.onclick = () => {
      if (!YSCFormatter.sheetSize(outputFields(), profile.format)) return toast(profile.format.sheetRod ? t("Введіть коректну довжину хлиста.") : t("Введіть коректні довжину та ширину листа."), true);
      if (!result.unit) return toast(t("Вкажіть одиницю виміру матеріалу."), true);
      result.sheetConfirmed = true; updateStatus(); refreshPreview();
    };
    updateStatus(); box.append(row, status, confirm);
    return box;
  }
  function quickText() {
    return YSCFormatter.format({ supplier: result.supplier, article: result.article, name: result.name }, YSCFormatter.defaults);
  }
  async function copyQuick() {
    const value = quickText();
    if (!value) return toast(t("Заповніть поля нижче"), true);
    try {
      const reply = await chrome.runtime.sendMessage({ type: "YSC_COPY", text: value });
      if (reply?.ok) toast(t("Прийнято в буфер{target}:\n{value}", { target: "", value }));
      else toast(t("Не вдалося скопіювати: {error}", { error: t(reply?.error || "помилка") }), true);
    } catch (error) { toast(t("Не вдалося скопіювати: {error}", { error: error.message }), true); }
  }
  async function copy(requestedBlock) {
    result = outputFields();
    if (sheetConfirmationRequired() && (!result.sheetConfirmed || !YSCFormatter.sheetSize(result, profile.format))) return toast(profile.format.sheetRod ? t("Уточніть і підтвердьте довжину хлиста перед копіюванням.") : t("Уточніть і підтвердьте розмір листа перед копіюванням."), true);
    let value;
    if (!result.productDetected || !result.name) return toast(t("Не знайдено назву товару — налаштуйте поле."), true);
    if (profile.format.excel) {
      try { const error = excelValidationError(); if (error) return toast(error, true); }
      catch (error) { return toast(t(error.message), true); }
    } else if (!result.article) return toast(t("Не знайдено артикул — налаштуйте поле."), true);
    try {
      const blocks = profile.format.excel ? YSCFormatter.excelBlocks(outputFields(), profile.format) : [];
      const index = typeof requestedBlock === "number" ? requestedBlock : nextExcelBlock;
      const block = blocks[index] || blocks[0];
      value = block ? block.text : YSCFormatter.format(outputFields(), { ...profile.format, excel: false });
      const reply = await chrome.runtime.sendMessage({ type: "YSC_COPY", text: value });
      if (reply?.ok) {
        try { Object.assign(profile, await YSCProfiles.remember(profile, location.href)); }
        catch (error) { toast(t("Не вдалося запам’ятати сторінку: {error}", { error: error.message }), true); }
        if (blocks.length > 1 && index < blocks.length - 1) {
          nextExcelBlock = index + 1;
          render(); panel.querySelector("#ysc-settings").open = true;
          if (profile.format.excelVertical) toast(t("Прийнято в буфер → рядки {target}:\n{value}\nВставте починаючи з рядка {row} потрібного стовпця. Наступний блок → {next}.", { target: block.target, value, row: block.start, next: blocks[index + 1].target }));
          else toast(t("Прийнято в буфер → {target}:\n{value}\nВставте в {column} потрібного рядка. Потім скопіюйте наступний блок → {next}.", { target: block.target, value, column: YSCFormatter.columnName(block.start), next: blocks[index + 1].target }));
        } else {
          panel?.remove(); nextExcelBlock = 0;
          toast(t("Прийнято в буфер{target}:\n{value}", { target: block ? ` → ${block.target}` : "", value }));
        }
      } else toast(t("Не вдалося скопіювати: {error}", { error: t(reply?.error || "помилка") }), true);
    } catch (error) { toast(t("Не вдалося скопіювати: {error}", { error: t(error.message) }), true); }
  }
  function pickField(key) {
    panel.style.display = "none";
    YSCPicker.start(key, selected => { profile.fields[key].source = "css"; profile.fields[key].selector = selected.selector; rerun(); });
  }
  function pickImage() {
    panel.style.display = "none";
    YSCPicker.start("imageUrl", selected => {
      const value = YSCParser.imageUrl(selected.imageUrl);
      if (!value) { panel.style.display = "flex"; toast(t("Оберіть саме зображення товару."), true); return; }
      const rule = profile.fields.imageUrl ||= { enabled: true, source: "auto", selector: "", regex: "", attribute: "", value: "" };
      rule.enabled = true; rule.source = "attribute"; rule.selector = selected.imageSelector; rule.attribute = selected.imageAttribute;
      rerun();
    });
  }
  function fieldEditor(key, title) {
    const rule = profile.fields[key] ||= { enabled: true, source: "auto", selector: "", regex: "", attribute: "", value: "" }, section = $("section", { className: "ysc-rule" });
    section.append($("h3", { textContent: t(title) }));
    const enabled = $("input", { type: "checkbox", checked: rule.enabled });
    enabled.onchange = () => { rule.enabled = enabled.checked; rerun(); };
    section.append($("label", { className: "ysc-check" }, [enabled, document.createTextNode(t(" Використовувати поле"))]));
    const source = $("select");
    const sources = { auto: t("Автоматично"), jsonld: t("Метадані товару (JSON-LD)"), css: t("Елемент сторінки (CSS)"), attribute: t("Атрибут елемента"), regex: t("Пошук за виразом"), url: t("Параметр адреси"), manual: t("Фіксоване значення") };
    Object.entries(sources).forEach(([value, label]) => source.append($("option", { value, textContent: t(label), selected: rule.source === value })));
    source.onchange = () => { rule.source = source.value; rerun(); };
    section.append($("label", { textContent: t("Звідки брати значення") }), source);
    const add = (label, property) => section.append(...input(label, rule[property], v => { rule[property] = v; rerun(); }, "text", "change"));
    if (["css", "attribute"].includes(rule.source)) add(t("CSS-селектор"), "selector");
    if (rule.source === "attribute") add(t("Назва атрибута"), "attribute");
    if (rule.source === "regex") add(t("Регулярний вираз (група 1)"), "regex");
    if (["manual", "fixed"].includes(rule.source)) add(t("Фіксоване значення для всіх товарів"), "value");
    if (rule.source === "url") add(t("Назва параметра адреси"), "value");
    return section;
  }
  function render() {
    const opened = new Set([...(panel?.querySelectorAll("details[open]") || [])].map(el => el.id));
    if (panel?.querySelector("#ysc-style-settings")) styleSettingsVisible = !panel.querySelector("#ysc-style-settings").hidden;
    const scrollTop = panel?.querySelector(".ysc-body")?.scrollTop || 0;
    const columnScroll = panel?.querySelector(".ysc-excel-row")?.scrollLeft || 0;
    panel?.remove(); panel = $("aside", { id:"ysc-panel", lang: YSCI18n.language });
    const heading = $("h2", { className: "ysc-heading" }, [
      $("img", { src: chrome.runtime.getURL("icons/icon-32.png"), alt: "", width: 24, height: 24 }),
      $("span", { textContent: "Y Supplier Clipboard" })
    ]);
    const quickCopy = $("button", { id: "ysc-quick-copy", textContent: "⧉", title: t("Скопіювати результат"), ariaLabel: t("Скопіювати результат") });
    quickCopy.onclick = copyQuick;
    panel.append(heading, $("div", { className: "ysc-quick-result" }, [$("div", { id: "ysc-quick-preview", textContent: quickText() }), quickCopy]));
    const imageStage = $("div", { className: "ysc-product-image-stage" });
    const [currentSupplierLabel, currentSupplier] = input(t("Постачальник"), result.supplier, updateSupplier); const [currentArticleLabel, currentArticle] = input(t("Артикул"), result.article, v => { result.article = v; refreshPreview(); }); const [currentNameLabel, currentName] = input(t("Назва товару"), result.name, v => { result.name = v; refreshPreview(); }); imageStage.append(currentSupplierLabel, currentSupplier, currentArticleLabel, currentArticle, currentNameLabel, currentName);
    inlinePicker(currentArticle, "article", t("Вибрати артикул на сторінці"));
    inlinePicker(currentName, "name", t("Вибрати назву на сторінці"));
    const imageChoices = result.candidates.imageUrl || [];
    if (imageChoices.length) {
      const imageIndex = imageChoices.indexOf(result.imageUrl);
      const chooseImage = offset => { const start = imageIndex < 0 ? (offset > 0 ? -1 : 0) : imageIndex; result.imageUrl = imageChoices[(start + offset + imageChoices.length) % imageChoices.length]; render(); };
      const imageSwitch = $("div", { className: "ysc-image-switch" });
      const previous = $("span", { id: "ysc-image-previous", className: "ysc-image-nav", textContent: "<", role: "button", tabIndex: 0, ariaLabel: t("Попереднє зображення"), title: t("Попереднє зображення") });
      const next = $("span", { id: "ysc-image-next", className: "ysc-image-nav", textContent: ">", role: "button", tabIndex: 0, ariaLabel: t("Наступне зображення"), title: t("Наступне зображення") });
      const picker = $("span", { id: "ysc-pick-image", className: "ysc-image-pick", role: "button", tabIndex: 0, title: t("Вибрати зображення товару на сторінці"), ariaLabel: t("Вибрати зображення товару на сторінці") }, [$("span", { className: "ysc-cursor-icon" })]);
      const activate = (element, action) => { element.onclick = action; element.onkeydown = event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); action(); } }; };
      activate(previous, () => chooseImage(-1)); activate(next, () => chooseImage(1)); activate(picker, pickImage);
      imageSwitch.append(previous, $("span", { id: "ysc-image-choice", textContent: t("Зображення {current} з {total}", { current: imageIndex + 1, total: imageChoices.length }) }), next, picker);
      imageStage.append(imageSwitch);
    }
    panel.append(imageStage);
    const pricing = $("div", { className: "ysc-pricing" });
    const priceBox = $("div"), unitBox = $("div");
    priceBox.append(...input(t("Ціна"), result.price, v => { result.price = v; result.confirmed = { ...result.confirmed, price: true }; refreshPreview(); }));
    unitBox.append(...input(t("Одиниця (шт, м, м²…)"), result.unit, v => { result.unit = v; result.sheetConfirmed = false; result.confirmed = { ...result.confirmed, unit: true }; refreshPreview(); }));
    inlinePicker(priceBox.querySelector("input"), "price", t("Вибрати ціну на сторінці"));
    inlinePicker(unitBox.querySelector("input"), "unit", t("Вибрати одиницю"));
    currentSupplier.id = "ysc-value-supplier"; currentArticle.id = "ysc-value-article"; currentName.id = "ysc-value-name";
    priceBox.querySelector("input").id = "ysc-value-price"; unitBox.querySelector("input").id = "ysc-value-unit";
    pricing.append(priceBox, unitBox); panel.append(pricing);
    for (const [key, title] of [["price", t("Ціна")], ["unit", t("Одиниця")]]) {
      if (result.candidates[key].length > 1) {
        const choices = $("select", { id: `ysc-choice-${key}` }); choices.append($("option", { textContent: t("Оберіть правильне значення…"), value: "", disabled: true, selected: !result.candidates[key].includes(result[key]) })); result.candidates[key].forEach(v => choices.append($("option", { textContent: v, value: v, selected: v === result[key] })));
        choices.onchange = () => { result[key] = choices.value; if (key === "unit") result.sheetConfirmed = false; result.confirmed = { ...result.confirmed, [key]: true }; (key === "price" ? priceBox : unitBox).querySelector("input").value = choices.value; refreshPreview(); };
        panel.append($("label", { textContent: t("{title}: кілька варіантів — перевірте", { title: t(title) }) }), choices);
      }
    }
    panel.append(sheetControls(), $("hr", { className: "ysc-data-divider" }));
    panel.append(workStyleControls(), previewElement());
    const imageSettingsBox = imageSettings();
    panel.append(styleSettings());
    if (result.candidates.article.length > 1) { const choices = $("select"); result.candidates.article.forEach(v => choices.append($("option", { textContent:v, value:v }))); choices.onchange = () => { result.article = choices.value; currentArticle.value = choices.value; refreshPreview(); }; panel.append($("label", { textContent:t("Кілька артикулів — виберіть правильний") }), choices); }
    const rulesBox = folded("rules", t("Додатково: правила отримання полів"), [fieldEditor("article", t("Артикул")), fieldEditor("name", t("Назва товару")), fieldEditor("price", t("Ціна")), fieldEditor("unit", t("Одиниця виміру")), fieldEditor("imageUrl", t("URL зображення товару"))]);
    panel.append(rulesBox);
    if (profile.format.sheet) {
      panel.querySelector("#ysc-rules").append(fieldEditor("sheetLength", profile.format.sheetRod ? t("Довжина хлиста") : t("Довжина листа")));
      if (!profile.format.sheetRod) panel.querySelector("#ysc-rules").append(fieldEditor("sheetWidth", t("Ширина листа")), fieldEditor("sheetThickness", t("Товщина, мм")));
    }
    panel.append(blacklistSettings());
    const opts = [["replaceComma",t("Замінювати коми")],["normalizeSpaces",t("Нормалізувати пробіли")],["stripControls",t("Прибирати службові символи")],["uppercaseSupplier",t("Верхній регістр постачальника")],["supplier",t("Включати Supplier")],["article",t("Включати Article")],["name",t("Включати Product Name")]]; const formatBox = $("section"); formatBox.append($("label", { textContent:t("Форматування") })); opts.forEach(([key,label]) => { const cb = $("input", { type:"checkbox", checked: profile.format[key] ?? YSCFormatter.defaults[key] }); cb.onchange = async () => { profile.format[key] = cb.checked; try { await persistStyle(); refreshPreview(); } catch (error) { toast(t(error.message), true); } }; formatBox.append($("label", {}, [cb, document.createTextNode(` ${t(label)}`)])); });
    const nextTarget = profile.format.excel ? (() => { try { return YSCFormatter.excelBlocks(outputFields(), profile.format)[nextExcelBlock]?.target; } catch (_) { return ""; } })() : "";
    const copyButton = $("button", { id: "ysc-copy", textContent:nextTarget ? t("Скопіювати → {target}", { target: nextTarget }) : t("Скопіювати") }); copyButton.onclick = copy; const save = $("button", { textContent:t("Зберегти профіль"), className:"secondary" }); save.onclick = async () => {
      try {
        profile.lastUrl = YSCProfiles.pageUrl(location.href, profile.domain);
        await YSCProfiles.save(profile);
        panel?.remove();
        toast(t("Профіль збережено локально"));
      } catch (error) { toast(t("Не вдалося зберегти профіль: {error}", { error: t(error.message) }), true); }
    };
    const exportButton = $("button", { textContent:t("Експорт JSON"), className:"secondary" }); exportButton.onclick = async () => { const blob = new Blob([JSON.stringify(await YSCProfiles.all(), null, 2)], { type:"application/json" }); const a = $("a", { href:URL.createObjectURL(blob), download:"y-supplier-profiles.json" }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    const importer = $("input", { type:"file", accept:"application/json", style:"display:none" }); importer.onchange = async () => { try { const incoming = YSCProfiles.validate(JSON.parse(await importer.files[0].text())); await chrome.storage.local.set({ ysc_profiles: incoming }); toast(t("Профілі імпортовано")); } catch (e) { toast(t("Невірний файл: {error}", { error: t(e.message) }), true); } }; const importButton = $("button", { textContent:t("Імпорт JSON"), className:"secondary" }); importButton.onclick = () => importer.click();
    formatBox.querySelector("label")?.remove();
    rulesBox.remove();
    const formatRules = folded("format-rules", t("Форматування та правила отримання полів"), [formatBox, ...[...rulesBox.children].slice(1)]);
    panel.append(formatRules);
    const profilesBox = folded("profiles", t("Профілі та резервна копія"), [domainManager([exportButton, importButton, importer])]);
    panel.append(profilesBox);
    const settings = folded("settings", t("Налаштування"), [imageSettingsBox, profilesBox, panel.querySelector("#ysc-blacklist"), formatRules]);
    settings.querySelector("summary").after(languageSelector());
    const helpLink = (label, path) => $("a", { textContent: t(label), href: path, target: "_blank", rel: "noopener noreferrer" });
    settings.append(folded("help", t("Довідка"), [
      $("p", { id: "ysc-help-name", textContent: "Y Supplier Clipboard" }),
      $("p", { id: "ysc-help-description", textContent: t("Supplier Clipboard — «буфер обміну постачальника». Розширення збирає дані товару зі сторінки магазину та готує їх для вставлення в CAD або Excel.") }),
      $("p", { id: "ysc-code-version", textContent: t("Версія коду: {version}", { version: chrome.runtime.getManifest().version }) }),
      $("p", { id: "ysc-revision-date", textContent: t("Дата редакції: {date}", { date: "14.10.2026" }) }),
      $("p", {}, [helpLink("README.md — інструкція", chrome.runtime.getURL("ui/help.html?doc=readme"))]),
      $("p", {}, [helpLink("Ліцензія MIT", chrome.runtime.getURL("ui/help.html?doc=license"))]),
      $("p", {}, [helpLink("Підтримка у Telegram — Yurms", "https://web.telegram.org/a/#-1001323392064_1018")])
    ]));
    panel.append(settings);
    const close = $("button", { textContent:t("Закрити"), className:"secondary" }); close.onclick = () => { YSCPicker.stop(); panel.remove(); };
    const body = $("div", { className: "ysc-body" });
    const opacity = Number(profile.format.imageBackgroundOpacity);
    const imageOpacity = Number.isFinite(opacity) ? Math.max(0, Math.min(100, Math.round(opacity))) : 50;
    if (imageStage.style.setProperty) imageStage.style.setProperty("--ysc-image-overlay-opacity", `${imageOpacity}%`);
    else imageStage.style["--ysc-image-overlay-opacity"] = `${imageOpacity}%`;
    if (result.imageUrl) {
      const image = `url("${result.imageUrl}")`;
      if (imageStage.style.setProperty) imageStage.style.setProperty("--ysc-product-image", image);
      else imageStage.style["--ysc-product-image"] = image;
    }
    body.append(...panel.childNodes);
    const footer = $("div", { className: "ysc-footer" }, [copyButton, save, close]);
    panel.append(body, footer);
    for (const key of ["--ysc-accent", "--ysc-input-border", "--ysc-control-text"]) {
      if (panel.style.setProperty) panel.style.setProperty(key, accentColor);
      else panel.style[key] = accentColor;
    }
    panel.querySelectorAll("details").forEach(el => { el.open = opened.has(el.id); });
    document.documentElement.append(panel); body.scrollTop = scrollTop;
    panel.querySelector(".ysc-excel-row").scrollLeft = columnScroll;
  }
  async function run(forcePanel = false) {
    await styleWrites;
    styleSettingsVisible = false;
    if (panel?.querySelector("#ysc-style-settings")) panel.querySelector("#ysc-style-settings").hidden = true;
    const savedProfile = await YSCProfiles.get();
    profile = savedProfile || YSCProfiles.base(location.hostname);
    try { if (savedProfile) Object.assign(profile, await YSCProfiles.remember(profile, location.href)); }
    catch (error) { toast(t("Не вдалося запам’ятати сторінку: {error}", { error: error.message }), true); }
    const preferences = await chrome.storage.local.get(["ysc_work_styles", "ysc_work_style", "ysc_excel_mode", "ysc_excel_layout", "ysc_excel_columns", "ysc_excel_vertical", "ysc_excel_image_formula", "ysc_image_background_opacity", "ysc_accent_color", "ysc_language"]);
    accentColor = /^#[0-9a-f]{6}$/i.test(preferences.ysc_accent_color || "") ? preferences.ysc_accent_color : "#ef7900";
    YSCI18n.setLanguage(preferences.ysc_language);
    profile.format.excel = true;
    profile.format.excelLayout = preferences.ysc_excel_layout || { ...YSCFormatter.excelLayout };
    if (preferences.ysc_excel_columns !== undefined) profile.format.excelColumns = preferences.ysc_excel_columns;
    profile.format.excelVertical = preferences.ysc_excel_vertical ?? profile.format.excelVertical ?? false;
    profile.format.excelImageFormula = preferences.ysc_excel_image_formula ?? profile.format.excelImageFormula ?? false;
    profile.format.imageBackgroundOpacity = preferences.ysc_image_background_opacity ?? profile.format.imageBackgroundOpacity ?? 50;
    workStyles = YSCWorkStyles.migrate(preferences, profile.format);
    await YSCWorkStyles.save(workStyles);
    YSCWorkStyles.apply(profile.format, workStyles.styles.find(s => s.id === workStyles.selected));
    nextExcelBlock = 0;
    result = YSCParser.parse(profile);
    const quickExcel = () => {
      try {
        if (excelValidationError()) return false;
        const columns = YSCFormatter.excelColumns(profile.format);
        const needs = key => columns.includes(key);
        return (!needs("price") || result.candidates.price.length <= 1)
          && (!needs("unit") && !needs("plainUnit") || result.candidates.unit.length <= 1)
          && (!needs("article") && !(needs("fullName") && profile.format.article !== false) || result.candidates.article.length <= 1);
      } catch (_) { return false; }
    };
    const canCopy = !sheetConfirmationRequired() && result.productDetected && result.name && (profile.format.excel
      ? quickExcel()
      : result.article && result.candidates.article.length <= 1);
    if (canCopy && !forcePanel) return copy(); render();
  }
  async function togglePanel() {
    if (toggling) return;
    toggling = true;
    try {
      if (panel?.isConnected) {
        YSCPicker.stop();
        panel.style.display = "flex";
        // Copy the current edited result without reloading the saved profile.
        await copy();
      } else await run(true);
    } catch (error) { toast(t("Не вдалося відкрити налаштування: {error}", { error: t(error.message) }), true); }
    finally { toggling = false; }
  }
  chrome.runtime.onMessage.addListener(message => { if (message.type === "YSC_RUN") run(); if (message.type === "YSC_CONFIGURE") togglePanel(); if (message.type === "YSC_NOTICE") toast(t(message.text), true); });
})();
