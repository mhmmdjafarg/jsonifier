/**
 * viewer.js — orchestrates the JSON input → parse → render pipeline.
 *
 * Dependencies (loaded before this script in viewer.html):
 *   parser.js  → parseJSON(text)
 *   tree.js    → renderTree(value)
 */

const jsonInput      = document.getElementById("json-input");
const lineNumbers    = document.getElementById("line-numbers");
const errorBanner    = document.getElementById("error-banner");
const errorMessage   = document.getElementById("error-message");
const errorLocation  = document.getElementById("error-location");
const treeOutput     = document.getElementById("tree-output");
const placeholder    = document.getElementById("tree-placeholder");
const unwrapBadge    = document.getElementById("unwrap-indicator");
const btnClear       = document.getElementById("btn-clear");
const btnCollapseAll = document.getElementById("btn-collapse-all");
const btnExpandAll   = document.getElementById("btn-expand-all");
const btnUnescape    = document.getElementById("btn-unescape");
const btnEscape      = document.getElementById("btn-escape");

// Debounce delay in ms — avoids re-rendering on every keystroke
const DEBOUNCE_MS = 250;
let debounceTimer = null;

// Most recent parse error location, used by the "jump to error" affordance.
let lastErrorPosition = -1;

// ─── Input handler ───────────────────────────────────────────────────────────

jsonInput.addEventListener("input", () => {
  updateLineNumbers();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(process, DEBOUNCE_MS);
});

// Also handle paste directly for immediate feedback
jsonInput.addEventListener("paste", () => {
  clearTimeout(debounceTimer);
  // Let the paste event finish first, then process
  setTimeout(() => {
    updateLineNumbers();
    process();
  }, 0);
});

// Keep the gutter scrolled to match the textarea.
jsonInput.addEventListener("scroll", () => {
  lineNumbers.scrollTop = jsonInput.scrollTop;
});

// Click the "Line N, Column M" hint to jump straight to the offending character.
errorLocation.addEventListener("click", () => {
  if (lastErrorPosition < 0) return;
  jumpToPosition(lastErrorPosition);
});

updateLineNumbers();

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
    showUnwrapBadge(result.unwrapDepth || 0);
    hideError();
  } else {
    showError(result);
    clearTree();
    showUnwrapBadge(0);
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
    errorLocation.textContent = `Line ${result.line}, Column ${result.col} — click to jump`;
    errorLocation.hidden = false;
    lastErrorPosition = Number.isFinite(result.position) ? result.position : -1;
  } else {
    errorLocation.textContent = "";
    errorLocation.hidden = true;
    lastErrorPosition = -1;
  }

  errorBanner.classList.add("visible");
}

function hideError() {
  errorBanner.classList.remove("visible");
  errorMessage.textContent = "";
  errorLocation.textContent = "";
  errorLocation.hidden = true;
  lastErrorPosition = -1;
}

function showUnwrapBadge(depth) {
  if (depth > 0) {
    unwrapBadge.textContent =
      depth === 1
        ? "Unwrapped from escaped string"
        : `Unwrapped ${depth} layers from escaped string`;
    unwrapBadge.classList.remove("hidden");
  } else {
    unwrapBadge.classList.add("hidden");
    unwrapBadge.textContent = "";
  }
}

function clearOutput() {
  clearTree();
  hideError();
  showUnwrapBadge(0);
}

// ─── Toolbar actions ─────────────────────────────────────────────────────────

btnClear.addEventListener("click", () => {
  jsonInput.value = "";
  updateLineNumbers();
  clearOutput();
  jsonInput.focus();
});

btnCollapseAll.addEventListener("click", () => {
  setAllNodes(true);
});

btnExpandAll.addEventListener("click", () => {
  setAllNodes(false);
});

// Unescape: peel one layer of JSON-string wrapping off the input.
//   "{\"a\":1}"   →   {"a":1}
btnUnescape.addEventListener("click", () => {
  const result = unescapeOneLayer(jsonInput.value);
  if (!result.ok) {
    showError({ message: result.message, line: 0, col: 0 });
    return;
  }
  jsonInput.value = result.value;
  updateLineNumbers();
  process();
});

// Escape: wrap the current input as a JSON-encoded string.
//   {"a":1}   →   "{\"a\":1}"
btnEscape.addEventListener("click", () => {
  if (!jsonInput.value) return;
  jsonInput.value = escapeOneLayer(jsonInput.value);
  updateLineNumbers();
  process();
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

// ─── Editor gutter ───────────────────────────────────────────────────────────

/**
 * Repaint the line-number gutter to match the textarea's logical line count.
 * Logical lines are split by "\n" — this is what the parser reports in errors,
 * which is why the textarea uses `white-space: pre` (one logical line = one
 * visual row).
 */
function updateLineNumbers() {
  const text = jsonInput.value;
  // A textarea with N newline chars has N+1 logical lines (the last one may be empty).
  const lineCount = text.length === 0 ? 1 : countLines(text);

  // Build "1\n2\n...\nN" — cheaper than touching the DOM per line.
  let buffer = "";
  for (let i = 1; i <= lineCount; i++) {
    buffer += i + (i < lineCount ? "\n" : "");
  }
  lineNumbers.textContent = buffer;

  // Resize the gutter so wide line numbers (e.g. 4+ digits) don't get clipped.
  const digits = String(lineCount).length;
  lineNumbers.style.minWidth = Math.max(36, digits * 9 + 16) + "px";

  // Stay in sync with the textarea's current scroll position.
  lineNumbers.scrollTop = jsonInput.scrollTop;
}

function countLines(text) {
  let n = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) n++;
  }
  return n;
}

/**
 * Focus the textarea, place the cursor at `position`, select the offending
 * character (when present), and scroll the textarea so it's visible.
 */
function jumpToPosition(position) {
  const len = jsonInput.value.length;
  const start = Math.max(0, Math.min(position, len));
  const end = Math.min(start + 1, len);

  jsonInput.focus();
  jsonInput.setSelectionRange(start, end);

  // Approximate scroll-into-view: move to roughly the right line.
  // line-height: 1.5 * 12px font ≈ 18px per row; subtract a couple of lines
  // of context above so the cursor isn't pinned to the top edge.
  const lineHeight = 18;
  const linesBefore = countNewlines(jsonInput.value, start);
  const targetTop = Math.max(0, (linesBefore - 2) * lineHeight);
  jsonInput.scrollTop = targetTop;
  lineNumbers.scrollTop = targetTop;
}

function countNewlines(text, upto) {
  let n = 0;
  const max = Math.min(upto, text.length);
  for (let i = 0; i < max; i++) {
    if (text.charCodeAt(i) === 10) n++;
  }
  return n;
}
