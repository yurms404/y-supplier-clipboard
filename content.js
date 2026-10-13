(() => {
  const t = (key, parameters) => YSCI18n.t(key, parameters);
  let panel, profile, result, toggling = false, nextExcelBlock = 0;
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
    const settings = folded("excel-settings", t("Налаштування копіювання в Excel"), []);
    const vertical = $("input", { id: "ysc-excel-vertical", type: "checkbox", checked: Boolean(profile.format.excelVertical) });
    vertical.onchange = async () => {
      try {
        await chrome.storage.local.set({ ysc_excel_vertical: vertical.checked });
        profile.format.excelVertical = vertical.checked; nextExcelBlock = 0; render();
      } catch (error) { vertical.checked = Boolean(profile.format.excelVertical); toast(t(error.message), true); }
    };
    settings.append($("label", {}, [vertical, document.createTextNode(t(" Вставляти у стовпчик (Enter); вимкнено — у рядок (Tab)"))]));
    if (profile.format.excelVertical) settings.append($("p", { textContent: t("У режимі Enter схема задає рядки 1–26 замість стовпців A–Z. Для одного вставлення розмістіть поля поруч без пропусків. Вставляйте у вибрану комірку, не в режимі її редагування.") }));
    const columns = YSCFormatter.excelColumns(profile.format);
    const labels = { skip: t("Не чіпати"), fullName: t("Повна назва"), supplier: t("Постачальник"), article: t("Артикул"), name: t("Назва товару"), unit: t("Одиниця з розміром"), plainUnit: t("Одиниця без розміру"), price: t("Ціна"), sheetLength: t("Довжина (м)"), sheetWidth: t("Ширина (м)"), sheetThickness: t("Товщина (мм)"), sheetSize: t("Розмір листа (м)"), url: t("URL поточної сторінки") };
    const strip = $("div", { className: "ysc-excel-row" });
    for (let index = 0; index < 26; index++) {
      const column = YSCFormatter.columnName(index + 1), key = columns[index];
      const select = $("select", { id: `ysc-excel-column-${column}`, ariaLabel: t("Стовпець {column}", { column }) });
      for (const [value, textContent] of Object.entries(labels)) select.append($("option", { value, textContent, selected: value === key }));
      select.onchange = async () => {
        const previous = profile.format.excelColumns;
        const proposed = [...YSCFormatter.excelColumns(profile.format)]; proposed[index] = select.value;
        try {
          YSCFormatter.excelColumns({ excelColumns: proposed });
          profile.format.excelColumns = proposed; nextExcelBlock = 0;
          await chrome.storage.local.set({ ysc_excel_columns: proposed });
          render();
        } catch (error) { profile.format.excelColumns = previous; select.value = key; toast(t(error.message), true); }
      };
      strip.append($("div", { className: key !== "skip" ? "ysc-cell-write" : "ysc-cell-skip" }, [$("label", { htmlFor: select.id, textContent: profile.format.excelVertical ? String(index + 1) : column }), select]));
    }
    settings.append(strip);
    if (!profile.format.excelVertical) settings.append($("p", { textContent: t("Для кожного стовпця виберіть поле або «Не чіпати». Поля можна повторювати. Прокрутіть схему вправо, щоб налаштувати стовпці до Z.") }), $("p", { textContent: t("Суміжні стовпці об’єднуються в одну сесію копіювання. Якщо між ними є пропуски — розширення готує окремі сесії. Схема зберігається автоматично; початкову комірку в Excel вибираєте ви.") }));
    settings.append(excelSteps());
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
    for (const [key, title] of [["sheetLength", "Довжина (м)"], ["sheetWidth", "Ширина (м)"], ["sheetThickness", "Товщина (мм)"], ["sheetSize", "Розмір листа (м)"]]) {
      if (needs(key) && !YSCFormatter.excelValue(key, result, profile.format)) return t("Заповніть поле «{field}» для вибраного стовпця.", { field: t(title) });
    }
    return "";
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
        const clone = $("button", { className: "secondary", textContent: t("Клонувати") });
        clone.onclick = async () => {
          try { const duplicate = structuredClone(p); duplicate.id = crypto.randomUUID(); duplicate.enabled = false; await YSCProfiles.save(duplicate); await refresh(); }
          catch (error) { toast(t(error.message), true); }
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
        adminProfiles.append($("section", { className: "ysc-domain-profile" }, [$("label", {}, [enabled, document.createTextNode(` ${name}`)]), clone, del]));
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
  async function copy(requestedBlock) {
    result = outputFields();
    if (profile.format.excel && profile.format.sheet && (!result.sheetConfirmed || !YSCFormatter.sheetSize(result, profile.format))) return toast(profile.format.sheetRod ? t("Уточніть і підтвердьте довжину хлиста перед копіюванням.") : t("Уточніть і підтвердьте розмір листа перед копіюванням."), true);
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
          render(); panel.querySelector("#ysc-settings").open = true; panel.querySelector("#ysc-excel-settings").open = true;
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
  function fieldEditor(key, title) {
    const rule = profile.fields[key], section = $("section", { className: "ysc-rule" });
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
    const scrollTop = panel?.querySelector(".ysc-body")?.scrollTop || 0;
    const columnScroll = panel?.querySelector(".ysc-excel-row")?.scrollLeft || 0;
    panel?.remove(); panel = $("aside", { id:"ysc-panel", lang: YSCI18n.language });
    const heading = $("h2", { className: "ysc-heading" }, [
      $("img", { src: chrome.runtime.getURL("icons/icon-32.png"), alt: "", width: 24, height: 24 }),
      $("span", { textContent: "Y Supplier Clipboard" })
    ]);
    panel.append(heading, previewElement());
    const [currentSupplierLabel, currentSupplier] = input(t("Постачальник"), result.supplier, updateSupplier); const [currentArticleLabel, currentArticle] = input(t("Артикул"), result.article, v => { result.article = v; refreshPreview(); }); const [currentNameLabel, currentName] = input(t("Назва товару"), result.name, v => { result.name = v; refreshPreview(); }); panel.append(currentSupplierLabel, currentSupplier, currentArticleLabel, currentArticle, currentNameLabel, currentName);
    inlinePicker(currentArticle, "article", t("Вибрати артикул на сторінці"));
    inlinePicker(currentName, "name", t("Вибрати назву на сторінці"));
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
    panel.append(sheetControls());
    const excel = $("input", { type: "checkbox", checked: Boolean(profile.format.excel) });
    excel.onchange = () => {
      profile.format.excel = excel.checked;
      refreshPreview();
      chrome.storage.local.set({ ysc_excel_mode: excel.checked }).catch(error => toast(t("Не вдалося зберегти режим Excel: {error}", { error: t(error.message) }), true));
    };
    panel.append($("label", { id: "ysc-excel-mode-label" }, [excel, document.createTextNode(" " + (profile.format.excelVertical ? t("Для Excel: вибрана компоновка в стовпчик") : t("Для Excel: вибрана компоновка в рядок")))]));
    panel.append(excelSettings());
    if (result.candidates.article.length > 1) { const choices = $("select"); result.candidates.article.forEach(v => choices.append($("option", { textContent:v, value:v }))); choices.onchange = () => { result.article = choices.value; currentArticle.value = choices.value; refreshPreview(); }; panel.append($("label", { textContent:t("Кілька артикулів — виберіть правильний") }), choices); }
    panel.append(folded("rules", t("Додатково: правила отримання полів"), [fieldEditor("article", t("Артикул")), fieldEditor("name", t("Назва товару")), fieldEditor("price", t("Ціна")), fieldEditor("unit", t("Одиниця виміру"))]));
    if (profile.format.sheet) {
      panel.querySelector("#ysc-rules").append(fieldEditor("sheetLength", profile.format.sheetRod ? t("Довжина хлиста") : t("Довжина листа")));
      if (!profile.format.sheetRod) panel.querySelector("#ysc-rules").append(fieldEditor("sheetWidth", t("Ширина листа")), fieldEditor("sheetThickness", t("Товщина, мм")));
    }
    panel.append(blacklistSettings());
    const opts = [["replaceComma",t("Замінювати коми")],["normalizeSpaces",t("Нормалізувати пробіли")],["stripControls",t("Прибирати службові символи")],["uppercaseSupplier",t("Верхній регістр постачальника")],["supplier",t("Включати Supplier")],["article",t("Включати Article")],["name",t("Включати Product Name")]]; const formatBox = $("section"); formatBox.append($("label", { textContent:t("Форматування") })); opts.forEach(([key,label]) => { const cb = $("input", { type:"checkbox", checked: profile.format[key] ?? YSCFormatter.defaults[key] }); cb.onchange = () => { profile.format[key] = cb.checked; rerun(); }; formatBox.append($("label", {}, [cb, document.createTextNode(` ${t(label)}`)])); }); panel.append(formatBox);
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
    formatBox.remove();
    formatBox.querySelector("label")?.remove();
    panel.append(folded("format", t("Форматування тексту"), [formatBox]));
    const profilesBox = folded("profiles", t("Профілі та резервна копія"), [domainManager([exportButton, importButton, importer])]);
    panel.append(profilesBox);
    const settings = folded("settings", t("Налаштування"), [...panel.children].filter(el => el.tagName === "DETAILS"));
    settings.querySelector("summary").after(languageSelector());
    const helpLink = (label, path) => $("a", { textContent: t(label), href: path, target: "_blank", rel: "noopener noreferrer" });
    settings.append(folded("help", t("Довідка"), [
      $("p", { id: "ysc-help-name", textContent: "Y Supplier Clipboard" }),
      $("p", { id: "ysc-help-description", textContent: t("Supplier Clipboard — «буфер обміну постачальника». Розширення збирає дані товару зі сторінки магазину та готує їх для вставлення в CAD або Excel.") }),
      $("p", { id: "ysc-code-version", textContent: t("Версія коду: {version}", { version: chrome.runtime.getManifest().version }) }),
      $("p", { id: "ysc-revision-date", textContent: t("Дата редакції: {date}", { date: "12.10.2026" }) }),
      $("p", {}, [helpLink("README.md — інструкція", chrome.runtime.getURL("ui/help.html?doc=readme"))]),
      $("p", {}, [helpLink("Ліцензія MIT", chrome.runtime.getURL("ui/help.html?doc=license"))]),
      $("p", {}, [helpLink("Підтримка у Telegram — Yurms", "https://web.telegram.org/a/#-1001323392064_1018")])
    ]));
    panel.append(settings);
    const close = $("button", { textContent:t("Закрити"), className:"secondary" }); close.onclick = () => { YSCPicker.stop(); panel.remove(); };
    const body = $("div", { className: "ysc-body" }); body.append(...panel.childNodes);
    const footer = $("div", { className: "ysc-footer" }, [copyButton, save, close]);
    panel.append(body, footer);
    panel.querySelectorAll("details").forEach(el => { el.open = opened.has(el.id); });
    document.documentElement.append(panel); body.scrollTop = scrollTop;
    panel.querySelector(".ysc-excel-row").scrollLeft = columnScroll;
  }
  async function run(forcePanel = false) {
    const savedProfile = await YSCProfiles.get();
    profile = savedProfile || YSCProfiles.base(location.hostname);
    try { if (savedProfile) Object.assign(profile, await YSCProfiles.remember(profile, location.href)); }
    catch (error) { toast(t("Не вдалося запам’ятати сторінку: {error}", { error: error.message }), true); }
    const preferences = await chrome.storage.local.get(["ysc_excel_mode", "ysc_excel_layout", "ysc_excel_columns", "ysc_excel_vertical", "ysc_language"]);
    YSCI18n.setLanguage(preferences.ysc_language);
    profile.format.excel = preferences.ysc_excel_mode ?? false;
    profile.format.excelLayout = preferences.ysc_excel_layout || { ...YSCFormatter.excelLayout };
    if (preferences.ysc_excel_columns !== undefined) profile.format.excelColumns = preferences.ysc_excel_columns;
    profile.format.excelVertical = preferences.ysc_excel_vertical ?? profile.format.excelVertical ?? false;
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
    const canCopy = !(profile.format.excel && profile.format.sheet) && result.productDetected && result.name && (profile.format.excel
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
