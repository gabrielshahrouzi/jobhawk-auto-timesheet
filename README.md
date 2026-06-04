# JobHawk Auto Timesheet

A Chrome extension that logs work sessions locally and fills them into the [JobHawk](https://jobhawk.studentemployment.ngwebsolutions.com/) student employment timesheet.

## Features

- **Log sessions** — Record date, start/end time (15-minute increments), and an optional note.
- **Saved entries** — View, edit, or delete logged sessions from the popup.
- **Fill timesheet** — Automatically enter all saved sessions on the JobHawk timesheet page (open that tab first, then click **Fill Timesheet**).
- **Hours summary** — See total hours across all entries and a per-week breakdown (Monday–Sunday).
- **Import / export** — Back up or restore entries as **CSV**; export a printable **PDF** report. CSV import supports merge or replace.
- **Local storage only** — Data stays in your browser via Chrome storage; nothing is sent to external servers.

## Installation

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the **`src`** folder (the directory that contains `manifest.json`).
5. Pin the extension from the toolbar if you like.

After code changes, click **Reload** on the extension card on `chrome://extensions`.

## Usage

1. Click the extension icon to open the popup.
2. Choose a **date**, set **start** and **end** times, add a **note** if needed, then click **Log Session**.
3. When you are ready to submit on JobHawk, open the timesheet page in a tab, open the popup, and click **Fill Timesheet**.
4. Review the filled form on JobHawk before submitting.

### Import / export

- **Export CSV** / **Export PDF** — Downloads a backup or report of all saved entries.
- **Import CSV (merge)** — Adds rows from a CSV file to existing entries.
- **Import CSV (replace)** — Replaces all saved entries with the file (you will be asked to confirm).

Exported CSV uses columns: `date`, `start`, `end`, `hours`, `note`. Use the same format for import.

## Project structure

```
jobhawk-auto-timesheet/
├── README.md
├── privacy.md          # Privacy policy
└── src/
    ├── manifest.json   # Extension manifest (MV3)
    ├── popup.html      # Popup UI
    ├── popup.js        # Logging, storage, summary, UI logic
    ├── import-export.js
    ├── content.js      # JobHawk page automation
    └── icons/          # Extension icons
```

Load the extension from **`src`**, not the repository root.

## Permissions

| Permission   | Why |
|-------------|-----|
| `storage`   | Save timesheet entries locally |
| `activeTab` | Run fill logic on the current JobHawk tab |
| `scripting` | Inject the content script when filling |
| JobHawk host | Operate only on the JobHawk site |

See [privacy.md](privacy.md) for how data is handled.

## Development

No build step or dependencies. Edit files under `src/`, reload the extension in Chrome, and test on the JobHawk timesheet site.

## License

No license file is included yet. Add one if you plan to distribute this project publicly.
