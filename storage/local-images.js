globalThis.YSCLocalImages = (() => {
  function directory(value) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("ysc-local-images", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("settings");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, transaction = db.transaction("settings", value ? "readwrite" : "readonly");
        const operation = value ? transaction.objectStore("settings").put(value, "directory") : transaction.objectStore("settings").get("directory");
        transaction.oncomplete = () => { db.close(); resolve(value || operation.result); };
        transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error || operation.error); };
      };
    });
  }
  function filename(value) {
    let name = String(value || "").normalize("NFC").replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
    // Stay below common filesystem component limits, including four-byte Unicode.
    name = Array.from(name).slice(0, 100).join("");
    while (new TextEncoder().encode(name).length > 220) name = Array.from(name).slice(0, -1).join("");
    name = name.replace(/[. ]+$/, "") || "product";
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
    return `${name}.jpg`;
  }
  function cleanPath(value) {
    return String(value || "").trim().replace(/^"(.*)"$/, "$1").replace(/[\\/]+$/, "");
  }
  function settings(value = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
    const mode = ["original", "contain", "cover"].includes(value.mode) ? value.mode : "original";
    const width = Number(value.width ?? 1000), height = Number(value.height ?? 1000);
    if (mode !== "original" && (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 32000000)) throw new Error("local_image_invalid_size");
    const subfolder = String(value.subfolder || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    if (subfolder && (subfolder.startsWith("/") || subfolder.split("/").length > 20 || subfolder.split("/").some(part => !part || part === "." || part === ".." || /[<>:"|?*\u0000-\u001f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))) throw new Error("local_image_invalid_subfolder");
    const path = cleanPath(value.path), confirmedPath = cleanPath(value.confirmedPath);
    if (/[\u0000-\u001f]/.test(path) || path.length > 2000) throw new Error("local_image_invalid_path");
    return { path, confirmedPath, subfolder, mode, width: Number.isInteger(width) && width > 0 ? width : 1000, height: Number.isInteger(height) && height > 0 ? height : 1000, background: /^#[0-9a-f]{6}$/i.test(value.background || "") ? value.background : "#ffffff" };
  }
  function subfolders(options, supplier) {
    if (options.subfolder.includes("{supplier}") && !String(supplier || "").trim()) throw new Error("local_image_supplier_required");
    const safeSupplier = filename(supplier).slice(0, -4);
    return options.subfolder ? options.subfolder.split("/").map(part => {
      const value = part.replaceAll("{supplier}", safeSupplier);
      return filename(value).slice(0, -4);
    }) : [];
  }
  function displayPath(options, folderName, supplier, file = "") {
    const root = options.path || folderName || "";
    const separator = root.includes("\\") || /^[a-z]:/i.test(root) ? "\\" : "/";
    const nested = subfolders(options, supplier);
    return [root, ...nested, file].filter(Boolean).join(separator);
  }
  function layout(width, height, options) {
    if (options.mode === "original") return { width, height, x: 0, y: 0, drawWidth: width, drawHeight: height };
    const scale = options.mode === "cover" ? Math.max(options.width / width, options.height / height) : Math.min(options.width / width, options.height / height);
    const drawWidth = width * scale, drawHeight = height * scale;
    return { width: options.width, height: options.height, x: (options.width - drawWidth) / 2, y: (options.height - drawHeight) / 2, drawWidth, drawHeight };
  }
  function cropRect(rect, viewport, width, height) {
    const values = [rect?.x, rect?.y, rect?.width, rect?.height, viewport?.width, viewport?.height, width, height];
    if (!values.every(Number.isFinite) || rect.x < 0 || rect.y < 0 || rect.width < 2 || rect.height < 2 || viewport.width <= 0 || viewport.height <= 0 || width <= 0 || height <= 0 || rect.x + rect.width > viewport.width + 1 || rect.y + rect.height > viewport.height + 1) throw new Error("invalid_capture_region");
    const scaleX = width / viewport.width, scaleY = height / viewport.height;
    const x = Math.max(0, Math.round(rect.x * scaleX)), y = Math.max(0, Math.round(rect.y * scaleY));
    return { x, y, width: Math.min(width - x, Math.round(rect.width * scaleX)), height: Math.min(height - y, Math.round(rect.height * scaleY)) };
  }
  async function writableDirectory(options = settings()) {
    if (options.path !== options.confirmedPath) throw new Error("local_image_confirm_path");
    const handle = await directory();
    if (!handle || await handle.queryPermission({ mode: "readwrite" }) !== "granted") throw new Error("choose_local_image_folder_first");
    return handle;
  }
  async function save(blob, name, handle, options = settings(), supplier = "") {
    const nested = subfolders(options, supplier);
    for (const part of nested) handle = await handle.getDirectoryHandle(part, { create: true });
    const base = filename(name).slice(0, -4);
    // Preserve an earlier screenshot rather than silently overwriting it.
    let target;
    for (let index = 0; index < 10000; index++) {
      target = `${base}${index ? ` (${index})` : ""}.jpg`;
      try { await handle.getFileHandle(target); }
      catch (error) { if (error.name === "NotFoundError") break; throw error; }
      if (index === 9999) throw new Error("could_not_save_the_file");
    }
    const file = await handle.getFileHandle(target, { create: true });
    const stream = await file.createWritable();
    try { await stream.write(blob); await stream.close(); }
    catch (error) { await stream.abort().catch(() => {}); throw error; }
    return [...nested, target].join("/");
  }
  return { directory, filename, settings, subfolders, displayPath, layout, cropRect, writableDirectory, save };
})();
