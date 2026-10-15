(async () => {
  await YSCI18n.load();
  const preferences = await chrome.storage.local.get(["ysc_language", "ysc_local_image_settings", "ysc_help_mode"]);
  YSCI18n.setLanguage(preferences.ysc_language);
  document.documentElement.lang = YSCI18n.language;
  const t = YSCI18n.t, get = id => document.getElementById(id);
  document.title = `Y Supplier Clipboard — ${t("local_image")}`;
  const labels = { title: "local_image", description: "local_image_folder_description", choose: "choose_local_image_folder", authorize: "authorize_local_image_folder", "path-label": "local_image_path", "path-note": "local_image_path_note", "subfolder-label": "local_image_subfolder", "subfolder-note": "local_image_subfolder_note", "add-supplier": "local_image_add_supplier", "mode-label": "local_image_size", "mode-original": "local_image_size_original", "mode-contain": "local_image_size_contain", "mode-cover": "local_image_size_cover", "width-label": "local_image_width", "height-label": "local_image_height", "background-label": "local_image_background", "size-note": "local_image_size_note", "save-return": "local_image_save_return" };
  for (const [id, key] of Object.entries(labels)) get(id).textContent = t(key);
  get("beginner-help").textContent = t("hint_local_image");
  function applyHelpMode(value) {
    for (const id of ["description", "beginner-help", "path-note", "subfolder-note", "size-note"]) get(id).hidden = value === "pro";
  }
  applyHelpMode(preferences.ysc_help_mode);
  chrome.storage.onChanged?.addListener((changes, area) => { if (area === "local" && changes.ysc_help_mode) applyHelpMode(changes.ysc_help_mode.newValue); });
  let options = YSCLocalImages.settings(preferences.ysc_local_image_settings), savedHandle;
  for (const key of ["path", "subfolder", "mode", "width", "height", "background"]) get(key).value = options[key];
  const report = error => { get("status").textContent = t("local_image_failed", { error: t(error.message) }); };
  function read() {
    return YSCLocalImages.settings({ ...options, ...Object.fromEntries(["path", "subfolder", "mode", "width", "height", "background"].map(key => [key, get(key).value])) });
  }
  function updatePreview() {
    get("width").disabled = get("height").disabled = get("mode").value === "original";
    get("background").disabled = get("mode").value !== "contain";
    try {
      const current = read();
      const path = YSCLocalImages.displayPath(current, savedHandle?.name, "{supplier}", t("local_image_filename_example"));
      get("preview").textContent = t("local_image_path_preview", { path });
    } catch (error) { get("preview").textContent = t(error.message); }
  }
  async function refreshFolder() {
    savedHandle = await YSCLocalImages.directory();
    get("folder").textContent = savedHandle ? t("local_image_folder_selected", { folder: savedHandle.name }) : t("choose_local_image_folder_first");
    get("authorize").hidden = !savedHandle || await savedHandle.queryPermission({ mode: "readwrite" }) === "granted";
    updatePreview();
  }
  async function persist() {
    const current = read();
    await chrome.storage.local.set({ ysc_local_image_settings: current });
    options = current;
    get("status").textContent = current.path !== current.confirmedPath ? t("local_image_confirm_path") : t("local_image_options_saved");
    updatePreview();
  }
  for (const key of ["path", "subfolder", "mode", "width", "height", "background"]) {
    get(key).oninput = updatePreview;
    get(key).onchange = () => persist().catch(report);
  }
  get("add-supplier").onclick = async () => {
    if (!get("subfolder").value.includes("{supplier}")) get("subfolder").value = [get("subfolder").value.replace(/[\\/]+$/, ""), "{supplier}"].filter(Boolean).join("/");
    await persist().catch(report);
  };
  get("choose").onclick = async () => {
    try {
      const current = read();
      const handle = await window.showDirectoryPicker({ id: "ysc-local-images", mode: "readwrite", ...(savedHandle ? { startIn: savedHandle } : {}) });
      // The browser exposes the directory name, not its absolute path.
      // Bind a pasted path only after the user explicitly confirms that folder.
      const pendingPath = current.path && current.path !== current.confirmedPath;
      if (pendingPath && current.path.split(/[\\/]/).at(-1).toLocaleLowerCase() !== handle.name.toLocaleLowerCase()) throw new Error("local_image_folder_mismatch");
      const path = pendingPath ? current.path : savedHandle?.name === handle.name && current.path ? current.path : handle.name;
      await YSCLocalImages.directory(handle);
      options = { ...current, path, confirmedPath: path }; get("path").value = path;
      await chrome.storage.local.set({ ysc_local_image_settings: options, ysc_local_image_folder_name: handle.name });
      await refreshFolder(); get("status").textContent = t("local_image_folder_ready");
    } catch (error) { if (error.name !== "AbortError") report(error); }
  };
  get("authorize").onclick = async () => {
    try {
      if (await savedHandle.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("choose_local_image_folder_first");
      await refreshFolder(); get("status").textContent = t("local_image_folder_ready");
    } catch (error) { report(error); }
  };
  get("save-return").onclick = async () => {
    get("save-return").disabled = true;
    try {
      await persist(); await YSCLocalImages.writableDirectory(options);
      const tabId = Number(new URLSearchParams(location.search).get("returnTab"));
      const reply = await chrome.runtime.sendMessage({ type: "YSC_LOCAL_IMAGE_RETURN", tabId });
      if (!reply?.ok) throw new Error(reply?.error || "local_image_return_unavailable");
    } catch (error) { report(error); }
    finally { get("save-return").disabled = false; }
  };
  if (!window.showDirectoryPicker) { get("choose").disabled = true; get("status").textContent = t("local_image_folder_not_supported"); }
  await refreshFolder();
  if (savedHandle && !options.path) {
    options = { ...options, path: savedHandle.name, confirmedPath: savedHandle.name };
    get("path").value = options.path; await persist();
  }
})().catch(error => { document.getElementById("status").textContent = error.message; });
