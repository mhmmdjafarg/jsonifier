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
const btnBeautify    = document.getElementById("btn-beautify");
const btnMinify      = document.getElementById("btn-minify");
const btnCopy        = document.getElementById("btn-copy");

// Indentation used by the Beautify action.
const BEAUTIFY_INDENT = 2;
// How long the Copy button shows its "Copied!" affordance, in ms.
const COPY_FEEDBACK_MS = 1200;

// Debounce delay in ms — avoids re-rendering on every keystroke
const DEBOUNCE_MS = 250;
let debounceTimer = null;

const STORAGE_KEY = "jsonifier_input";

// Most recent parse error location, used by the "jump to error" affordance.
let lastErrorPosition = -1;

// ─── Input handler ───────────────────────────────────────────────────────────

jsonInput.addEventListener("input", () => {
  updateLineNumbers();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    persistInput(jsonInput.value);
    process();
  }, DEBOUNCE_MS);
});

// Also handle paste directly for immediate feedback
jsonInput.addEventListener("paste", () => {
  clearTimeout(debounceTimer);
  setTimeout(() => {
    updateLineNumbers();
    persistInput(jsonInput.value);
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
restoreInput();

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
  chrome.storage.local.remove(STORAGE_KEY);
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
  persistInput(jsonInput.value);
  process();
});

// Escape: wrap the current input as a JSON-encoded string.
//   {"a":1}   →   "{\"a\":1}"
btnEscape.addEventListener("click", () => {
  if (!jsonInput.value) return;
  jsonInput.value = escapeOneLayer(jsonInput.value);
  updateLineNumbers();
  persistInput(jsonInput.value);
  process();
});

// Beautify: pretty-print the input with 2-space indentation.
//   {"a":1,"b":[2,3]}   →   {\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}
//
// Uses plain JSON.parse — NOT parseJSON() — so we don't silently unwrap an
// escaped string. Users who want unwrapping can hit Unescape first.
btnBeautify.addEventListener("click", () => {
  reformatInput((value) => JSON.stringify(value, null, BEAUTIFY_INDENT));
});

// Minify: strip all insignificant whitespace.
//   {\n  "a": 1\n}   →   {"a":1}
btnMinify.addEventListener("click", () => {
  reformatInput((value) => JSON.stringify(value));
});

// Copy: send the current input to the system clipboard.
btnCopy.addEventListener("click", () => {
  copyInputToClipboard();
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

// ─── Text transforms (beautify / minify / copy) ──────────────────────────────

/**
 * Parse the current input, hand the parsed value to `stringifyFn`, and write
 * the result back to the textarea. On parse failure we surface the existing
 * error banner via process() so the user gets the line/column they need to
 * fix things up.
 */
function reformatInput(stringifyFn) {
  const text = jsonInput.value;
  if (!text.trim()) return;

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Let the regular pipeline produce the (now nicer) error banner.
    process();
    return;
  }

  jsonInput.value = stringifyFn(parsed);
  updateLineNumbers();
  persistInput(jsonInput.value);
  jsonInput.scrollTop = 0;
  process();
}

/**
 * Copy the textarea content to the clipboard. Uses the async Clipboard API
 * when available, falling back to a legacy execCommand path for older
 * browsers (or contexts where the new API is blocked).
 */
function copyInputToClipboard() {
  const text = jsonInput.value;
  if (!text) return;

  const done = (ok) => flashButton(btnCopy, ok ? "Copied!" : "Copy failed", ok ? "copied" : null);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => done(true),
      () => done(legacyCopy(text)),
    );
  } else {
    done(legacyCopy(text));
  }
}

/** execCommand-based fallback. Returns true on success. */
function legacyCopy(text) {
  const ghost = document.createElement("textarea");
  ghost.value = text;
  ghost.setAttribute("readonly", "");
  ghost.style.position = "fixed";
  ghost.style.opacity = "0";
  ghost.style.pointerEvents = "none";
  document.body.appendChild(ghost);
  ghost.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ghost.remove();
  return ok;
}

/**
 * Temporarily swap a button's label (and optionally toggle a class) to give
 * the user immediate feedback for an action that produced no visible change
 * elsewhere in the UI — e.g. "Copied!" after Copy.
 */
function flashButton(button, transientLabel, transientClass) {
  if (button._flashTimer) {
    clearTimeout(button._flashTimer);
    if (button._flashOriginalLabel != null) {
      button.textContent = button._flashOriginalLabel;
    }
    if (button._flashAddedClass) {
      button.classList.remove(button._flashAddedClass);
    }
  }

  button._flashOriginalLabel = button.textContent;
  button._flashAddedClass = transientClass || null;

  button.textContent = transientLabel;
  if (transientClass) button.classList.add(transientClass);

  button._flashTimer = setTimeout(() => {
    button.textContent = button._flashOriginalLabel;
    if (button._flashAddedClass) {
      button.classList.remove(button._flashAddedClass);
    }
    button._flashTimer = null;
    button._flashOriginalLabel = null;
    button._flashAddedClass = null;
  }, COPY_FEEDBACK_MS);
}

// ─── Storage helpers ─────────────────────────────────────────────────────────

function persistInput(value) {
  chrome.storage.local.set({ [STORAGE_KEY]: value });
}

function restoreInput() {
  chrome.storage.local.get(STORAGE_KEY, (result) => {
    const saved = result[STORAGE_KEY];
    if (saved) {
      jsonInput.value = saved;
      updateLineNumbers();
      process();
    }
  });
}
