/**
 * Parse a JSON string and return a result object.
 *
 * Success: { ok: true, value: <parsed> }
 * Failure: { ok: false, message: string, line: number, col: number, position: number }
 *
 * Chrome's V8 engine (as of recent versions) throws SyntaxError with messages like:
 *   "Unexpected token ',' JSON at position 45"       (older format)
 *   "Expected ',' or ']' after array element in JSON at position 45"  (newer format)
 * We extract the character offset and convert it to line/col by scanning newlines.
 */
function parseJSON(text) {
  if (!text || !text.trim()) {
    return { ok: false, message: "Empty input", line: 1, col: 1, position: 0 };
  }

  try {
    let value = JSON.parse(text);
    let unwrapDepth = 0;

    // Auto-unwrap nested JSON-in-string.
    // If the parsed value is itself a string that looks like JSON
    // (starts with `{` or `[`), parse it again. Repeat up to 5 levels
    // deep to handle double / triple-escaped payloads from logs.
    while (
      typeof value === "string" &&
      unwrapDepth < 5 &&
      looksLikeJSON(value)
    ) {
      try {
        value = JSON.parse(value);
        unwrapDepth++;
      } catch {
        break;
      }
    }

    return { ok: true, value, unwrapDepth };
  } catch (err) {
    return buildErrorResult(text, err);
  }
}

/** Heuristic: does this string start with a JSON object or array? */
function looksLikeJSON(str) {
  const trimmed = str.trim();
  if (!trimmed) return false;
  const first = trimmed[0];
  return first === "{" || first === "[";
}

/**
 * Peel ONE layer of JSON-string wrapping off the given text.
 * Input must be a JSON-encoded string, e.g. `"{\"a\":1}"`.
 * Returns { ok: true, value: string } or { ok: false, message }.
 */
function unescapeOneLayer(text) {
  if (!text || !text.trim()) {
    return { ok: false, message: "Empty input" };
  }
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "string") {
      return {
        ok: false,
        message: "Input is not an escaped JSON string (parses to " + typeof parsed + ")",
      };
    }
    return { ok: true, value: parsed };
  } catch (err) {
    return { ok: false, message: "Cannot unescape: " + (err.message || "invalid JSON") };
  }
}

/** Wrap the given text as a JSON-encoded string (adds one layer of escaping). */
function escapeOneLayer(text) {
  return JSON.stringify(text);
}

function buildErrorResult(text, err) {
  const raw = err.message || "Invalid JSON";

  // Extract character position from V8 error messages.
  // Patterns:
  //   "... at position 45"
  //   "... (line 3 column 5)"  — some environments
  let position = extractPosition(raw);
  const { line, col } = positionToLineCol(text, position);

  // Produce a clean, human-friendly message by stripping the "JSON at position N" suffix.
  const message = raw
    .replace(/\s+in JSON\b.*$/, "")
    .replace(/\s+at position \d+$/, "")
    .trim();

  return { ok: false, message, line, col, position };
}

/** Pull the character offset out of V8 SyntaxError messages. Returns -1 if not found. */
function extractPosition(message) {
  // "at position 45"
  const posMatch = message.match(/at position (\d+)/);
  if (posMatch) return parseInt(posMatch[1], 10);

  // "(line N column M)" — Node.js / some engines
  const lineColMatch = message.match(/\(line (\d+) column (\d+)\)/);
  if (lineColMatch) return -1; // we'll handle this separately if needed

  return -1;
}

/** Convert a 0-based character offset into { line, col } (both 1-based). */
function positionToLineCol(text, position) {
  if (position < 0 || position > text.length) {
    // Try to at least point to the end of input
    position = Math.max(0, text.length - 1);
  }

  let line = 1;
  let col = 1;

  for (let i = 0; i < position && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }

  return { line, col };
}
