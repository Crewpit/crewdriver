# Crewdriver

Minimal example of a [Cockpit](https://cockpit-project.org/) tool page: a floating in-page menu bar with sub-menus, dark/light theme sync with the shell, reusable building blocks (modals, alerts, tables, forms...) in `functions.js`, and a debug page that spawns `dd` on the managed system to prove `cockpit.spawn()` works end to end.

Feel free to expand from base code to add your functionality and share your projects. Someone might find it interesting and/or useful :)

Requires no build step, unlike the official Cockpit template: just static HTML/CSS/JS dropped into a Cockpit package directory.

## Layout

- `manifest.json` - package metadata, tells the Cockpit shell about this tool
- `index.html` - page markup (one `<div id="pane-..." class="app-pane">` per page)
- `index.js` - this app's own wiring: the `MENU` declaration (menu order and topology), the Debug demos and the Test Events handler
- `functions.js` - reusable features exposed as `window.App` (menu engine, modals, alerts, command runner, settings form, sortable table, clipboard, polling, UUIDs, widgets); each section has usage examples in comments
- `theme.js` - keeps `pf-v6-theme-dark` in sync with the shell's theme, loaded in `<head>` since Cockpit's CSP blocks inline `<script>`
- `index.css`, `cockpit-glue.css` - page-specific styles and the layout glue every embedded Cockpit page needs (no masthead/sidebar of its own)
- `vendor/patternfly/` - vendored PatternFly CSS

## "Installing"

Symlink or copy this directory into `/usr/share/cockpit/crewdriver` and then reload Cockpit in the browser. You should have a new sidebar entry taking you to the app.

Cockpit lists a package's files when you log in, so after adding a new file (not just editing one), log out and back in or it will 404.

## Menu

The whole menu is declared once, as `MENU` in `index.js`, and built by `App.menu.mount()`. Array order is menu order, and `children` adds a second-level bar (two levels only).

```js
var MENU = {
    label: "Crewdriver Menu",          // name on the bar; omit it to use manifest.json's label
    items: [
        { label: "Home", path: "/", pane: "pane-home" },
        {
            label: "Debug", path: "/debug", pane: "pane-debug",
            children: [
                { label: "Toasts", action: demoToasts },
                { label: "Process Table", path: "/debug/table", pane: "pane-debug-table",
                  onShow: start, onHide: stop },
            ],
        },
    ],
};
App.menu.mount(MENU, { nav: "app-menu", startExpanded: true });
```

Item fields:

| Field | What it does |
| --- | --- |
| `label` | Text shown in the menu (required). |
| `path` | Hash route, e.g. `"/debug"` shows as `#/debug`. Omit both `path` and `action` for a placeholder that goes nowhere (shown in italics). |
| `pane` | Id of the `<div id="pane-..." class="app-pane" hidden>` that `path` shows. Required whenever `path` is set. |
| `action` | `function(button)` run instead of navigating, e.g. to open a modal. Use `path` or `action`, not both. Stays highlighted until another action or page is chosen. |
| `onShow` / `onHide` | Run when this page becomes current / when you navigate away. Pair them to start and stop an `App.poll`. |
| `children` | Array of items, same fields, no nesting. |
| `href` | External URL: opens in a new tab instead of routing. |
| `title` | Tooltip for the item. |
| `decorate` | `function(linkElement, item)` run when the item is built (add a status dot, badge...). |

The first item with a `path` is the default for an empty or unknown hash. Several items may share one `pane`. Hovering or focusing a top-level item previews its sub-bar without moving the page.

`manifest.json` only controls the single entry in Cockpit's own sidebar (which can't nest); its `order` sets that entry's position.

`App.menu.mount()` returns:

- `setExpanded(bool)` - open or collapse the bar (`|<` hides it, `|>` expands it)
- `setLabel(text)` - change the name on the toggle
- `setItems(items)` - rebuild the bar from a new item list, for menus that depend on runtime data. The current page keeps its state: `onShow` / `onHide` only fire when the route changes, matched by `path`.
- `currentPage()` - the item that is showing now

## Helpers (`window.App`)

Everything below lives in `functions.js`, and each section there starts with its options and a usage example. Look at the Debug menu in the app to see most of them working.

### `App.el(tag, attrs, children)`

Tiny DOM builder. `attrs.text` sets `textContent`, `attrs.class` sets `className`, anything else is `setAttribute`. `children` is an array of nodes. It never parses HTML, so it's safe with untrusted text.

```js
App.el("p", { class: "note", text: "Hello" })
```

### `App.uuid`

- `v4()` - a UUIDv4. Uses `getRandomValues`, so it works over plain `http://` too (`crypto.randomUUID` only exists on secure pages).
- `fromBytes(bytes)` - formats 16 bytes (e.g. from `dd if=/dev/urandom`) as a UUIDv4.

### `App.clipboard.copy(text)`

Returns a promise. Uses `navigator.clipboard` when allowed and falls back to `execCommand("copy")`, so it works over both http and https.

### `App.poll(fn, intervalMs)`

Returns `{ refresh, stop }`. Use it instead of `setInterval` for anything that refreshes on a timer.

Cockpit's shell keeps every visited page alive, and a plain `setInterval` keeps firing while you're on another page or the browser tab is in the background. That gets the tab throttled, misses the shell's health check and drops the session ("Disconnected: Connection has timed out."). `App.poll`:

- pauses while the page is hidden and resumes when shown again, running `fn` right away only if the data is older than `intervalMs`
- arms the next run only after the previous one finished, so a slow run never overlaps
- is single-flight: `refresh()` during a running `fn` joins it instead of starting a second batch

`fn` must return a promise that settles (or a plain value). One poller per data source, and don't go below a few seconds. Start it in a menu page's `onShow` and `stop()` it in `onHide`.

### `App.alerts`

- `inline(container, variant, title, description)` - replaces the container's content with one PatternFly inline alert. A falsy `title` just clears it. Returns the alert element.
- `toast(variant, title, opts)` - stacks a toast in the bottom-right corner (so it never covers the menu bar). Returns `{ close }`. `opts`: `description`, `timeout` in ms (default 8000, `0` = stays until closed), `onClose`.

`variant` is `"success"`, `"danger"`, `"warning"`, `"info"` or `"custom"`.

```js
App.alerts.inline("settings-alert", "danger", "Save failed", ex.message);
App.alerts.inline("settings-alert");                       // clear
App.alerts.toast("success", "Saved", { description: "3 settings changed" });
```

### `App.run(args, opts)`

`cockpit.spawn` that marks a button busy while it runs and reports the result as a toast or inline alert. Returns a promise of the output, or `null` on a reported failure. `opts`:

- `superuser` - passed to `cockpit.spawn` (`"try"` or `"require"`)
- `spawn` - extra `cockpit.spawn` options (`err`, `environ`, `directory`...)
- `button` - element to disable and mark busy while running
- `busyLabel` - text on the button while running
- `alert` - container (element or id) for an inline alert; default is a toast
- `success` - string, or `function(output)` returning one; omit for no message
- `failure` - title for the error message (default "Command failed")
- `throw` - `true` to reject on failure. By default the error is reported and the promise resolves `null`, because an uncaught rejection shows Cockpit's "Ooops!".

```js
App.run(["systemctl", "restart", "foo"], {
    superuser: "require",
    button: restartBtn, busyLabel: "Restarting...",
    success: "foo restarted",
});
```

### `App.modals`

- `open(opts)` - bare modal shell, everything is up to you. `opts`: `title` (required), `body` (string, node or array; strings become `<p>` via `textContent`), `footer` (node or array), `closable` (X and Escape, default true), `size` (`"sm"`, `"md"`, `"lg"`), `onClose`.
- `notice(opts)` - no action buttons, closes itself on a countdown. Takes everything `open` does plus `seconds` (default 10), `countdownText(n)`, `onTimeout`.
- `confirm(opts)` - action buttons that each run a callback. Takes everything `open` does (except `footer`) plus `buttons: [{ label, variant, action }]` and `focus` (index of the button to focus, default last). `variant` is `"primary"`, `"secondary"` (default), `"danger"`, `"link"`, `"tertiary"` or `"plain"`. `action(modal)` doesn't close the modal unless it calls `modal.close()`; if it returns a promise, all buttons are disabled until it settles.
- `changeList(changes)` - a `<ul>` of "Label: old → new" lines for a modal body. `changes`: `[{ label, before, after }]`.

`open`, `notice` and `confirm` return a controller:

- `close()` - closes it; `onClose` runs once, on any close path
- `setTitle(text)` - replaces the title
- `setStatus(text)` - sets the highlighted status line in the body (empty string hides it, screen readers are told)
- `isOpen()` - false once closed
- `box` - the `.pf-v6-c-modal-box` element, for anything custom
- `setSeconds(n)` - `notice` only: restarts the countdown from `n`

```js
App.modals.confirm({
    title: "Delete host?",
    body: "This removes \"router1\" permanently.",
    buttons: [
        { label: "Delete", variant: "danger", action: function (m) { deleteHost(); m.close() } },
        { label: "Cancel", variant: "link", action: function (m) { m.close() } },
    ],
    focus: 1, // Cancel, so a stray Enter is harmless
});
```

### `App.settings.form(opts)`

A PatternFly horizontal form from a field list. Apply diffs the values against the last loaded or saved ones, lists the changes in an `App.modals.notice` and calls `save()`. Returns `{ reload, values, changes }`. `opts`:

- `container` - element or id to render into (required)
- `fields` - `[{ key, label, type, options, placeholder, help }]`. `type` is `"text"` (default), `"number"`, `"checkbox"` or `"select"`. For selects, `options` is `["a", "b"]` or `[{ value, label }]`.
- `load` - `function()` returning the values object, or a promise of one
- `save` - `function(values, changes)` returning a promise (or nothing)
- `applyLabel` - default "Apply"
- `notice` - options merged into the notice (`title`, `seconds`...); `false` = no modal, just a success toast

```js
App.settings.form({
    container: "my-settings",
    fields: [
        { key: "hostname", label: "Hostname" },
        { key: "verbose", label: "Verbose logging", type: "checkbox" },
        { key: "level", label: "Level", type: "select", options: ["low", "high"] },
    ],
    load: function () { return cockpit.file("/etc/foo.json", { syntax: JSON }).read() },
    save: function (values) {
        return cockpit.file("/etc/foo.json", { syntax: JSON, superuser: "require" }).replace(values);
    },
});
```

### `App.table.create(opts)`

PatternFly compact table with click-to-sort headers. Returns `{ setRows, rows }`. The sort order survives `setRows()`, so it can be fed from `App.poll`. `opts`:

- `container` - element or id to render into (required)
- `columns` - `[{ key, label, numeric, sortable, format, render }]`. `numeric` sorts as numbers and right-aligns. `sortable` defaults to true. `format(value, row)` returns a string for display. `render(value, row)` returns a node instead (it wins over `format`; use it for buttons, labels, links).
- `sort` - `{ key, dir: "asc" | "desc" }`, the initial sort
- `emptyText` - shown when there are no rows (default "No data")
- `caption` - table caption for screen readers

```js
var t = App.table.create({
    container: "proc-table",
    columns: [
        { key: "pid", label: "PID", numeric: true },
        { key: "cmd", label: "Command" },
        { key: "cpu", label: "CPU %", numeric: true, format: function (v) { return v.toFixed(1) } },
    ],
    sort: { key: "cpu", dir: "desc" },
});
t.setRows([{ pid: 1, cmd: "systemd", cpu: 0.1 }]);
```

### `App.manifest.entry(page)`

A package's own `manifest.json` 404s, but Cockpit serves all of them merged at `../manifests.json`. This returns a promise of this package's entry for `page` (default: the current file name, e.g. `"index"`), or `null`.

```js
App.manifest.entry().then(function (e) { document.title = e.label });
```

### `App.widgets`

Nothing to call; it's active as soon as `functions.js` loads, and one delegated click listener covers panes added later.

- Tabs: wrap the tab list and its panels in an element with `data-app-tabs`. Each tab button carries `data-app-tab="<panel id>"`. The clicked tab gets `pf-m-current` and `aria-selected`, its panel is shown and the others are hidden.
- Expandable sections: the toggle button carries `data-app-expand="<content id>"`. The section (its parent) gets `pf-m-expanded` and the content's `hidden` flips. Add `data-app-text-expanded="Show Less"` to swap the toggle text while it's open; the original text comes back when closed.

Markup for both is in Elements → Navigation.

## Styles

PatternFly covers cards, buttons, tables, forms and the light/dark tokens. The vendored build has no `pf-v6-u-*` utilities, so the few the page uses are defined in `index.css` (`pf-v6-u-mt-sm`, `-mt-md`, `-mb-md`, `-my-md`). The rest are `app-*` helpers:

- `.app-pane` - one page of content; shown and hidden by the menu, fades in on open
- `.app-block`, `.app-block__header`, `.app-block__title` - flat section inside a pane; consecutive blocks are divided by a rule
- `.app-muted` - small subtle text
- `.app-demo-row` - wrapping row of sample controls
- `.app-card-switch` - switch on the left, a one-line hint beside it, a divider below (see Debug → Process Table)
- `.app-table__divider`, `.app-table__row--muted`, `.app-mono`, `.app-btn-group` - helpers for grouped table lists
- `.app-footer` - footer row with text on the left and the version on the right
- `.app-spinner-demo` - centered spinner with its label underneath
- `--app-sub-accent` - sub-menu highlight colour; `--app-code-bg`, `--app-code-fg`, `--app-code-border` - code block colours (dark purple in the dark theme, pale mint in the light one)

The Elements menu shows every building block with copy-paste markup: Buttons, Forms, Typography, Navigation, Status, Data & Layout.

## License

Licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution.
