# Jsonifier

A zero-friction JSON viewer that lives inside your browser's side panel.

Paste any JSON and instantly see it as a **collapsible, syntax-highlighted tree** — side-by-side with your current tab, and it stays put as you navigate between pages.

---

## Features

- **Side-by-side viewing** — opens in Chrome's native Side Panel, so it sits next to the page you're working on and persists across navigations.
- **Paste & go** — no buttons, no formatting step. Paste JSON into the text area and the formatted tree renders instantly.
- **Collapsible tree** — click the `▼` next to any object or array to fold its contents. Collapsed nodes show a friendly preview (`5 items`, or the first few keys).
- **Expand / Collapse all** — toolbar buttons to flatten or fold the whole tree in one click.
- **Auto-unwrap escaped JSON** — paste a string like `"{\"a\":1}"` straight from a log and it renders as a tree. Also unwraps **nested** escaped JSON inside any string field (common in log entries with a `"request"` / `"response"` / `"payload"` field whose value is a stringified JSON blob). Unwrapped values are tagged with a small green `json` badge.
- **Unescape / Escape buttons** — manually peel one layer of string-wrapping off the input, or re-wrap it. Handy for round-tripping payloads through systems that double-encode.
- **Syntax highlighting** — keys, strings, numbers, booleans, and `null` each get their own colour for fast scanning.
- **Precise error reporting** — when the JSON is invalid, you get the parser's message plus the exact **line and column** where it broke.
- **Word wrap** — long string values wrap to the panel width instead of forcing horizontal scroll.
- **Dark theme** — easy on the eyes during long debugging sessions (Catppuccin-inspired palette).
- **No dependencies** — pure vanilla HTML, CSS, and JavaScript. No bundler, no frameworks, no telemetry.

---

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `json-beautifier` folder.
5. The Jsonifier icon (`{}`) appears in your Chrome toolbar.

---

## Usage

1. Click the Jsonifier toolbar icon — the side panel slides in from the right.
2. Paste your JSON into the **Paste JSON** text area.
3. The formatted tree appears below. Click any `▼` to collapse a node, or use the **Expand all** / **Collapse all** buttons.
4. If your JSON is malformed, a red banner shows the parse error along with the exact line and column. Fix the input and the tree re-renders automatically.
5. Navigate between tabs and pages — the side panel stays open and keeps your JSON visible. Click the toolbar icon again to close it.

### Working with escaped JSON strings

Logs and API responses sometimes ship JSON *inside* a JSON string, with all the inner quotes escaped:

```text
"{\"name\":\"Alice\",\"age\":30}"
```

Paste that directly and Jsonifier renders the tree of the inner object — a green **Unwrapped from escaped string** badge appears so you know what happened. It handles double- and triple-escaped payloads up to 5 levels deep.

The same trick also works on **nested** fields. If a value inside your JSON is itself a stringified JSON blob (very common with log entries that have a `request`, `response`, or `payload` field), the viewer detects it, parses it, and renders the inner tree right where the string would have been. A small green `json` badge sits next to the key so you know the source still has it as a string.

If you'd rather do it by hand:

- **Unescape** — peels off one layer of string-wrapping from the textarea. Press it again to peel another layer.
- **Escape** — wraps the current textarea content as a JSON-encoded string. Use this to produce a payload you can drop into another JSON document.

---

## Project Structure

```
json-beautifier/
├── manifest.json          Chrome Extension Manifest V3
├── background.js          Service worker — configures the side-panel toggle
├── viewer/
│   ├── viewer.html        Side-panel UI markup
│   ├── viewer.css         Dark theme, tree layout, syntax colours
│   ├── viewer.js          Input → parse → render orchestration (debounced)
│   ├── parser.js          JSON.parse wrapper with line/column error extraction
│   └── tree.js            Recursive collapsible-tree renderer
└── icons/
    ├── icon.svg           Source vector
    ├── icon16.png         Toolbar icon (small)
    ├── icon48.png         Extensions page
    └── icon128.png        Chrome Web Store
```

---

## How It Works

```
                   ┌─────────────────────────┐
                   │  Click toolbar icon     │
                   └────────────┬────────────┘
                                ▼
                   ┌─────────────────────────┐
                   │  Side panel slides in   │
                   │  (viewer/viewer.html)   │
                   └────────────┬────────────┘
                                ▼
        ┌───────────────────────────────────────────────┐
        │  Paste JSON  →  parser.js  →  tree.js         │
        │                    │              │           │
        │             on error: line/col   on success:  │
        │             banner shows         tree renders │
        └───────────────────────────────────────────────┘
```

- `background.js` calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` so a single icon click toggles the panel.
- The viewer debounces input by 250 ms to avoid re-rendering on every keystroke.
- `parser.js` catches `SyntaxError` from `JSON.parse`, extracts the character offset from V8's error message (`at position N`), and converts it to a 1-based line/column.
- `tree.js` walks the parsed value recursively, producing collapsible `<div>` nodes with click-to-toggle behaviour.

---

## Browser Support

- **Chrome 114+** (the Side Panel API became stable in Chrome 114).
- Should also work on **Edge 114+** and other Chromium-based browsers that ship the Side Panel API.

---

## License

MIT
