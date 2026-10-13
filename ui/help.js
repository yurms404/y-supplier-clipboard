(async () => {
  const name = new URL(location.href).searchParams.get("doc") === "license" ? "LICENSE" : "README.md";
  document.title = `Y Supplier Clipboard — ${name}`;
  document.querySelector("#document-title").textContent = name;
  const output = document.querySelector("#document-content");
  try {
    const response = await fetch(chrome.runtime.getURL(name));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    output.textContent = await response.text();
  } catch (error) { output.textContent = `Could not load ${name}: ${error.message}`; }
})();
