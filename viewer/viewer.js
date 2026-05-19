/**
 * viewer.js — orchestrates the JSON input → parse → render pipeline.
 *
 * Dependencies (loaded before this script in viewer.html):
 *   parser.js  → parseJSON(text)
 *   tree.js    → renderTree(value)
 */

const jsonInput    = document.getElementById("json-input");
const errorBanner  = document.getElementById("error-banner");
const errorMessage = document.getElementById("error-message");
const errorLocation = document.getElementById("error-location");
const treeOutput   = document.getElementById("tree-output");
const placeholder  = document.getElementById("tree-placeholder");
const btnClear     = document.getElementById("btn-clear");
const btnCollapseAll = document.getElementById("btn-collapse-all");
const btnExpandAll   = document.getElementById("btn-expand-all");

// Debounce delay in ms — avoids re-rendering on every keystroke
const DEBOUNCE_MS = 250;
let debounceTimer = null;

// ─── Input handler ───────────────────────────────────────────────────────────

jsonInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(process, DEBOUNCE_MS);
});

// Also handle paste directly for immediate feedback
jsonInput.addEventListener("paste", () => {
  clearTimeout(debounceTimer);
  // Let the paste event finish first, then process
  setTimeout(process, 0);
});

// ─── Core pipeline ───────────────────────────────────────────────────────────

function process() {
  const text = jsonInput.value;

  if (!text.trim()) {
    clearOutput();
    return;
  }

  const result = parseJSON(text);

  if (result.ok) {
    showTree(result.value);
    hideError();
  } else {
    showError(result);
    clearTree();
  }
}

// ─── Output helpers ──────────────────────────────────────────────────────────

function showTree(value) {
  placeholder.style.display = "none";
  treeOutput.innerHTML = "";

  const fragment = renderTree(value);
  treeOutput.appendChild(fragment);
}

function clearTree() {
  treeOutput.innerHTML = "";
  placeholder.style.display = "";
}

function showError(result) {
  errorMessage.textContent = result.message;

  if (result.line > 0) {
    errorLocation.textContent = `Line ${result.line}, Column ${result.col}`;
  } else {
    errorLocation.textContent = "";
  }

  errorBanner.classList.add("visible");
}

function hideError() {
  errorBanner.classList.remove("visible");
  errorMessage.textContent = "";
  errorLocation.textContent = "";
}

function clearOutput() {
  clearTree();
  hideError();
}

// ─── Toolbar actions ─────────────────────────────────────────────────────────

btnClear.addEventListener("click", () => {
  jsonInput.value = "";
  clearOutput();
  jsonInput.focus();
});

btnCollapseAll.addEventListener("click", () => {
  setAllNodes(true);
});

btnExpandAll.addEventListener("click", () => {
  setAllNodes(false);
});

/**
 * Programmatically collapse or expand every collapsible node by clicking its toggle.
 * We read the current state from the toggle text to avoid double-toggling.
 * @param {boolean} collapse - true = collapse all, false = expand all
 */
function setAllNodes(collapse) {
  const toggles = treeOutput.querySelectorAll(".toggle");
  toggles.forEach((toggle) => {
    const isCurrentlyCollapsed = toggle.textContent === "▶";
    if (collapse && !isCurrentlyCollapsed) {
      toggle.click();
    } else if (!collapse && isCurrentlyCollapsed) {
      toggle.click();
    }
  });
}
