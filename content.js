(() => {
  const t = (key, parameters) => YSCI18n.t(key, parameters);
  let panel, profile, result, toggling = false, nextExcelBlock = 0;
  let workStyles, styleWrites = Promise.resolve(), styleSettingsVisible = false;
  let settingsSections = [], settingsWrites = Promise.resolve();
  let helpMode = "novice";
  let accentColor = "#ef7900", localImageBusy = false;
  let localImageOptions = YSCLocalImages.settings(), localImageFolderName = "";
  function localImagePath() {
    try { return YSCLocalImages.displayPath(localImageOptions, localImageFolderName, YSCParser.removeBlocked(result?.supplier, profile?.blacklist) || "{supplier}"); }
    catch (error) { return t(error.message); }
  }
  function applyLocalImagePreferences(preferences) {
    localImageOptions = YSCLocalImages.settings(preferences.ysc_local_image_settings);
    localImageFolderName = preferences.ysc_local_image_folder_name || "";
  }
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
    const select = $("select", { id: "ysc-work-style", ariaLabel: t("work_style") });
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
    const edit = $("button", { id: "ysc-style-edit", className: "secondary", textContent: "✎", title: t("edit_style"), ariaLabel: t("edit_style") });
    edit.onclick = () => {
      styleSettingsVisible = !styleSettingsVisible;
      panel.querySelector("#ysc-style-settings").hidden = !styleSettingsVisible;
      edit.setAttribute("aria-expanded", String(styleSettingsVisible));
    };
    box.append($("label", { htmlFor: select.id, textContent: t("work_style") }), $("div", { className: "ysc-style-select" }, [select, edit]));
    return box;
  }
  function styleSettings() {
    const current = workStyles.styles.find(s => s.id === workStyles.selected);
    const box = $("section", { id: "ysc-style-settings", hidden: !styleSettingsVisible });
    const name = $("input", { id: "ysc-style-name", value: current.name, maxLength: 80 });
    box.append($("label", { htmlFor: name.id, textContent: t("style_name") }), name);
    name.onchange = async () => {
      const previous = current.name;
      const value = name.value.trim();
      if (!value) { name.value = previous; return toast(t("enter_a_style_name"), true); }
      current.name = YSCWorkStyles.uniqueName(value, workStyles.styles, current.id);
      name.value = current.name;
      const option = [...panel.querySelector("#ysc-work-style").children].find(item => item.value === current.id);
      if (option) option.textContent = current.name;
      try { await persistStyle(); }
      catch (error) { current.name = previous; name.value = previous; if (option) option.textContent = previous; toast(t(error.message), true); }
    };
    const actions = $("div", { className: "ysc-style-actions" });
    const action = (id, title, run) => { const button = $("button", { id, className: "secondary", textContent: t(title) }); button.onclick = async () => { try { await styleWrites; await run(); } catch (error) { toast(t(error.message), true); } }; actions.append(button); };
    action("ysc-style-duplicate", "duplicate", async () => {
      const id = crypto.randomUUID();
      workStyles.styles.push({ id, name: YSCWorkStyles.uniqueName(`${t("copy")} ${current.name}`, workStyles.styles), format: YSCWorkStyles.snapshot(profile.format) });
      workStyles.selected = id; await persistStyle(); nextExcelBlock = 0; render();
      const field = panel.querySelector("#ysc-style-name"); field.focus?.(); field.select?.();
    });
    action("ysc-style-reset", "reset", async () => { profile.format.excelColumns = Array(26).fill("skip"); await persistStyle(); nextExcelBlock = 0; render(); });
    action("ysc-style-delete", "delete", async () => { if (workStyles.styles.length < 2) throw new Error(t("keep_at_least_one_style")); if (!confirm(t("delete_style_2", { name: current.name }))) return; workStyles.styles = workStyles.styles.filter(s => s.id !== current.id); const previous = workStyles.styles.at(-1); workStyles.selected = previous.id; YSCWorkStyles.apply(profile.format, previous); await persistStyle(); nextExcelBlock = 0; render(); });
    box.append(actions, explanation("hint_styles"));
    const transfer = $("div", { className: "ysc-style-transfer" });
    const exporter = $("button", { id: "ysc-style-export", className: "secondary", textContent: t("export_style") });
    exporter.onclick = async () => {
      try {
        await styleWrites;
        const selected = workStyles.styles.find(s => s.id === workStyles.selected);
        const filename = (selected.name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/[. ]+$/, "") || "style") + ".ysc-style.json";
        const reply = await chrome.runtime.sendMessage({ type: "YSC_SAVE_STYLE", filename, text: JSON.stringify(YSCWorkStyles.exportStyle(selected), null, 2) });
        if (!reply?.ok) throw new Error(reply?.error || t("could_not_save_the_file"));
      } catch (error) { toast(t("could_not_export_style", { error: error.message }), true); }
    };
    const importer = $("input", { id: "ysc-style-import-file", type: "file", accept: ".json,application/json", hidden: true });
    importer.onchange = async () => {
      try {
        const file = importer.files?.[0];
        if (!file) return;
        const imported = YSCWorkStyles.importStyle(JSON.parse(await file.text()));
        await styleWrites;
        const collision = workStyles.styles.some(s => s.name.toLocaleLowerCase() === imported.name.toLocaleLowerCase());
        const style = { id: crypto.randomUUID(), name: YSCWorkStyles.uniqueName(collision ? `${t("copy")} ${imported.name}` : imported.name, workStyles.styles), format: imported.format };
        const state = { styles: [...workStyles.styles, style], selected: style.id };
        await YSCWorkStyles.save(state);
        workStyles = state; YSCWorkStyles.apply(profile.format, style);
        nextExcelBlock = 0; styleSettingsVisible = true; render();
        const field = panel.querySelector("#ysc-style-name"); field.focus?.(); field.select?.();
        toast(t("style_imported"));
      } catch (error) { toast(t("could_not_import_style", { error: t(error.message) }), true); }
      finally { importer.value = ""; }
    };
    const importButton = $("button", { id: "ysc-style-import", className: "secondary", textContent: t("import_style") });
    importButton.onclick = () => importer.click();
    transfer.append(exporter, importButton, importer);
    box.append(transfer);
    box.append(excelSettings());
    return box;
  }
  const $ = (tag, attrs = {}, children = []) => { const e = document.createElement(tag); Object.assign(e, attrs); children.forEach(c => e.append(c)); return e; };
  const explanation = (key, parameters = {}) => $("p", { className: "ysc-explanation", textContent: t(key, parameters), hidden: helpMode === "pro" });
  function helpModeSelector() {
    const select = $("select", { id: "ysc-help-mode", ariaLabel: t("help_mode") });
    for (const [value, key] of [["novice", "help_mode_novice"], ["pro", "help_mode_pro"]]) select.append($("option", { value, textContent: t(key), selected: helpMode === value }));
    select.onchange = async () => {
      try {
        const selected = select.value === "pro" ? "pro" : "novice";
        await chrome.storage.local.set({ ysc_help_mode: selected });
        helpMode = selected; render();
      } catch (error) { select.value = helpMode; toast(t("save_error", { error: error.message }), true); }
    };
    return $("section", {}, [$("label", { htmlFor: select.id, textContent: t("help_mode") }), select, explanation("hint_help_mode")]);
  }
  function showUpdateBanner(force = false) {
    return chrome.runtime.sendMessage({ type: "YSC_CHECK_UPDATE", force }).then(reply => {
      const update = reply?.update;
      if (!update || !panel?.isConnected || panel.querySelector("#ysc-update-banner")) return update || null;
      const banner = $("section", { id: "ysc-update-banner", className: "ysc-update-banner", role: "status" }, [
        $("strong", { textContent: t("update_available", { version: update.version }) }),
        $("span", { textContent: t("update_available_details") }),
        $("a", { textContent: t("open_github_release"), href: update.url, target: "_blank", rel: "noopener noreferrer" })
      ]);
      panel.querySelector(".ysc-heading")?.after(banner);
      return update;
    }).catch(() => null);
  }
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
    const section = $("details", { id: `ysc-${key}` }, [$("summary", { textContent: t(title) }), ...children]);
    section.addEventListener("toggle", event => {
      if (event.target !== section || !section.open) return;
      for (const sibling of section.parentElement?.children || []) {
        if (sibling !== section && sibling.tagName === "DETAILS") sibling.open = false;
      }
      let settingsParent = section;
      while (settingsParent && settingsParent.id !== "ysc-settings") settingsParent = settingsParent.parentElement;
      if (!settingsParent) return;
      for (const nested of section.querySelectorAll("details")) nested.open = false;
      if (section === settingsParent) {
        for (const id of settingsSections) {
          const remembered = settingsParent.querySelector(`#${id}`);
          if (remembered?.tagName !== "DETAILS" || remembered.parentElement !== settingsParent) continue;
          for (const sibling of remembered.parentElement.children) {
            if (sibling !== remembered && sibling.tagName === "DETAILS") sibling.open = false;
          }
          remembered.open = true;
        }
      }
      const selected = [...settingsParent.children].filter(el => el.tagName === "DETAILS" && el.open).map(el => el.id);
      if (JSON.stringify(selected) !== JSON.stringify(settingsSections)) {
        settingsSections = selected;
        settingsWrites = settingsWrites.then(() => chrome.storage.local.set({ ysc_settings_sections: selected })).catch(() => {});
      }
      const currentPanel = panel;
      requestAnimationFrame(() => {
        if (panel !== currentPanel || !section.isConnected || !section.open) return;
        const body = panel.querySelector(".ysc-body");
        if (!body) return;
        const top = body.scrollTop + section.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom + 8;
        body.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      });
    });
    return section;
  }
  function languageSelector() {
    const select = $("select", { value: YSCI18n.language, id: "ysc-language" });
    for (const { code: value, label } of YSCI18n.languages) select.append($("option", { value, textContent: label, selected: value === YSCI18n.language }));
    select.onchange = async () => {
      const previous = YSCI18n.language;
      try {
        await chrome.storage.local.set({ ysc_language: select.value });
        YSCI18n.setLanguage(select.value);
        render();
      } catch (error) { select.value = previous; toast(t("could_not_save_language", { error: error.message }), true); }
    };
    return $("div", { className: "ysc-language" }, [$("label", { htmlFor: "ysc-language", textContent: t("interface_language") }), select]);
  }
  function rerun() { nextExcelBlock = 0; result = YSCParser.parse(profile); render(); }
  function outputFields() {
    const cleaned = { ...result, url: location.href };
    for (const key of ["supplier", "article", "name", "unit", "price", "currency"]) cleaned[key] = YSCParser.removeBlocked(result[key], profile.blacklist);
    return cleaned;
  }
  function blacklistSettings() {
    const area = $("textarea", { rows: 3, maxLength: 5000, value: (profile.blacklist || []).join("\n"), placeholder: "Код товара:\nКод товару:" });
    const status = $("p", { id: "ysc-blacklist-status", role: "status", textContent: t("for_this_site_one_phrase_per_line_saved_automatically_matches_are_ex"), hidden: helpMode === "pro" });
    let revision = 0;
    area.oninput = async () => {
      status.hidden = false;
      const entries = [...new Set(area.value.split(/\r?\n/).map(v => v.trim()).filter(Boolean))];
      if (entries.length > 100 || entries.some(v => v.length > 200)) { status.textContent = t("maximum_100_entries_of_200_characters_each"); return; }
      profile.blacklist = entries;
      const currentRevision = ++revision;
      const parsed = YSCParser.parse(profile);
      for (const key of ["supplier", "article", "name", "price", "unit", "currency"]) {
        result[key] = parsed[key];
        const field = panel.querySelector(`#ysc-value-${key}`);
        if (field) field.value = result[key];
      }
      result.candidates = parsed.candidates; result.unitDefaulted = parsed.unitDefaulted; result.confirmed = {}; result.sheetConfirmed = false;
      refreshPreview(); status.hidden = false; status.textContent = t("saving");
      try {
        await YSCProfiles.saveBlacklist(profile, entries);
        if (revision === currentRevision) status.textContent = t("saved_for_this_site_text_is_removed_from_fields_automatically");
      } catch (error) { if (revision === currentRevision) status.textContent = t("save_error", { error: t(error.message) }); }
    };
    return folded("blacklist", t("blacklist_remove_unwanted_text"), [area, explanation("hint_blacklist"), status]);
  }
  function previewElement() {
    const preview = $("div", { className: "ysc-preview" });
    if (!profile.format.excel) {
      preview.textContent = YSCFormatter.format(outputFields(), profile.format) || t("fill_in_the_fields_below");
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
    const localPath = panel.querySelector("#ysc-local-image-path");
    if (localPath) localPath.textContent = localImagePath();
    const sheetStatus = panel.querySelector("#ysc-sheet-status");
    if (sheetStatus) sheetStatus.textContent = result.sheetConfirmed ? t("confirmed", { unit: YSCFormatter.sheetUnit(outputFields(), profile.format) }) : t("check_dimensions", { unit: YSCFormatter.sheetUnit(outputFields(), profile.format) });
    const steps = panel.querySelector(".ysc-excel-steps");
    if (steps) steps.replaceWith(excelSteps());
    const copyButton = panel.querySelector("#ysc-copy");
    if (copyButton) {
      try { copyButton.textContent = profile.format.excel ? t("copy_3", { target: YSCFormatter.excelBlocks(outputFields(), profile.format)[0].target }) : t("copy_2"); }
      catch (_) { copyButton.textContent = t("copy_2"); }
    }
  }
  function excelSteps() {
    const steps = $("div", { className: "ysc-excel-steps" });
    if (!profile.format.excel) return steps;
    try {
      const blocks = YSCFormatter.excelBlocks(outputFields(), profile.format);
      if (profile.format.excelVertical) steps.append($("p", { className: "ysc-excel-session-hint", hidden: helpMode === "pro", textContent: t("enter_mode_values_are_pasted_downwards_sessions_rows_select_the_star", { count: blocks.length, targets: blocks.map(block => block.target).join(" → ") }) }));
      else
      steps.append($("p", { className: "ysc-excel-session-hint", hidden: helpMode === "pro", textContent: blocks.length > 1
        ? t("copy_sessions_copy_each_block_in_order_and_paste_into_its_starting_c", { count: blocks.length, targets: blocks.map(block => block.target).join(" → ") })
        : t("one_copy_session_copy_once_and_paste_into_column_all_selected_fields", { target: blocks[0].target, column: YSCFormatter.columnName(blocks[0].start) }) }));
      blocks.forEach((block, index) => {
        const button = $("button", { className: "secondary", textContent: t("copy_4", { step: index + 1, target: block.target }) });
        button.onclick = () => copy(index); steps.append(button);
      });
    } catch (error) { steps.append($("p", { className: "ysc-error", textContent: t(error.message) })); }
    return steps;
  }
  function excelSettings() {
    const settings = $("section", { id: "ysc-excel-settings" });
    const separator = $("select", { id: "ysc-excel-separator" });
    const currentSeparator = ["space", "tab", "enter", "ascii"].includes(profile.format.excelSeparator) ? profile.format.excelSeparator : (profile.format.excelVertical ? "enter" : "tab");
    for (const [value, label] of [["space", "space_text_in_one_cell"], ["tab", "tab_text_in_one_row"], ["enter", "enter_text_in_one_column"], ["ascii", "custom_ascii_code"]]) separator.append($("option", { value, textContent: t(label), selected: currentSeparator === value }));
    separator.onchange = async () => {
      try { profile.format.excelSeparator = separator.value; profile.format.excelVertical = separator.value === "enter"; await persistStyle(); nextExcelBlock = 0; render(); }
      catch (error) { toast(t(error.message), true); }
    };
    settings.append($("label", { htmlFor: separator.id, textContent: t("separator") }), separator, explanation("hint_separator"));
    if (currentSeparator === "ascii") {
      const ascii = $("input", { id: "ysc-excel-ascii", type: "number", min: "1", max: "127", value: String(profile.format.excelAscii ?? 44) });
      ascii.onchange = async () => {
        const value = Number(ascii.value);
        if (!Number.isInteger(value) || value < 1 || value > 127) { toast(t("ascii_code_must_be_from_1_to_127"), true); ascii.value = String(profile.format.excelAscii ?? 44); return; }
        profile.format.excelAscii = value; try { await persistStyle(); nextExcelBlock = 0; render(); } catch (error) { toast(t(error.message), true); }
      };
      settings.append($("label", { htmlFor: ascii.id, textContent: t("ascii_code_1_127") }), ascii);
    }
    if (profile.format.excelVertical) settings.append(explanation("in_enter_mode_the_layout_defines_rows_1_26_instead_of_columns_a_z_pl"));
    const columns = YSCFormatter.excelColumns(profile.format);
    const labels = { skip: t("leave_unchanged"), fullName: t("full_description"), supplier: t("supplier"), article: t("article_sku"), name: t("product_name"), avcName: t("avc_name"), info: t("avc_info"), unit: t("unit_with_dimensions"), plainUnit: t("unit_only"), price: t("price"), pricePerUnit: t("price_per_square_or_running_metre"), currency: t("currency"), sheetLength: t("length_m"), sheetWidth: t("width_m"), sheetThickness: t("thickness_mm"), sheetSize: t("sheet_size_m"), usage: t("avc_usage"), kind: t("avc_kind"), weight: t("avc_weight"), package: t("avc_package"), url: t("current_page_url"), imageUrl: t(result.localImagePath ? "local_image_export_path" : "product_image_url"), imageFormula: t(result.localImagePath ? "local_image_export_formula" : "image_image_url"), join: t("join_with_a_space") };
    const strip = $("div", { className: "ysc-excel-row" });
    // Literal text belongs to the selected style, independently for each cell.
    labels.anyText = t("any_text");
    for (let index = 0; index < 26; index++) {
      const column = YSCFormatter.columnName(index + 1), key = columns[index];
      const literal = YSCFormatter.isLiteralColumn(key), selectedKey = literal ? "anyText" : key;
      const select = $("select", { id: `ysc-excel-column-${column}`, ariaLabel: t("column", { column }), title: labels[selectedKey] });
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
        const text = $("textarea", { id: `ysc-excel-text-${column}`, className: "ysc-cell-literal-input", value: key.text, placeholder: t("any_text"), ariaLabel: `${t("any_text")} · ${column}`, rows: 3 });
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
    settings.append(explanation("hint_excel_columns"));
    if (result.localImagePath && (columns.includes("imageFormula") || profile.format.excelImageFormula && columns.includes("imageUrl"))) settings.append(explanation("hint_local_image_formula"));
    if (!profile.format.excelVertical) settings.append(explanation("choose_a_field_or_leave_unchanged_for_each_column_fields_may_be_repe"), explanation("adjacent_columns_are_combined_into_one_copy_session_gaps_create_sepa"));
    settings.append(excelSteps());
    return settings;
  }
  function imageSettings() {
    const settings = $("section", { id: "ysc-image-settings", className: "ysc-image-settings" });
    const saved = Number(profile.format.imageBackgroundOpacity);
    const opacity = Number.isFinite(saved) ? Math.max(0, Math.min(100, Math.round(saved))) : 50;
    const label = $("label", { htmlFor: "ysc-image-opacity", textContent: t("opacity", { value: opacity }) });
    const slider = $("input", { id: "ysc-image-opacity", type: "range", min: "0", max: "100", value: String(opacity) });
    slider.oninput = () => { label.textContent = t("opacity", { value: slider.value }); };
    slider.onchange = async () => {
      const value = Math.max(0, Math.min(100, Number(slider.value) || 0));
      try {
        await chrome.storage.local.set({ ysc_image_background_opacity: value });
        profile.format.imageBackgroundOpacity = value; render();
      } catch (error) { slider.value = String(opacity); toast(t(error.message), true); }
    };
    settings.append($("div", { className: "ysc-compact-setting" }, [label, slider]), explanation("hint_opacity"));
    const rgb = hex => {
      const value = hex.slice(1);
      return `R ${parseInt(value.slice(0, 2), 16)} G ${parseInt(value.slice(2, 4), 16)} B ${parseInt(value.slice(4, 6), 16)}`;
    };
    const color = $("input", { id: "ysc-accent-color", type: "color", value: accentColor, ariaLabel: t("accent_color") });
    const colorButton = $("button", { id: "ysc-accent-color-button", type: "button", className: "ysc-accent-color-button", textContent: rgb(accentColor), title: accentColor });
    colorButton.onclick = () => color.showPicker?.();
    color.onchange = async () => {
      if (!/^#[0-9a-f]{6}$/i.test(color.value)) return;
      try { await chrome.storage.local.set({ ysc_accent_color: color.value }); accentColor = color.value; render(); }
      catch (error) { color.value = accentColor; toast(t(error.message), true); }
    };
    settings.append($("div", { className: "ysc-compact-setting" }, [$("label", { htmlFor: colorButton.id, textContent: t("accent_color") }), $("div", { className: "ysc-accent-picker" }, [colorButton, color]) ]));
    settings.append(explanation("hint_accent"));
    return settings;
  }
  function localImageSettings() {
    const folder = $("button", { id: "ysc-local-image-folder", type: "button", className: "secondary", textContent: t("local_image_configure") });
    folder.onclick = openLocalImageSettings;
    const path = $("div", { id: "ysc-local-image-path", textContent: localImagePath(), role: "textbox", tabIndex: 0, ariaReadOnly: "true", ariaMultiline: "true", ariaLabel: t("local_image_path") });
    const contents = [path];
    if ((localImageOptions.path || localImageFolderName) && !/^[a-z]:[\\/]|^[\\/]/i.test(localImageOptions.path)) contents.push(explanation("local_image_full_path_needed"));
    contents.push(explanation("local_image_folder_description"), explanation("hint_local_image"), folder);
    return folded("local-image-settings", t("local_image"), contents);
  }
  function excelValidationError() {
    const columns = YSCFormatter.excelColumns(profile.format);
    if (columns.every(key => key === "skip")) return t("select_at_least_one_field_to_copy_to_excel");
    const needs = key => columns.includes(key);
    if ((needs("article") || needs("fullName") && profile.format.article !== false) && !result.article) return t("article_not_found_configure_the_field");
    if ((needs("supplier") || needs("fullName") && profile.format.supplier !== false) && !result.supplier) return t("enter_the_supplier");
    if ((needs("unit") || needs("plainUnit")) && !result.unit) return t("fill_in_for_the_selected_column", { field: t("unit") });
    if (needs("price") && String(result.price || "").trim() && !YSCFormatter.priceNumber(result.price)) return t("enter_a_valid_price_for_the_selected_column");
    if ((needs("imageUrl") || needs("imageFormula")) && !result.localImagePath && !result.imageUrl) return t("image_url_was_not_found_configure_the_field");
    if (!profile.format.optionalDimensions) for (const [key, title] of [["sheetLength", "length_m"], ["sheetWidth", "width_m"], ["sheetThickness", "thickness_mm"], ["sheetSize", "sheet_size_m"]]) {
      if (needs(key) && !YSCFormatter.excelValue(key, result, profile.format)) return t("fill_in_for_the_selected_column", { field: t(title) });
    }
    return "";
  }
  function sheetConfirmationRequired() {
    if (!profile.format.sheet || profile.format.optionalDimensions) return false;
    const columns = YSCFormatter.excelColumns(profile.format);
    return ["unit", "sheetLength", "sheetWidth", "sheetSize"].some(key => columns.includes(key));
  }
  function updateSupplier(value) {
    result.supplier = value;
    profile.supplier = value;
    refreshPreview();
    YSCProfiles.saveSupplier(profile, value).catch(error => toast(t("could_not_save_supplier", { error: t(error.message) }), true));
  }
  function domainManager(backupControls = []) {
    const box = $("section", { className: "ysc-domain-manager" });
    const list = $("select", { id: "ysc-domain-list", size: 6, ariaLabel: t("all_profiled_domains") });
    const details = $("div", { id: "ysc-domain-profiles" });
    const adminProfiles = $("div", { id: "ysc-domain-admin" });
    const status = $("p", { textContent: t("loading") });
    const remove = $("button", { id: "ysc-delete-domain", className: "secondary", textContent: t("delete_domain_and_its_profiles"), disabled: true });
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
        const use = $("button", { textContent: t("open"), disabled: !destination, title: t("open_last_used_page_and_activate_profile") });
        use.onclick = async () => {
          if (!destination) return;
          try {
            await YSCProfiles.select(p.id);
            if (destination === location.href) await run(true);
            else location.assign(destination);
          } catch (error) { toast(t(error.message), true); }
        };
        const del = $("button", { className: "secondary", textContent: t("delete") });
        del.onclick = async () => {
          if (!confirm(t("delete_profile_for_domain", { name: p.supplier || p.domain, domain: p.domain }))) return;
          try { await YSCProfiles.remove(p.id); if (p.id === profile.id) await run(true); else await refresh(); }
          catch (error) { toast(t(error.message), true); }
        };
        const name = `${p.supplier || p.domain}${p.urlPattern ? ` · ${p.urlPattern}` : ""}`;
        row.append($("div", { className: "ysc-profile-open" }, [use, $("span", { textContent: name })]));
        row.append(explanation("hint_profile_open"));
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
        status.textContent = domains.length ? t("domains_the_number_in_parentheses_is_the_profile_count_including_dis", { count: domains.length }) : t("no_saved_profiles");
        status.hidden = Boolean(domains.length && helpMode === "pro");
        showSelected();
      } catch (error) { status.hidden = false; status.textContent = t("save_error", { error: error.message }); }
    }
    list.onchange = showSelected;
    remove.onclick = async () => {
      if (busy || !list.value) return;
      const domain = list.value, count = profiles.filter(p => p.domain === domain).length;
      if (!confirm(t("delete_all_profiles_for_domain_recovery_requires_a_previously_export", { domain, count }))) return;
      busy = true; remove.disabled = true;
      try {
        await YSCProfiles.removeDomain(domain);
        toast(t("deleted_profiles_for_domain", { domain }));
        if (domain === profile.domain) await run(true); else { busy = false; await refresh(); }
      } catch (error) { busy = false; remove.disabled = false; toast(t(error.message), true); }
    };
    box.append($("label", { htmlFor: list.id, textContent: t("all_profiled_domains") }), list, explanation("hint_profiles"), details,
      folded("profile-tools", t("management_and_backup"), [status, adminProfiles, remove, $("div", { className: "ysc-backup-controls" }, backupControls)]));
    refresh(); return box;
  }
  const avcFieldLabels = { usage: "avc_usage", kind: "avc_kind", info: "avc_info", weight: "avc_weight", package: "avc_package" };
  const avcUsageValues = YSCFormatter.usages;
  function avcControls() {
    const columns = YSCFormatter.excelColumns(profile.format);
    const used = Object.keys(avcFieldLabels).filter(key => columns.includes(key));
    if (!used.length) return null;
    // The remembered value belongs to the domain, so the next product on the same site reuses it.
    const persist = key => {
      const rule = profile.fields[key] || {};
      YSCProfiles.saveField(profile, key, { value: String(rule.value ?? ""), source: rule.source || "manual" })
        .catch(error => toast(t("save_error", { error: t(error.message) }), true));
    };
    const box = $("section", { id: "ysc-avc", className: "ysc-avc" });
    box.append($("h3", { textContent: t("avc_properties") }));
    for (const key of used) {
      if (key === "usage") {
        let rule = profile.fields.usage || {};
        // A half-set rule from an older version (an empty manual value) falls back to automatic instead of copying nothing.
        if (["manual", "fixed"].includes(rule.source) && !(avcUsageValues.includes(rule.value) || rule.value === "-")) { rule = { source: "auto", value: "" }; profile.fields.usage = rule; }
        const manual = ["manual", "fixed"].includes(rule.source), shownUnit = result.unitDefaulted ? "" : result.unit;
        const select = $("select", { id: "ysc-value-usage" });
        select.setAttribute("aria-label", t(avcFieldLabels.usage));
        // The receiver works out the type itself, so automatic detection is the first and default choice.
        select.append($("option", { value: "auto", textContent: t("usage_auto", { type: result.usageAuto }) }));
        for (const value of avcUsageValues) select.append($("option", { value, textContent: value }));
        select.append($("option", { value: "-", textContent: t("leave_unchanged") }));
        select.value = manual ? rule.value : "auto";
        select.onchange = () => {
          const automatic = select.value === "auto";
          // Automatic forgets the remembered value, so the unit of measure decides again for the next product too.
          profile.fields.usage = automatic ? { source: "auto", value: "" } : { source: "manual", value: select.value };
          result.usage = automatic ? result.usageAuto : select.value;
          refreshPreview(); persist("usage");
        };
        box.append($("div", {}, [$("label", { htmlFor: select.id, textContent: t(avcFieldLabels.usage) }), select]));
        // Names the single place the automatic type comes from, so a wrong value is easy to trace back to the unit.
        // It stays visible in every help mode, because it is status rather than an explanation.
        box.append($("p", { className: "ysc-usage-note", textContent: t("usage_hint", { unit: shownUnit || "—", type: result.usageAuto }) }));
        continue;
      }
      const [label, field] = input(avcFieldLabels[key], result[key], value => {
        result[key] = value;
        profile.fields[key] = { ...profile.fields[key], value };
        refreshPreview();
      });
      field.id = `ysc-value-${key}`; field.setAttribute("aria-label", t(avcFieldLabels[key]));
      label.htmlFor = field.id;
      field.addEventListener("change", () => persist(key));
      box.append($("div", {}, [label, field]));
    }
    box.append(explanation("hint_avc_properties"));
    return box;
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
      if (result.unitDefaulted || !result.unit && !result.confirmed?.unit) {
        result.unit = parsed.unit; result.unitDefaulted = parsed.unitDefaulted;
      }
      result.sheetConfirmed = false;
      nextExcelBlock = 0; render();
    };
    enabled.onchange = () => changeMode(enabled.checked, false);
    rod.onchange = () => changeMode(rod.checked, true);
    box.append($("label", {}, [enabled, document.createTextNode(t(" sheet_material_sheet_dimensions"))]));
    box.append($("label", {}, [rod, document.createTextNode(t(" bar_rod_length"))]));
    if (!profile.format.sheet) return box;
    for (const key of ["sheetLength", "sheetWidth", "sheetThickness"]) profile.fields[key] ||= { enabled: true, source: "auto", selector: "" };
    const units = $("select", { id: "ysc-sheet-input-unit" });
    for (const [value, title] of [["mm", "millimetres_mm"], ["m", "metres_m"]]) units.append($("option", { value, textContent: t(title), selected: value === (profile.format.sheetInputUnit || "mm") }));
    units.onchange = () => { profile.format.sheetInputUnit = units.value; result.sheetConfirmed = false; render(); };
    const unitsBox = $("div", {}, [$("label", { htmlFor: units.id, textContent: t("dimension_units") }), units]);
    const thicknessBox = $("div");
    const [thicknessLabel, thicknessField] = input(t("thickness_mm_2"), result.sheetThickness, value => { result.sheetThickness = value; refreshPreview(); });
    thicknessField.id = "ysc-value-sheetThickness"; thicknessLabel.htmlFor = thicknessField.id;
    thicknessField.setAttribute("list", "ysc-thickness-options");
    const thicknessOptions = $("datalist", { id: "ysc-thickness-options" });
    for (const value of result.candidates.sheetThickness || []) thicknessOptions.append($("option", { value }));
    thicknessBox.append(thicknessLabel, thicknessField, thicknessOptions);
    inlinePicker(thicknessField, "sheetThickness", t("pick_thickness_on_page"), () => {
      panel.style.display = "none";
      YSCPicker.start("sheetThickness", selected => {
        profile.fields.sheetThickness = { ...profile.fields.sheetThickness, enabled: true, source: "css", selector: selected.selector };
        const parsed = YSCParser.parse(profile);
        result.sheetThickness = parsed.sheetThickness || "";
        result.candidates.sheetThickness = parsed.candidates.sheetThickness || [];
        nextExcelBlock = 0; render();
      }, () => { if (panel?.isConnected) panel.style.display = "flex"; });
    });
    box.append($("div", { className: "ysc-sheet-meta" }, profile.format.sheetRod ? [unitsBox] : [unitsBox, thicknessBox]));
    const row = $("div", { className: "ysc-pricing" });
    const status = $("p", { id: "ysc-sheet-status" });
    const updateStatus = () => {
      const unit = YSCFormatter.sheetUnit(outputFields(), profile.format);
      status.textContent = result.sheetConfirmed ? t("confirmed", { unit }) : t("check_dimensions", { unit });
    };
    for (const [key, title, buttonTitle] of [["sheetLength", "sheet_length", "pick_length_on_page"], ["sheetWidth", "sheet_width", "pick_width_on_page"]]) {
      if (profile.format.sheetRod && key === "sheetWidth") continue;
      const column = $("div");
      const [label, field] = input(profile.format.sheetRod ? t("bar_rod_length_2") : title, result[key], value => { result[key] = value; result.sheetConfirmed = false; updateStatus(); refreshPreview(); });
      field.id = `ysc-value-${key}`;
      label.htmlFor = field.id;
      column.append(label, field);
      inlinePicker(field, key, buttonTitle, () => {
        panel.style.display = "none";
        YSCPicker.start(key, selected => {
          profile.fields[key] = { ...profile.fields[key], enabled: true, source: "css", selector: selected.selector };
          result[key] = YSCParser.parse(profile)[key] || "";
          result.sheetConfirmed = false; nextExcelBlock = 0; render();
        }, () => { if (panel?.isConnected) panel.style.display = "flex"; });
      });
      row.append(column);
    }
    const confirm = $("button", { id: "ysc-sheet-confirm", textContent: t("confirm_dimensions") });
    confirm.onclick = () => {
      if (!YSCFormatter.sheetSize(outputFields(), profile.format)) return toast(profile.format.sheetRod ? t("enter_a_valid_bar_rod_length") : t("enter_a_valid_sheet_length_and_width"), true);
      if (!result.unit) return toast(t("specify_the_material_unit_of_measure"), true);
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
    if (!value) return toast(t("fill_in_the_fields_below"), true);
    try {
      const reply = await chrome.runtime.sendMessage({ type: "YSC_COPY", text: value });
      if (reply?.ok) toast(t("copied_to_clipboard", { target: "", value }));
      else toast(t("copy_failed", { error: t(reply?.error || "error") }), true);
    } catch (error) { toast(t("copy_failed", { error: error.message }), true); }
  }
  async function copy(requestedBlock) {
    result = outputFields();
    if (sheetConfirmationRequired() && (!result.sheetConfirmed || !YSCFormatter.sheetSize(result, profile.format))) return toast(profile.format.sheetRod ? t("check_and_confirm_the_bar_rod_length_before_copying") : t("check_and_confirm_sheet_dimensions_before_copying"), true);
    let value;
    if (!result.productDetected || !result.name) return toast(t("product_name_not_found_configure_the_field"), true);
    if (profile.format.excel) {
      try { const error = excelValidationError(); if (error) return toast(error, true); }
      catch (error) { return toast(t(error.message), true); }
    } else if (!result.article) return toast(t("article_not_found_configure_the_field"), true);
    try {
      const blocks = profile.format.excel ? YSCFormatter.excelBlocks(outputFields(), profile.format) : [];
      const index = typeof requestedBlock === "number" ? requestedBlock : nextExcelBlock;
      const block = blocks[index] || blocks[0];
      value = block ? block.text : YSCFormatter.format(outputFields(), { ...profile.format, excel: false });
      const reply = await chrome.runtime.sendMessage({ type: "YSC_COPY", text: value });
      if (reply?.ok) {
        try { Object.assign(profile, await YSCProfiles.remember(profile, location.href)); }
        catch (error) { toast(t("could_not_remember_the_page", { error: error.message }), true); }
        if (blocks.length > 1 && index < blocks.length - 1) {
          nextExcelBlock = index + 1;
          render(); panel.querySelector("#ysc-settings").open = true;
          if (profile.format.excelVertical) toast(t("copied_rows_paste_starting_at_row_of_the_required_column_next_block", { target: block.target, value, row: block.start, next: blocks[index + 1].target }));
          else toast(t("copied_to_clipboard_paste_into_of_the_intended_row_then_copy_the_nex", { target: block.target, value, column: YSCFormatter.columnName(block.start), next: blocks[index + 1].target }));
        } else {
          panel?.remove(); nextExcelBlock = 0;
          toast(t("copied_to_clipboard", { target: block ? ` → ${block.target}` : "", value }));
        }
      } else toast(t("copy_failed", { error: t(reply?.error || "error") }), true);
    } catch (error) { toast(t("copy_failed", { error: t(error.message) }), true); }
  }
  function pickField(key) {
    panel.style.display = "none";
    YSCPicker.start(key, selected => {
      profile.fields[key] = { ...profile.fields[key], enabled: true, source: "css", selector: selected.selector };
      // A picker changes only the selected field, preserving all manual corrections.
      const parsed = YSCParser.parse(profile);
      result[key] = key === "price" ? YSCFormatter.priceNumber(YSCParser.removeBlocked(selected.price || selected.text || parsed.price, profile.blacklist)) : parsed[key] || "";
      if (key === "price" && !result.confirmed?.currency) {
        const currency = selected.currency || YSCFormatter.currencyCode(selected.text || selected.price);
        if (currency) result.currency = currency;
      }
      result.candidates[key] = parsed.candidates[key] || [];
      result.confirmed = { ...result.confirmed, [key]: true };
      if (key === "unit") { result.sheetConfirmed = false; result.unitDefaulted = parsed.unitDefaulted; }
      nextExcelBlock = 0; render();
      if (!result[key]) panel.querySelector(`#ysc-value-${key}`)?.focus?.();
    }, () => { if (panel?.isConnected) panel.style.display = "flex"; });
  }
  function pickImage() {
    panel.style.display = "none";
    YSCPicker.start("imageUrl", selected => {
      const value = YSCParser.imageUrl(selected.imageUrl);
      if (!value) { panel.style.display = "flex"; toast(t("select_the_product_image_itself"), true); return; }
      const rule = profile.fields.imageUrl ||= { enabled: true, source: "auto", selector: "", regex: "", attribute: "", value: "" };
      rule.enabled = true; rule.source = "attribute"; rule.selector = selected.imageSelector; rule.attribute = selected.imageAttribute;
      rerun();
    }, () => { if (panel?.isConnected) panel.style.display = "flex"; });
  }
  async function openLocalImageSettings() {
    try {
      const reply = await chrome.runtime.sendMessage({ type: "YSC_LOCAL_IMAGE_SETTINGS" });
      if (!reply?.ok) throw new Error(reply?.error || "could_not_save_the_file");
    } catch (error) { toast(t("local_image_failed", { error: t(error.message) }), true); }
  }
  async function pickLocalImage() {
    if (localImageBusy) return;
    localImageBusy = true;
    try {
      const supplier = YSCParser.removeBlocked(result.supplier, profile.blacklist);
      const ready = await chrome.runtime.sendMessage({ type: "YSC_LOCAL_IMAGE_READY", supplier });
      if (!ready?.ok) throw new Error(ready?.error || "choose_local_image_folder_first");
      const name = quickText();
      if (!name) throw new Error("fill_in_the_fields_below");
      panel.style.display = "none";
      YSCPicker.startRegion(t("select_local_image_region"), async selected => {
        try {
          const reply = await chrome.runtime.sendMessage({ type: "YSC_CAPTURE_LOCAL_IMAGE", ...selected, name, supplier });
          if (!reply?.ok) throw new Error(reply?.error || "could_not_save_the_file");
          result.localImagePreview = reply.preview;
          result.localImageFilename = reply.filename;
          result.localImagePath = reply.path || reply.filename;
          render(); toast(t("local_image_saved", { filename: result.localImagePath }));
        } catch (error) { toast(t("local_image_failed", { error: t(error.message) }), true); }
        finally { localImageBusy = false; if (panel?.isConnected) panel.style.display = "flex"; }
      }, () => { localImageBusy = false; if (panel?.isConnected) panel.style.display = "flex"; });
    } catch (error) {
      localImageBusy = false; if (panel?.isConnected) panel.style.display = "flex";
      toast(t("local_image_failed", { error: t(error.message) }), true);
    }
  }
  function fieldEditor(key, title) {
    const rule = profile.fields[key] ||= { enabled: true, source: "auto", selector: "", regex: "", attribute: "", value: "" }, section = $("section", { className: "ysc-rule" });
    section.append($("h3", { textContent: t(title) }));
    const enabled = $("input", { type: "checkbox", checked: rule.enabled });
    enabled.onchange = () => { rule.enabled = enabled.checked; rerun(); };
    section.append($("label", { className: "ysc-check" }, [enabled, document.createTextNode(t(" use_field"))]));
    const source = $("select");
    const sources = { auto: t("automatic"), jsonld: t("product_metadata_json_ld"), css: t("page_element_css"), attribute: t("element_attribute"), regex: t("regular_expression"), url: t("url_parameter"), manual: t("fixed_value") };
    Object.entries(sources).forEach(([value, label]) => source.append($("option", { value, textContent: t(label), selected: rule.source === value })));
    source.onchange = () => { rule.source = source.value; rerun(); };
    section.append($("label", { textContent: t("value_source") }), source);
    const sourceHints = { auto: "hint_source_auto", jsonld: "hint_source_jsonld", css: "hint_source_css", attribute: "hint_source_attribute", regex: "hint_source_regex", url: "hint_source_url", manual: "hint_source_manual", fixed: "hint_source_manual" };
    if (sourceHints[rule.source]) section.append(explanation(sourceHints[rule.source]));
    const add = (label, property) => section.append(...input(label, rule[property], v => { rule[property] = v; rerun(); }, "text", "change"));
    if (["css", "attribute"].includes(rule.source)) add(t("css_selector"), "selector");
    if (rule.source === "attribute") add(t("attribute_name"), "attribute");
    if (rule.source === "regex") add(t("regular_expression_group_1"), "regex");
    if (["manual", "fixed"].includes(rule.source)) add(t("fixed_value_for_all_products"), "value");
    if (rule.source === "url") add(t("url_parameter_name"), "value");
    return section;
  }
  function render() {
    const opened = new Set([...(panel?.querySelectorAll("details[open]") || [])].map(el => el.id));
    if (!panel?.isConnected) {
      for (const section of panel?.querySelector("#ysc-settings")?.querySelectorAll("details") || []) opened.delete(section.id);
      for (const id of settingsSections) opened.add(id);
    }
    if (panel?.querySelector("#ysc-style-settings")) styleSettingsVisible = !panel.querySelector("#ysc-style-settings").hidden;
    const scrollTop = panel?.querySelector(".ysc-body")?.scrollTop || 0;
    const columnScroll = panel?.querySelector(".ysc-excel-row")?.scrollLeft || 0;
    panel?.remove(); panel = $("aside", { id:"ysc-panel", lang: YSCI18n.language });
    const heading = $("h2", { className: "ysc-heading" }, [
      $("img", { src: chrome.runtime.getURL("icons/icon-32.png"), alt: "", width: 24, height: 24 }),
      $("span", { textContent: "Y Supplier Clipboard" })
    ]);
    const quickCopy = $("button", { id: "ysc-quick-copy", textContent: "⧉", title: t("copy_result"), ariaLabel: t("copy_result") });
    quickCopy.onclick = copyQuick;
    panel.append(heading, $("div", { className: "ysc-quick-result" }, [$("div", { id: "ysc-quick-preview", textContent: quickText() }), quickCopy]));
    const imageStage = $("div", { className: "ysc-product-image-stage" });
    const [currentSupplierLabel, currentSupplier] = input(t("supplier"), result.supplier, updateSupplier); const [currentArticleLabel, currentArticle] = input(t("article_sku"), result.article, v => { result.article = v; refreshPreview(); }); const [currentNameLabel, currentName] = input(t("product_name"), result.name, v => { result.name = v; refreshPreview(); }); imageStage.append(currentSupplierLabel, currentSupplier, currentArticleLabel, currentArticle, currentNameLabel, currentName);
    inlinePicker(currentArticle, "article", t("pick_article_on_page"));
    inlinePicker(currentName, "name", t("pick_name_on_page"));
    const imageChoices = result.candidates.imageUrl || [];
    {
      const imageIndex = imageChoices.indexOf(result.imageUrl);
      const chooseImage = offset => { const start = imageIndex < 0 ? (offset > 0 ? -1 : 0) : imageIndex; result.imageUrl = imageChoices[(start + offset + imageChoices.length) % imageChoices.length]; delete result.localImagePreview; delete result.localImageFilename; delete result.localImagePath; render(); };
      const imageSwitch = $("div", { className: "ysc-image-switch" });
      const previous = $("span", { id: "ysc-image-previous", className: "ysc-image-nav", textContent: "<", role: "button", tabIndex: 0, ariaLabel: t("previous_image"), title: t("previous_image") });
      const next = $("span", { id: "ysc-image-next", className: "ysc-image-nav", textContent: ">", role: "button", tabIndex: 0, ariaLabel: t("next_image"), title: t("next_image") });
      const picker = $("span", { id: "ysc-pick-image", className: "ysc-image-pick", role: "button", tabIndex: 0, title: t("pick_the_product_image_on_the_page"), ariaLabel: t("pick_the_product_image_on_the_page") }, [$("span", { className: "ysc-cursor-icon" })]);
      const localPicker = $("span", { id: "ysc-pick-local-image", className: "ysc-image-pick ysc-local-image-pick", role: "button", tabIndex: 0, title: t("pick_local_image_region"), ariaLabel: t("pick_local_image_region") }, [$("span", { className: "ysc-capture-square", ariaHidden: "true" }), $("span", { className: "ysc-cursor-icon", ariaHidden: "true" })]);
      const activate = (element, action) => { element.onclick = action; element.onkeydown = event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); action(); } }; };
      activate(previous, () => chooseImage(-1)); activate(next, () => chooseImage(1)); activate(picker, pickImage);
      activate(localPicker, pickLocalImage);
      if (imageChoices.length) imageSwitch.append(previous);
      imageSwitch.append($("span", { id: "ysc-image-choice", textContent: result.localImageFilename ? t("screenshot") : result.imageUrl ? t("image_of", { current: imageIndex + 1, total: imageChoices.length }) : t("image_could_not_be_detected") }));
      if (imageChoices.length) imageSwitch.append(next);
      imageSwitch.append(picker, localPicker);
      imageStage.append(imageSwitch);
      if (result.localImageFilename) imageStage.append($("p", { className: "ysc-help-note", textContent: t("local_image_saved", { filename: result.localImagePath || result.localImageFilename }) }));
    }
    panel.append(imageStage);
    const pricing = $("div", { className: "ysc-pricing ysc-price-row" });
    const priceBox = $("div"), unitBox = $("div");
    priceBox.append(...input(t("price"), result.price, v => {
      result.price = v; result.confirmed = { ...result.confirmed, price: true };
      const currency = YSCFormatter.currencyCode(v);
      if (currency && !result.confirmed.currency) { result.currency = currency; panel.querySelector("#ysc-value-currency").value = currency; }
      refreshPreview();
    }));
    unitBox.append(...input(t("unit"), result.unit, v => { result.unit = v; result.unitDefaulted = false; result.sheetConfirmed = false; result.confirmed = { ...result.confirmed, unit: true }; refreshPreview(); }));
    unitBox.querySelector("label").title = t("unit_pcs_m_m");
    inlinePicker(priceBox.querySelector("input"), "price", t("pick_price_on_page"));
    inlinePicker(unitBox.querySelector("input"), "unit", t("pick_unit"));
    currentSupplier.id = "ysc-value-supplier"; currentArticle.id = "ysc-value-article"; currentName.id = "ysc-value-name";
    priceBox.querySelector("input").id = "ysc-value-price"; unitBox.querySelector("input").id = "ysc-value-unit";
    const currencyBox = $("div");
    currencyBox.append(...input(t("currency"), result.currency, v => { result.currency = YSCFormatter.currencyCode(v) || v.trim().toUpperCase(); result.confirmed = { ...result.confirmed, currency: true }; refreshPreview(); }));
    currencyBox.querySelector("input").id = "ysc-value-currency";
    pricing.append(priceBox, unitBox, currencyBox); panel.append(pricing);
    for (const [key, title] of [["price", t("price")], ["unit", t("unit")], ["currency", t("currency")]]) {
      if (result.candidates[key]?.length > 1) {
        const choices = $("select", { id: `ysc-choice-${key}` }); choices.append($("option", { textContent: t("choose_the_correct_value"), value: "", disabled: true, selected: !result.candidates[key].includes(result[key]) })); result.candidates[key].forEach(v => choices.append($("option", { textContent: v, value: v, selected: v === result[key] })));
        choices.onchange = () => { result[key] = choices.value; if (key === "unit") { result.sheetConfirmed = false; result.unitDefaulted = false; } result.confirmed = { ...result.confirmed, [key]: true }; (key === "price" ? priceBox : key === "currency" ? currencyBox : unitBox).querySelector("input").value = choices.value; refreshPreview(); };
        panel.append($("label", { textContent: t("multiple_values_please_check", { title: t(title) }) }), choices);
      }
    }
    panel.append(sheetControls());
    const avcBox = avcControls(); if (avcBox) panel.append(avcBox);
    panel.append($("hr", { className: "ysc-data-divider" }));
    panel.append(workStyleControls(), previewElement());
    const imageSettingsBox = imageSettings();
    panel.append(styleSettings());
    if (result.candidates.article.length > 1) { const choices = $("select"); result.candidates.article.forEach(v => choices.append($("option", { textContent:v, value:v }))); choices.onchange = () => { result.article = choices.value; currentArticle.value = choices.value; refreshPreview(); }; panel.append($("label", { textContent:t("multiple_articles_choose_the_correct_one") }), choices); }
    // The type of the position has its own automatic control in the palette section, so it needs no rule here.
    const rulesBox = folded("rules", t("advanced_extraction_rules"), [fieldEditor("article", t("article_sku")), fieldEditor("name", t("product_name")), fieldEditor("price", t("price")), fieldEditor("currency", t("currency")), fieldEditor("unit", t("unit_of_measure")), fieldEditor("imageUrl", t("product_image_url")), ...Object.keys(avcFieldLabels).filter(key => key !== "usage").map(key => fieldEditor(key, t(avcFieldLabels[key])))]);
    panel.append(rulesBox);
    if (profile.format.sheet) {
      panel.querySelector("#ysc-rules").append(fieldEditor("sheetLength", profile.format.sheetRod ? t("bar_rod_length_2") : t("sheet_length")));
      if (!profile.format.sheetRod) panel.querySelector("#ysc-rules").append(fieldEditor("sheetWidth", t("sheet_width")), fieldEditor("sheetThickness", t("thickness_mm_2")));
    }
    panel.append(blacklistSettings());
    const opts = [["replaceComma",t("replace_commas")],["normalizeSpaces",t("normalize_spaces")],["stripControls",t("remove_control_characters")],["uppercaseSupplier",t("uppercase_supplier")],["decimalDot",t("decimal_point_in_numbers")],["dimensionUnits",t("units_on_dimensions")],["dimensionInMillimetres",t("dimensions_in_millimetres")],["optionalDimensions",t("allow_empty_dimensions")],["supplier",t("include_supplier")],["article",t("include_article")],["name",t("include_product_name")]]; const formatBox = $("section"); formatBox.append($("label", { textContent:t("formatting") })); opts.forEach(([key,label]) => { const cb = $("input", { type:"checkbox", checked: profile.format[key] ?? YSCFormatter.defaults[key] }); cb.onchange = async () => { profile.format[key] = cb.checked; try { await persistStyle(); refreshPreview(); } catch (error) { toast(t(error.message), true); } }; formatBox.append($("label", {}, [cb, document.createTextNode(` ${t(label)}`)])); });
    const nextTarget = profile.format.excel ? (() => { try { return YSCFormatter.excelBlocks(outputFields(), profile.format)[nextExcelBlock]?.target; } catch (_) { return ""; } })() : "";
    const copyButton = $("button", { id: "ysc-copy", textContent:nextTarget ? t("copy_3", { target: nextTarget }) : t("copy_2") }); copyButton.onclick = copy; const save = $("button", { textContent:t("save_profile"), className:"secondary" }); save.onclick = async () => {
      try {
        profile.lastUrl = YSCProfiles.pageUrl(location.href, profile.domain);
        await YSCProfiles.save(profile);
        panel?.remove();
        toast(t("profile_saved_locally"));
      } catch (error) { toast(t("could_not_save_profile", { error: t(error.message) }), true); }
    };
    const exportButton = $("button", { textContent:t("export_json"), className:"secondary" }); exportButton.onclick = async () => { const blob = new Blob([JSON.stringify(await YSCProfiles.all(), null, 2)], { type:"application/json" }); const a = $("a", { href:URL.createObjectURL(blob), download:"y-supplier-profiles.json" }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    const importer = $("input", { type:"file", accept:"application/json", style:"display:none" }); importer.onchange = async () => { try { const incoming = YSCProfiles.validate(JSON.parse(await importer.files[0].text())); await chrome.storage.local.set({ ysc_profiles: incoming }); toast(t("profiles_imported")); } catch (e) { toast(t("invalid_file", { error: t(e.message) }), true); } }; const importButton = $("button", { textContent:t("import_json"), className:"secondary" }); importButton.onclick = () => importer.click();
    formatBox.querySelector("label")?.remove();
    rulesBox.remove();
    const formatRules = folded("format-rules", t("formatting_and_extraction_rules"), [formatBox, explanation("hint_formatting"), explanation("hint_extraction"), ...[...rulesBox.children].slice(1)]);
    panel.append(formatRules);
    const profilesBox = folded("profiles", t("profiles_and_backup"), [domainManager([exportButton, importButton, importer])]);
    panel.append(profilesBox);
    const globals = folded("global-settings", t("global_settings"), [helpModeSelector(), languageSelector(), explanation("hint_language"), imageSettingsBox]);
    const settings = folded("settings", t("settings"), [globals, localImageSettings(), profilesBox, panel.querySelector("#ysc-blacklist"), formatRules]);
    const helpLink = (label, path) => $("a", { textContent: t(label), href: path, target: "_blank", rel: "noopener noreferrer" });
    const updateStatus = $("p", { id: "ysc-update-status", className: "ysc-help-note" });
    const checkUpdate = $("button", { id: "ysc-check-update", className: "secondary", textContent: t("check_for_updates") });
    checkUpdate.onclick = async () => {
      checkUpdate.disabled = true; updateStatus.textContent = t("checking_for_updates");
      const update = await showUpdateBanner(true);
      updateStatus.textContent = update
        ? t("update_available", { version: update.version })
        : t("up_to_date", { version: chrome.runtime.getManifest().version });
      checkUpdate.disabled = false;
    };
    settings.append(folded("help", t("help"), [
      $("p", { id: "ysc-help-name", textContent: "Y Supplier Clipboard" }),
      $("p", { id: "ysc-help-description", hidden: helpMode === "pro", textContent: t("supplier_clipboard_means_a_clipboard_for_supplier_data_the_extension") }),
      $("p", { id: "ysc-code-version", textContent: t("code_version", { version: chrome.runtime.getManifest().version }) }),
      $("p", { id: "ysc-revision-date", textContent: t("revision_date", { date: "18.10.2026" }) }),
      checkUpdate,
      updateStatus,
      $("p", {}, [helpLink("readme_md_instructions", chrome.runtime.getURL("ui/help.html?doc=readme"))]),
      $("p", {}, [helpLink("mit_license", chrome.runtime.getURL("ui/help.html?doc=license"))]),
      $("p", {}, [helpLink("telegram_support_yurms", "https://web.telegram.org/a/#-1001323392064_1018")])
    ]));
    panel.append(settings);
    const close = $("button", { textContent:t("close"), className:"secondary" }); close.onclick = () => { YSCPicker.stop(); localImageBusy = false; panel.remove(); };
    const body = $("div", { className: "ysc-body" });
    const opacity = Number(profile.format.imageBackgroundOpacity);
    const imageOpacity = Number.isFinite(opacity) ? Math.max(0, Math.min(100, Math.round(opacity))) : 50;
    if (imageStage.style.setProperty) imageStage.style.setProperty("--ysc-image-overlay-opacity", `${imageOpacity}%`);
    else imageStage.style["--ysc-image-overlay-opacity"] = `${imageOpacity}%`;
    if (result.localImagePreview || result.imageUrl) {
      const image = `url("${result.localImagePreview || result.imageUrl}")`;
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
    const restoredParents = new Set(), accordionGroups = new Map();
    panel.querySelectorAll("details").forEach(el => {
      if (!accordionGroups.has(el.parentElement)) accordionGroups.set(el.parentElement, `ysc-accordion-${accordionGroups.size}`);
      el.name = accordionGroups.get(el.parentElement);
      el.open = opened.has(el.id) && !restoredParents.has(el.parentElement);
      if (el.open) restoredParents.add(el.parentElement);
    });
    document.documentElement.append(panel); body.scrollTop = scrollTop;
    panel.querySelector(".ysc-excel-row").scrollLeft = columnScroll;
    showUpdateBanner();
  }
  async function run(forcePanel = false) {
    await YSCI18n.load();
    await styleWrites;
    await settingsWrites;
    styleSettingsVisible = false;
    if (panel?.querySelector("#ysc-style-settings")) panel.querySelector("#ysc-style-settings").hidden = true;
    const savedProfile = await YSCProfiles.get();
    profile = savedProfile || YSCProfiles.base(location.hostname);
    try { if (savedProfile) Object.assign(profile, await YSCProfiles.remember(profile, location.href)); }
    catch (error) { toast(t("could_not_remember_the_page", { error: error.message }), true); }
    const preferences = await chrome.storage.local.get(["ysc_work_styles", "ysc_work_style", "ysc_excel_mode", "ysc_excel_layout", "ysc_excel_columns", "ysc_excel_vertical", "ysc_excel_image_formula", "ysc_image_background_opacity", "ysc_accent_color", "ysc_language", "ysc_local_image_settings", "ysc_local_image_folder_name", "ysc_settings_sections", "ysc_help_mode"]);
    helpMode = preferences.ysc_help_mode === "pro" ? "pro" : "novice";
    const rememberedSections = ["ysc-global-settings", "ysc-local-image-settings", "ysc-profiles", "ysc-blacklist", "ysc-format-rules", "ysc-help"];
    settingsSections = Array.isArray(preferences.ysc_settings_sections) ? preferences.ysc_settings_sections.filter(id => rememberedSections.includes(id)).slice(0, 1) : [];
    applyLocalImagePreferences(preferences);
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
        YSCPicker.stop(); localImageBusy = false;
        panel.style.display = "flex";
        // Copy the current edited result without reloading the saved profile.
        await copy();
      } else await run(true);
    } catch (error) { toast(t("could_not_open_settings", { error: t(error.message) }), true); }
    finally { toggling = false; }
  }
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === "YSC_LOCAL_IMAGE_CHANGED") {
      chrome.storage.local.get(["ysc_local_image_settings", "ysc_local_image_folder_name"]).then(preferences => {
        applyLocalImagePreferences(preferences); if (panel?.isConnected) render(); reply?.({ ok: true });
      }).catch(error => reply?.({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "YSC_RUN") run(); if (message.type === "YSC_CONFIGURE") togglePanel(); if (message.type === "YSC_NOTICE") toast(t(message.text), true);
  });
})();
