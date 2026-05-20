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

  // V8 has several SyntaxError formats. We try each in turn to recover
  // the precise character offset of the failure:
  //   • "... in JSON at position 45 (line 3 column 5)"  (older / verbose)
  //   • "... at position 45"                            (older / short)
  //   • "Unexpected token X, \"snippet\" is not valid JSON"  (Node 19+ / Chrome 102+)
  // The third form omits position entirely, so we locate the snippet inside
  // the source text and pinpoint the bad character within it. Without this
  // fallback we incorrectly report "end of input" for most real errors.
  const { line, col, position } = extractLocation(text, raw);

  const message = sanitizeMessage(raw);

  return { ok: false, message, line, col, position };
}

/**
 * Resolve a JSON SyntaxError to a 1-based line/col plus the matching 0-based
 * character offset in `text`. Returns { line: 0, col: 0, position: -1 } if we
 * truly cannot tell.
 */
function extractLocation(text, message) {
  // 1. "(line N column M)" is the most direct signal when present.
  const lcMatch = message.match(/\(line (\d+) column (\d+)\)/);
  if (lcMatch) {
    const line = parseInt(lcMatch[1], 10);
    const col = parseInt(lcMatch[2], 10);
    return { line, col, position: lineColToPosition(text, line, col) };
  }

  // 2. "at position N"
  const posMatch = message.match(/at position (\d+)/);
  if (posMatch) {
    const position = parseInt(posMatch[1], 10);
    return { ...positionToLineCol(text, position), position };
  }

  // 3. Snippet form: 'Unexpected token X, [...]"SNIPPET" is not valid JSON'
  //    The snippet is a verbatim slice of the source around the failure.
  //    We find it back in the source, then jump to the offending character.
  const snippet = extractSnippet(message);
  if (snippet !== null && snippet.length > 0) {
    const start = text.indexOf(snippet);
    if (start >= 0) {
      // V8's snippet starts at (or close to) the error position and often
      // includes a little trailing context. Locating the FIRST occurrence
      // of the offending character lands us on the real failure; using
      // the last occurrence overshoots for inputs like "[1, 2, foo]"
      // where the bad character repeats inside the trailing context.
      let offset = 0;
      const tokenMatch = message.match(/Unexpected token '(.)'/);
      if (tokenMatch) {
        const first = snippet.indexOf(tokenMatch[1]);
        if (first >= 0) offset = first;
      }
      const position = start + offset;
      return { ...positionToLineCol(text, position), position };
    }
  }

  return { line: 0, col: 0, position: -1 };
}

/**
 * Pull the source snippet out of a V8 "is not valid JSON" message.
 * The snippet is wrapped in literal double quotes and may itself contain
 * unescaped double quotes (V8 doesn't escape them), so we anchor on the
 * trailing literal and take everything between.
 */
function extractSnippet(message) {
  // The snippet may be preceded by a "..." truncation marker.
  const match = message.match(/,\s+(?:\.\.\.)?"([\s\S]*)"\s+is not valid JSON\b/);
  return match ? match[1] : null;
}

/** Strip noisy V8 location/snippet suffixes to produce a human-friendly message. */
function sanitizeMessage(raw) {
  return raw
    .replace(/,\s+(?:\.\.\.)?"[\s\S]*"\s+is not valid JSON\b.*$/, "")
    .replace(/\s+in JSON\b.*$/, "")
    .replace(/\s+at position \d+(?:\s*\(line \d+ column \d+\))?$/, "")
    .trim();
}

/** Convert a 0-based character offset into { line, col } (both 1-based). */
function positionToLineCol(text, position) {
  if (position < 0 || position > text.length) {
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

/** Convert a 1-based line/col back into a 0-based character offset. */
function lineColToPosition(text, line, col) {
  let curLine = 1;
  let curCol = 1;
  for (let i = 0; i < text.length; i++) {
    if (curLine === line && curCol === col) return i;
    if (text[i] === "\n") {
      curLine++;
      curCol = 1;
    } else {
      curCol++;
    }
  }
  return text.length;
}
