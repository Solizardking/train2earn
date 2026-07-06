const state = {
  data: null,
  query: "",
  root: "all",
  kind: "all",
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bytes(value = 0) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function number(value = 0) {
  return Number(value || 0).toLocaleString();
}

function matchesQuery(file) {
  const haystack = [
    file.path,
    file.rootLabel,
    file.kind,
    file.summary,
    file.title,
    ...(file.sampleKeys || []),
    ...(file.yamlKeys || []),
    ...(file.jsonKeys || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(state.query.toLowerCase());
}

function filteredFiles() {
  return state.data.files.filter((file) => {
    const rootOk = state.root === "all" || file.rootId === state.root;
    const kindOk = state.kind === "all" || file.kind === state.kind;
    return rootOk && kindOk && matchesQuery(file);
  });
}

function metric(label, value) {
  return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function tags(items, tone = "") {
  return `<div class="tag-row">${items
    .filter(Boolean)
    .map((item) => `<span class="tag ${tone}">${escapeHtml(item)}</span>`)
    .join("")}</div>`;
}

function renderMetrics() {
  const { totals } = state.data;
  $("#metrics").innerHTML = [
    metric("Roots", number(totals.roots)),
    metric("Included files", number(totals.files)),
    metric("Included size", bytes(totals.bytes)),
    metric("JSONL rows", number(totals.jsonlRows)),
    metric("Docs", number(totals.docs)),
    metric("Skipped cache", bytes(totals.skippedBytes)),
  ].join("");
}

function renderControls() {
  $("#rootFilter").innerHTML = `<option value="all">All roots</option>${state.data.roots
    .map((root) => `<option value="${escapeHtml(root.id)}">${escapeHtml(root.label)}</option>`)
    .join("")}`;

  const kinds = [...new Set(state.data.files.map((file) => file.kind))].sort();
  $("#kindFilter").innerHTML = `<option value="all">All kinds</option>${kinds
    .map((kind) => `<option value="${escapeHtml(kind)}">${escapeHtml(kind)}</option>`)
    .join("")}`;
}

function renderRail() {
  $("#rootCount").textContent = number(state.data.roots.length);
  $("#rootRail").innerHTML = state.data.roots
    .map(
      (root) => `
        <button class="root-button ${state.root === root.id ? "active" : ""}" data-root="${escapeHtml(root.id)}" type="button">
          <strong>${escapeHtml(root.label)}</strong>
          <small>${escapeHtml(root.path)} · ${number(root.files)} files · ${bytes(root.bytes)}</small>
        </button>`
    )
    .join("");

  $("#policyBox").innerHTML = `
    <strong>Export policy</strong>
    <p>${escapeHtml(state.data.policy.note)}</p>
  `;

  document.querySelectorAll("[data-root]").forEach((button) => {
    button.addEventListener("click", () => {
      state.root = button.dataset.root;
      $("#rootFilter").value = state.root;
      renderAll();
    });
  });
}

function renderDatasets(files) {
  const visiblePaths = new Set(files.map((file) => file.path));
  const datasets = state.data.datasets.filter((file) => visiblePaths.has(file.path));
  $("#datasetCount").textContent = number(datasets.length);
  $("#datasetGrid").innerHTML =
    datasets
      .slice(0, 24)
      .map((file) => {
        const labels = [
          file.kind,
          file.rows ? `${number(file.rows)} rows` : "",
          file.lines && !file.rows ? `${number(file.lines)} lines` : "",
          bytes(file.bytes),
        ];
        return `
          <article class="dataset-card">
            <div>
              <span class="path-label">${escapeHtml(file.path)}</span>
              <h3>${escapeHtml(file.title || file.name)}</h3>
            </div>
            ${tags(labels, file.kind === "jsonl" ? "green" : "cyan")}
            <p class="summary">${escapeHtml(file.summary || file.excerpt || "")}</p>
          </article>
        `;
      })
      .join("") || `<p class="empty">No matching dataset entries.</p>`;
}

function renderRoots() {
  $("#includedBytes").textContent = bytes(state.data.totals.bytes);
  const roots = state.root === "all" ? state.data.roots : state.data.roots.filter((root) => root.id === state.root);
  $("#rootGrid").innerHTML = roots
    .map((root) => {
      const skippedBytes = (root.skipped || []).reduce((sum, item) => sum + item.bytes, 0);
      const extTags = Object.entries(root.extensions || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([ext, count]) => `${ext}: ${count}`);
      return `
        <article class="root-card">
          <div>
            <span class="path-label">${escapeHtml(root.path)}</span>
            <h3>${escapeHtml(root.label)}</h3>
          </div>
          ${tags([`${number(root.files)} files`, `${number(root.dirs)} dirs`, bytes(root.bytes), skippedBytes ? `${bytes(skippedBytes)} skipped` : ""], "gold")}
          ${tags(extTags, "violet")}
        </article>
      `;
    })
    .join("");
}

function renderDocs(files) {
  const visiblePaths = new Set(files.map((file) => file.path));
  const docs = state.data.docs.filter((file) => visiblePaths.has(file.path));
  $("#docCount").textContent = number(docs.length);
  $("#docList").innerHTML =
    docs
      .slice(0, 18)
      .map(
        (file) => `
          <article class="doc-item">
            <div>
              <span class="path-label">${escapeHtml(file.path)}</span>
              <h3>${escapeHtml(file.title || file.name)}</h3>
            </div>
            ${tags([`${number(file.lines)} lines`, bytes(file.bytes)], "cyan")}
            <p class="summary">${escapeHtml(file.excerpt || "")}</p>
          </article>
        `
      )
      .join("") || `<p class="empty">No matching docs.</p>`;
}

function renderFileTable(files) {
  $("#fileCount").textContent = number(files.length);
  $("#fileTable").innerHTML =
    files
      .map(
        (file) => `
          <tr>
            <td>${escapeHtml(file.path)}</td>
            <td>${escapeHtml(file.rootLabel)}</td>
            <td><span class="file-kind">${escapeHtml(file.kind)}</span></td>
            <td>${file.rows ? number(file.rows) : file.lines ? number(file.lines) : "-"}</td>
            <td>${bytes(file.bytes)}</td>
          </tr>
        `
      )
      .join("") || `<tr><td colspan="5">No matching files.</td></tr>`;
}

function previewPayload(file) {
  if (file.samples) return JSON.stringify(file.samples, null, 2);
  if (file.jsonPreview) return JSON.stringify(file.jsonPreview, null, 2);
  return file.preview || file.excerpt || "";
}

function renderPreviews(files) {
  const previews = files.filter((file) => previewPayload(file));
  $("#previewCount").textContent = number(previews.length);
  $("#previewList").innerHTML =
    previews
      .slice(0, 30)
      .map(
        (file) => `
          <article class="preview-item">
            <div>
              <span class="path-label">${escapeHtml(file.path)}</span>
              <h3>${escapeHtml(file.title || file.name)}</h3>
            </div>
            ${tags([file.kind, file.rows ? `${number(file.rows)} rows` : "", bytes(file.bytes)], "green")}
            <pre>${escapeHtml(previewPayload(file))}</pre>
          </article>
        `
      )
      .join("") || `<p class="empty">No matching previews.</p>`;
}

function renderAll() {
  const files = filteredFiles();
  renderRail();
  renderDatasets(files);
  renderRoots();
  renderDocs(files);
  renderFileTable(files);
  renderPreviews(files);
}

async function init() {
  const response = await fetch("./site-data.json");
  state.data = await response.json();
  $("#workspacePath").textContent = `${state.data.workspace} · generated ${new Date(state.data.generatedAt).toLocaleString()}`;
  renderControls();
  renderMetrics();
  renderAll();

  $("#searchInput").addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    renderAll();
  });
  $("#rootFilter").addEventListener("change", (event) => {
    state.root = event.target.value;
    renderAll();
  });
  $("#kindFilter").addEventListener("change", (event) => {
    state.kind = event.target.value;
    renderAll();
  });
}

init().catch((error) => {
  document.body.innerHTML = `<main class="data-section"><h1>Static data failed to load</h1><pre>${escapeHtml(error.stack || error.message)}</pre></main>`;
});
