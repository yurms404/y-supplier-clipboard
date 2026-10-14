globalThis.YSCPicker = (() => {
  let active = false, target, onPick;
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
  function start(field, callback) { active = true; target = field; onPick = callback; document.documentElement.append(outline); document.addEventListener("mousemove", move, true); document.addEventListener("click", click, true); }
  function stop() { active = false; outline.remove(); document.removeEventListener("mousemove", move, true); document.removeEventListener("click", click, true); }
  return { start, stop };
})();
