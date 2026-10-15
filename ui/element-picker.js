globalThis.YSCPicker = (() => {
  let active = false, target, onPick, onCancel, regionCleanup;
  const outline = document.createElement("div"); outline.className = "ysc-picker-outline";
  function selectorFor(el) {
    const unique = selector => { const matches = document.querySelectorAll(selector); return matches.length === 1 && matches[0] === el; };
    function segment(node) {
      if (node.id) return `#${CSS.escape(node.id)}`;
      for (const a of ["data-testid", "itemprop", "name"]) if (node.hasAttribute(a)) return `${node.tagName.toLowerCase()}[${a}="${CSS.escape(node.getAttribute(a))}"]`;
      const stable = [...node.classList].find(c => !/[0-9]{4,}|__[a-z0-9]{6,}/i.test(c));
      return node.tagName.toLowerCase() + (stable ? `.${CSS.escape(stable)}` : "");
    }
    let selector = segment(el);
    if (unique(selector)) return selector;
    // Disambiguate relative to an ancestor before using a structural fallback.
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const scoped = `${segment(parent)} ${selector}`;
      if (unique(scoped)) return scoped;
    }
    selector = "";
    for (let node = el; node; node = node.parentElement) {
      const siblings = node.parentElement ? [...node.parentElement.children].filter(n => n.tagName === node.tagName) : [node];
      const part = `${segment(node)}:nth-of-type(${siblings.indexOf(node) + 1})`;
      selector = selector ? `${part} > ${selector}` : part;
      if (unique(selector)) return selector;
    }
    return selector;
  }
  function move(e) { if (!active || e.target.closest("#ysc-panel")) return; const r = e.target.getBoundingClientRect(); Object.assign(outline.style, { display: "block", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` }); }
  function imageData(el) {
    const image = el?.matches?.("img") ? el : el?.querySelector?.("img") || el?.closest?.("img");
    if (!image) return {};
    const attribute = ["src", "data-src", "data-lazy-src", "data-original"].find(name => image.getAttribute(name));
    return { imageSelector: selectorFor(image), imageAttribute: attribute || "src", imageUrl: image.currentSrc || image.getAttribute(attribute || "src") || "" };
  }
  function click(e) { if (!active || e.target.closest("#ysc-panel")) return; e.preventDefault(); e.stopImmediatePropagation(); const selected = { selector: selectorFor(e.target), text: YSCParser.text(e.target), ...(target === "price" ? { price: YSCParser.priceText(e.target), currency: YSCParser.priceCurrency(e.target) } : {}), ...imageData(e.target) }; stop(); onPick?.(selected); }
  function keydown(e) { if (!active || e.key !== "Escape") return; e.preventDefault(); e.stopImmediatePropagation(); const callback = onCancel; stop(); callback?.(); }
  function start(field, callback, cancelCallback) { stop(); active = true; target = field; onPick = callback; onCancel = cancelCallback; document.documentElement.append(outline); document.addEventListener("mousemove", move, true); document.addEventListener("click", click, true); document.addEventListener("keydown", keydown, true); }
  function startRegion(instructions, callback, cancelCallback) {
    stop();
    const overlay = document.createElement("div"), box = document.createElement("div"), hint = document.createElement("div");
    overlay.id = "ysc-region-picker";
    overlay.style.cssText = "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;display:block!important;cursor:crosshair!important;touch-action:none!important;user-select:none!important;";
    box.style.cssText = "all:initial!important;position:absolute!important;display:none!important;box-sizing:border-box!important;border:2px solid #ef7900!important;background:#ef790022!important;pointer-events:none!important;";
    hint.style.cssText = "all:initial!important;position:absolute!important;top:12px!important;left:12px!important;max-width:calc(100% - 48px)!important;padding:10px 14px!important;background:#172033!important;color:white!important;border-radius:6px!important;font:14px/1.4 system-ui,sans-serif!important;pointer-events:none!important;";
    hint.textContent = instructions;
    overlay.append(box, hint); document.documentElement.append(overlay);
    let origin, selection;
    const point = event => ({ x: Math.max(0, Math.min(innerWidth, event.clientX)), y: Math.max(0, Math.min(innerHeight, event.clientY)) });
    const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    const update = event => {
      const end = point(event);
      selection = { x: Math.min(origin.x, end.x), y: Math.min(origin.y, end.y), width: Math.abs(end.x - origin.x), height: Math.abs(end.y - origin.y) };
      for (const [key, value] of Object.entries({ display: "block", left: `${selection.x}px`, top: `${selection.y}px`, width: `${selection.width}px`, height: `${selection.height}px` })) box.style.setProperty(key, value, "important");
    };
    overlay.onpointerdown = event => { consume(event); if (event.button !== 0) return; origin = point(event); overlay.setPointerCapture?.(event.pointerId); update(event); };
    overlay.onpointermove = event => { consume(event); if (origin) update(event); };
    overlay.onpointerup = event => {
      consume(event); if (!origin || event.button !== 0) return;
      update(event);
      if (selection.width < 2 || selection.height < 2) { origin = null; return; }
      const rect = selection, viewport = { width: innerWidth, height: innerHeight };
      stop();
      // Wait for the selection overlay to leave the rendered frame before capture.
      requestAnimationFrame(() => requestAnimationFrame(() => callback({ rect, viewport })));
    };
    const cancel = () => { stop(); cancelCallback?.(); };
    const keys = event => { consume(event); if (event.key === "Escape") cancel(); };
    overlay.onpointercancel = cancel;
    overlay.oncontextmenu = consume;
    document.addEventListener("click", consume, true);
    document.addEventListener("keydown", keys, true);
    document.addEventListener("wheel", consume, { capture: true, passive: false });
    window.addEventListener("resize", cancel);
    regionCleanup = () => {
      overlay.remove(); document.removeEventListener("keydown", keys, true);
      document.removeEventListener("wheel", consume, true); window.removeEventListener("resize", cancel);
      // Suppress the click following pointerup, which may otherwise reach a product link.
      setTimeout(() => document.removeEventListener("click", consume, true), 0);
    };
  }
  function stop() { active = false; regionCleanup?.(); regionCleanup = null; outline.remove(); document.removeEventListener("mousemove", move, true); document.removeEventListener("click", click, true); document.removeEventListener("keydown", keydown, true); }
  return { start, startRegion, stop };
})();
