(function () {
    "use strict";

    // Theme sync happens in theme.js, loaded in index.html's <head>.
    // Reusable features live in functions.js (window.App).

    // ------------------------------------------------------------------
    // Menu declaration.
    //
    // MENU.label: name on the bar's toggle. Omit it to use the label from
    // manifest.json (the name in Cockpit's sidebar).
    //
    // MENU.items:
    //   - Order: array order, left to right.
    //   - Topology: `children: [...]` show in a second bar while that item or
    //     one of its children is the current page. Two levels only.
    //   - Item fields:
    //       label     text shown in the menu (required)
    //       path      hash route, e.g. "/debug" -> #/debug. Omit both `path`
    //                 and `action` for a placeholder link that goes nowhere.
    //       pane      id of the <section id="pane-..." hidden> in index.html
    //                 that `path` shows. Required whenever `path` is set.
    //       action    function(button) to run instead of navigating (e.g. open
    //                 a modal). Use `path` or `action`, not both. Stays
    //                 highlighted until another action or page is chosen.
    //       onShow    optional function() run when this page becomes current
    //       onHide    optional function() run when you navigate away from it
    //                 (pair them to start/stop App.poll with the pane)
    //       children  optional array of items, same fields (no nesting).
    //   - The first item with a `path` is the default for an empty/unknown hash.
    //
    // manifest.json only controls the single entry in Cockpit's own sidebar
    // (which can't nest); its "order" sets that entry's position.
    // ------------------------------------------------------------------
    var MENU = {
        label: "Crewdriver Menu", // name on the bar; manifest.json still names the Cockpit sidebar entry
        items: [
            {
                label: "Home", path: "/", pane: "pane-home",
                children: [
                    { label: "Does Nothing 1" },
                    { label: "Does Nothing 2" },
                ],
            },
            {
                label: "Elements", path: "/elements", pane: "pane-elements",
                children: [
                    { label: "Buttons", path: "/elements/buttons", pane: "pane-elements-buttons" },
                    { label: "Forms", path: "/elements/forms", pane: "pane-elements-forms" },
                    { label: "Typography", path: "/elements/typography", pane: "pane-elements-typography" },
                    { label: "Navigation", path: "/elements/navigation", pane: "pane-elements-navigation" },
                    { label: "Status", path: "/elements/status", pane: "pane-elements-status" },
                    { label: "Data & Layout", path: "/elements/data", pane: "pane-elements-data" },
                ],
            },
            {
                label: "Debug", path: "/debug", pane: "pane-debug",
                children: [
                    { label: "Noninteractive Modal", action: demoNoninteractiveModal },
                    { label: "Interactive Modal", action: demoInteractiveModal },
                    { label: "Toasts", action: demoToasts },
                    { label: "Run Command", action: demoRunCommand },
                    { label: "Copy UUID", action: demoCopyUuid },
                    { label: "Settings Form", path: "/debug/settings", pane: "pane-debug-settings", onShow: showSettingsDemo },
                    {
                        label: "Process Table", path: "/debug/table", pane: "pane-debug-table",
                        onShow: startProcessTable, onHide: stopProcessTable,
                    },
                ],
            },
        ],
    };

    // ------------------------------------------------------------------
    // Debug demos, one per App.* feature.
    // ------------------------------------------------------------------

    function demoNoninteractiveModal() {
        var modal = App.modals.notice({
            title: "Applying changes",
            body: "This notice has no action buttons; it closes on its own when the countdown ends (or use the X).",
            seconds: 10,
        });
        modal.setStatus("Pretending to apply changes in the background...");
        // Simulates the work finishing.
        window.setTimeout(function () {
            if (!modal.isOpen())
                return;
            modal.setTitle("Changes applied");
            modal.setStatus("Done. Nothing was actually changed.");
        }, 3000);
    }

    function demoInteractiveModal() {
        var modal = App.modals.confirm({
            title: "Apply these settings?",
            body: "Pressing a button below only updates this text; nothing is applied.",
            buttons: [
                { label: "Confirm", variant: "primary", action: function (m) { m.setStatus("Confirm button pressed") } },
                { label: "Cancel", variant: "link", action: function (m) { m.setStatus("Cancel button pressed") } },
            ],
            focus: 1, // Cancel, so a stray Enter is harmless
        });
        modal.setStatus("No button pressed yet.");
    }

    function demoToasts() {
        App.alerts.toast("success", "Success Toast", { description: "Closes after 8 seconds." });
        App.alerts.toast("info", "Info Toast");
        App.alerts.toast("warning", "Warning Toast");
        App.alerts.toast("danger", "Danger Toast", { description: "This one stays until you close it.", timeout: 0 });
    }

    // `button` is the menu item itself, so it shows the busy state.
    function demoRunCommand(button) {
        App.alerts.toast("info", "Run Command", {
            description: "Runs \"uname -srm\" on the server (after a 2 second pause) to demo App.run: " +
                         "this menu entry shows \"Running...\" while it works, then the result appears as a toast.",
            timeout: 6000,
        });
        App.run(["sh", "-c", "sleep 2; uname -srm"], {
            button: button,
            busyLabel: "Running...",
            success: function (out) { return "uname: " + out.trim() },
            failure: "uname failed",
        });
    }

    function demoCopyUuid() {
        var value = App.uuid.v4();
        App.clipboard.copy(value)
                .then(function () { App.alerts.toast("success", "Copied to clipboard", { description: value }) })
                .catch(function (ex) { App.alerts.toast("danger", "Copy failed", { description: ex.message }) });
    }

    // Demo settings live in memory only; a real app would load/save with
    // cockpit.file (see the example in functions.js).
    var demoSettings = { hostname: "exoverse", verbose: false, level: "info", retries: 3 };
    var settingsForm = null;

    function showSettingsDemo() {
        if (settingsForm)
            return;
        settingsForm = App.settings.form({
            container: "settings-demo",
            fields: [
                { key: "hostname", label: "Hostname", placeholder: "my-host" },
                { key: "verbose", label: "Verbose", type: "checkbox", help: "Log every request" },
                { key: "level", label: "Log level", type: "select", options: ["debug", "info", "warning", "error"] },
                { key: "retries", label: "Retries", type: "number", help: "How many times to retry a failed call" },
            ],
            load: function () { return Object.assign({}, demoSettings) },
            save: function (values) {
                // Pretend the save takes a moment.
                return new Promise(function (resolve) {
                    window.setTimeout(function () {
                        demoSettings = values;
                        resolve();
                    }, 1500);
                });
            },
            notice: { seconds: 10 },
        });
    }

    // Process Table demo: App.table + App.poll, with a switch row (switch,
    // live hint, button) above a divider, like a card header.
    var processTable = null;
    var processPoller = null;
    var processSwitch = document.getElementById("process-auto");
    var processHint = document.getElementById("process-auto-hint");

    // `exec` keeps the shell's PID, so the first line is ps's own PID;
    // drop that row, since ps reports nonsense CPU for its own short run.
    function fetchProcesses() {
        return cockpit.spawn(["sh", "-c", "echo $$; exec ps -eo pid=,user=,pcpu=,pmem=,comm= --sort=-pcpu"], { err: "message" })
                .then(function (out) {
                    var lines = out.trim().split("\n");
                    var selfPid = Number(lines.shift());
                    var rows = lines.map(function (line) {
                        var p = line.trim().split(/\s+/);
                        return { pid: Number(p[0]), user: p[1], cpu: Number(p[2]), mem: Number(p[3]), cmd: p.slice(4).join(" ") };
                    }).filter(function (row) { return row.pid !== selfPid }).slice(0, 25);
                    processTable.setRows(rows);
                    document.getElementById("process-updated").textContent =
                        "Updated " + new Date().toLocaleTimeString();
                })
                .catch(function (ex) {
                    App.alerts.inline("process-alert", "danger", "Couldn't list processes", ex.message);
                });
    }

    function applyProcessSwitch() {
        stopProcessTable();
        if (processSwitch.checked)
            processPoller = App.poll(fetchProcesses, 5000);
        else
            fetchProcesses(); // paused: one fresh snapshot, then it stays put
        processHint.textContent = processSwitch.checked
            ? "Refreshing every 5 seconds while this page is open."
            : "Paused. Use Refresh to update.";
    }

    processSwitch.addEventListener("change", applyProcessSwitch);
    document.getElementById("process-refresh-btn").addEventListener("click", fetchProcesses);

    // Started/stopped by the pane's onShow/onHide.
    function startProcessTable() {
        if (!processTable)
            processTable = App.table.create({
                container: "process-table",
                caption: "Top processes by CPU",
                columns: [
                    { key: "pid", label: "PID", numeric: true },
                    { key: "user", label: "User" },
                    { key: "cpu", label: "CPU %", numeric: true, format: function (v) { return v.toFixed(1) } },
                    { key: "mem", label: "Mem %", numeric: true, format: function (v) { return v.toFixed(1) } },
                    { key: "cmd", label: "Command" },
                ],
                sort: { key: "cpu", dir: "desc" },
                emptyText: "Loading...",
            });
        applyProcessSwitch();
    }

    function stopProcessTable() {
        if (processPoller)
            processPoller.stop();
        processPoller = null;
    }

    // Progress bars: fill each indicator to its aria-valuenow (inline style
    // attributes can be blocked by Cockpit's CSP; setting style from JS is not).
    Array.prototype.forEach.call(document.querySelectorAll(".pf-v6-c-progress__bar[aria-valuenow]"), function (bar) {
        var indicator = bar.querySelector(".pf-v6-c-progress__indicator");
        var min = Number(bar.getAttribute("aria-valuemin")) || 0;
        var max = Number(bar.getAttribute("aria-valuemax")) || 100;
        var pct = (Number(bar.getAttribute("aria-valuenow")) - min) / (max - min) * 100;
        if (indicator)
            indicator.style.width = Math.max(0, Math.min(100, pct)) + "%";
    });

    App.menu.mount(MENU, {
        nav: "app-menu",
        startExpanded: true, // false = page loads with the menu collapsed
    });

    document.getElementById("test-events-btn").addEventListener("click", function () {
        var output = document.getElementById("test-events-output");
        var clientUuidEl = document.getElementById("test-events-client-uuid");
        var systemUuidEl = document.getElementById("test-events-system-uuid");
        var resultEl = document.getElementById("test-events-result");

        output.hidden = false;
        // App.uuid.v4() uses getRandomValues, so this works over http:// too.
        clientUuidEl.textContent = App.uuid.v4();
        systemUuidEl.textContent = "...";
        resultEl.textContent = "...";
        resultEl.style.color = "";

        // Code below pulls 16 random bytes from /dev/urandom and formats the output in UUIDv4 format (open an Issue if it fails)
        cockpit.spawn(["dd", "if=/dev/urandom", "bs=16", "count=1", "status=none"], { binary: true })
                .then(function (bytes) {
                    if (bytes.length !== 16)
                        throw new Error("expected 16 bytes from dd, got " + bytes.length);

                    systemUuidEl.textContent = App.uuid.fromBytes(bytes);
                    resultEl.textContent = "Success";
                    resultEl.style.color = "var(--pf-t--global--text--color--status--success--default)";
                })
                .catch(function (ex) {
                    console.error("Test Events: dd spawn failed:", ex);
                    systemUuidEl.textContent = "(failed)";
                    resultEl.textContent = "Failure: " + (ex.problem || ex.message || "unknown error");
                    resultEl.style.color = "var(--pf-t--global--text--color--status--danger--default)";
                });
    });
}());
