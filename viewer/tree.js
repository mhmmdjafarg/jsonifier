/**
 * Recursive JSON tree renderer.
 *
 * Public API:
 *   renderTree(value) → DocumentFragment
 *
 * Each object / array node gets a ▶/▼ toggle that collapses its children.
 * Primitives are rendered inline with type-based colour classes.
 */

const MAX_INLINE_PREVIEW = 5; // max items shown in collapsed preview

/**
 * Build and return a DocumentFragment containing the full tree.
 * @param {*} value - Already-parsed JSON value (any type).
 * @returns {DocumentFragment}
 */
function renderTree(value) {
  const frag = document.createDocumentFragment();
  frag.appendChild(renderNode(null, value, 0, true));
  return frag;
}

/**
 * Render a single node (key + value pair, or bare value at root).
 * @param {string|number|null} key   - Property name / array index, or null at root.
 * @param {*}                  value - The value to render.
 * @param {number}             depth - Nesting depth (used for indentation).
 * @param {boolean}            isLast - Whether this is the last item (for trailing comma).
 * @returns {HTMLElement}
 */
function renderNode(key, value, depth, isLast) {
  const type = getType(value);

  // Auto-unwrap nested string-JSON.
  // If the value is a string that looks like an object/array
  // (e.g. `"{\"a\":1}"` inside a log field), parse it and render
  // the inner structure as a sub-tree with an "unwrapped" badge so
  // the reader can see this value was actually a string in the source.
  if (type === "string" && looksLikeEmbeddedJSON(value)) {
    const inner = tryParseJSON(value);
    if (inner.ok && isContainer(inner.value)) {
      const innerType = Array.isArray(inner.value) ? "array" : "object";
      return renderCollapsible(key, inner.value, innerType, depth, isLast, true);
    }
  }

  if (type === "object" || type === "array") {
    return renderCollapsible(key, value, type, depth, isLast, false);
  }

  return renderPrimitive(key, value, type, isLast);
}

/** Cheap pre-check: does this string look like a JSON object or array literal? */
function looksLikeEmbeddedJSON(str) {
  if (typeof str !== "string") return false;
  const trimmed = str.trim();
  if (trimmed.length < 2) return false;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  return (first === "{" && last === "}") || (first === "[" && last === "]");
}

function tryParseJSON(str) {
  try {
    return { ok: true, value: JSON.parse(str) };
  } catch {
    return { ok: false };
  }
}

function isContainer(value) {
  return value !== null && (Array.isArray(value) || typeof value === "object");
}

// ---------------------------------------------------------------------------
// Collapsible containers (objects and arrays)
// ---------------------------------------------------------------------------

function renderCollapsible(key, value, type, depth, isLast, embedded = false) {
  const isArray = type === "array";
  const entries = isArray ? value : Object.entries(value);
  const count = isArray ? value.length : entries.length;

  const openBracket = isArray ? "[" : "{";
  const closeBracket = isArray ? "]" : "}";
  const emptyLabel = isArray ? "[]" : "{}";

  const wrapper = createElement("div", "node node-collapsible");
  wrapper.dataset.depth = depth;
  if (embedded) wrapper.classList.add("node-embedded");

  // --- Header row (toggle + key + bracket) ---
  const header = createElement("div", "node-header");

  const toggle = createElement("span", "toggle");
  toggle.textContent = "▼";
  toggle.setAttribute("role", "button");
  toggle.setAttribute("aria-label", "Collapse");
  header.appendChild(toggle);

  if (key !== null) {
    header.appendChild(renderKey(key, isArray));
    header.appendChild(makeText(": "));
  }

  if (embedded) header.appendChild(makeEmbeddedBadge());

  if (count === 0) {
    header.appendChild(makeSpan("bracket", emptyLabel));
    if (!isLast) header.appendChild(makeText(","));
    wrapper.appendChild(header);
    return wrapper;
  }

  header.appendChild(makeSpan("bracket", openBracket));

  // Collapsed preview (shown when folded)
  const preview = createElement("span", "collapsed-preview");
  preview.textContent = buildPreview(value, isArray);
  preview.style.display = "none";
  header.appendChild(preview);

  wrapper.appendChild(header);

  // --- Children container ---
  const childrenEl = createElement("div", "node-children");

  const items = isArray ? value : entries;
  items.forEach((item, idx) => {
    const childKey = isArray ? idx : item[0];
    const childVal = isArray ? item : item[1];
    const childIsLast = idx === count - 1;
    childrenEl.appendChild(renderNode(childKey, childVal, depth + 1, childIsLast));
  });

  wrapper.appendChild(childrenEl);

  // --- Footer row (closing bracket) ---
  const footer = createElement("div", "node-footer");
  footer.appendChild(makeSpan("bracket", closeBracket));
  if (!isLast) footer.appendChild(makeText(","));
  wrapper.appendChild(footer);

  // --- Toggle behaviour ---
  let collapsed = false;
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    collapsed = !collapsed;

    if (collapsed) {
      toggle.textContent = "▶";
      toggle.setAttribute("aria-label", "Expand");
      childrenEl.style.display = "none";
      footer.style.display = "none";
      preview.style.display = "";
    } else {
      toggle.textContent = "▼";
      toggle.setAttribute("aria-label", "Collapse");
      childrenEl.style.display = "";
      footer.style.display = "";
      preview.style.display = "none";
    }
  });

  return wrapper;
}

// ---------------------------------------------------------------------------
// Primitive values (string, number, boolean, null)
// ---------------------------------------------------------------------------

function renderPrimitive(key, value, type, isLast) {
  const row = createElement("div", "node node-primitive");

  if (key !== null) {
    row.appendChild(renderKey(key, false));
    row.appendChild(makeText(": "));
  }

  row.appendChild(renderValue(value, type));

  if (!isLast) row.appendChild(makeText(","));

  return row;
}

function renderValue(value, type) {
  const span = createElement("span", `value value-${type}`);

  switch (type) {
    case "string":
      span.textContent = JSON.stringify(value); // includes surrounding quotes
      break;
    case "number":
      span.textContent = String(value);
      break;
    case "boolean":
      span.textContent = String(value);
      break;
    case "null":
      span.textContent = "null";
      break;
    default:
      span.textContent = String(value);
  }

  return span;
}

function renderKey(key, isArrayIndex) {
  const span = createElement("span", isArrayIndex ? "key key-index" : "key");
  span.textContent = isArrayIndex ? String(key) : JSON.stringify(key);
  return span;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value; // "object" | "string" | "number" | "boolean"
}

function buildPreview(value, isArray) {
  if (isArray) {
    if (value.length === 0) return " ";
    const count = value.length;
    return ` ${count} item${count !== 1 ? "s" : ""} `;
  }

  const keys = Object.keys(value);
  if (keys.length === 0) return " ";
  const shown = keys.slice(0, MAX_INLINE_PREVIEW);
  const preview = shown.map((k) => `${JSON.stringify(k)}: …`).join(", ");
  const more = keys.length > MAX_INLINE_PREVIEW ? `, +${keys.length - MAX_INLINE_PREVIEW} more` : "";
  return ` ${preview}${more} `;
}

function createElement(tag, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function makeSpan(className, text) {
  const span = createElement("span", className);
  span.textContent = text;
  return span;
}

function makeText(str) {
  return document.createTextNode(str);
}

function makeEmbeddedBadge() {
  const badge = createElement("span", "embedded-badge");
  badge.textContent = "json";
  badge.title = "This value was an escaped JSON string — auto-unwrapped";
  return badge;
}
