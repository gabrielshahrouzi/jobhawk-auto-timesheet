const ADD_ENTRY_BUTTON_ID = "Skin_body_ManageTimesheetControl_ctl25";
const TIMESHEET_CONTROL_PREFIX = "Skin_body_ManageTimesheetControl_";
const PENDING_KEY = "pendingTimesheet";
const PENDING_NOTE_KEY = "jobhawkPendingNote";
const CREATING_ROW_KEY = "jobhawkCreatingRow";

const RESUME_DELAY_MS = 1200;
const POST_FORM_DELAY_MS = 800;
const PRE_CLICK_DELAY_MS = 500;
const FORM_WAIT_MS = 30000;
const ADD_BUTTON_WAIT_MS = 20000;
const NOTE_MODAL_WAIT_MS = 15000;
const NOTE_MODAL_CLOSE_WAIT_MS = 30000;

const NOTE_MODAL_ID = "tseNotesRefreshModel";
const NOTE_MODAL_TEXTAREA_ID = "Skin_body_txtTSERefreshNote";
const NOTE_MODAL_SUBMIT_ID = "Skin_body_Button1";

const FIELD_SUFFIXES = {
  day: "Day",
  startHour: "StartHour",
  startMinute: "StartMinute",
  startAmPm: "StartAmPm",
  endHour: "EndHour",
  endMinute: "EndMinute",
  endAmPm: "EndAmPm",
};

function buildFieldIds(rowIndex) {
  const ids = {};

  for (const [key, suffix] of Object.entries(FIELD_SUFFIXES)) {
    ids[key] = `${TIMESHEET_CONTROL_PREFIX}${suffix}${rowIndex}`;
  }

  return ids;
}

function formatDateForNoteAriaLabel(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const monthName = date.toLocaleDateString("en-US", { month: "long" });
  const dayPadded = String(day).padStart(2, "0");
  return `${weekday}, ${monthName} ${dayPadded}`;
}

function findNoteButtonForEntry(entry, rowIndex) {
  if (rowIndex) {
    const fields = buildFieldIds(rowIndex);
    const anchor =
      document.getElementById(fields.day) ||
      document.getElementById(fields.startHour);
    const row = anchor?.closest("tr");
    const inRow = row?.querySelector("button.open-tseNotesRefreshModel");
    if (inRow) {
      return inRow;
    }
  }

  const dateLabel = formatDateForNoteAriaLabel(entry.date);
  const candidates = [
    ...document.querySelectorAll("button.open-tseNotesRefreshModel"),
  ].filter((btn) => {
    const aria = btn.getAttribute("aria-label") || "";
    return aria.includes(dateLabel);
  });

  if (!candidates.length) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const withoutNote = candidates.filter(
    (btn) => !(btn.getAttribute("data-value") || "").trim()
  );
  if (withoutNote.length) {
    return withoutNote[withoutNote.length - 1];
  }

  return candidates[candidates.length - 1];
}

function waitForNoteButton(entry, rowIndex, callback, maxWaitMs, onTimeout) {
  const tryFind = () => {
    const btn = findNoteButtonForEntry(entry, rowIndex);
    if (btn) {
      callback(btn);
      return true;
    }
    return false;
  };

  if (tryFind()) {
    return;
  }

  const start = Date.now();
  const interval = setInterval(() => {
    if (tryFind()) {
      clearInterval(interval);
      return;
    }

    if (Date.now() - start > maxWaitMs) {
      clearInterval(interval);
      console.error("[JobHawk Timesheet] Timed out waiting for note button");
      onTimeout?.();
    }
  }, 100);
}

function isNoteModalVisible() {
  const modal = document.getElementById(NOTE_MODAL_ID);
  return modal?.classList.contains("show") ?? false;
}

function waitForNoteModalReady(callback, maxWaitMs = NOTE_MODAL_WAIT_MS) {
  const start = Date.now();

  const interval = setInterval(() => {
    const textarea = document.getElementById(NOTE_MODAL_TEXTAREA_ID);
    const modalOpen =
      isNoteModalVisible() ||
      (textarea && textarea.offsetParent !== null);
    if (textarea && modalOpen) {
      clearInterval(interval);
      callback(textarea);
      return;
    }

    if (Date.now() - start > maxWaitMs) {
      clearInterval(interval);
      console.error("[JobHawk Timesheet] Timed out waiting for note modal");
      callback(null);
    }
  }, 100);
}

function waitForNoteModalClosed(callback, maxWaitMs = NOTE_MODAL_CLOSE_WAIT_MS) {
  const start = Date.now();

  const interval = setInterval(() => {
    if (!isNoteModalVisible()) {
      clearInterval(interval);
      setTimeout(callback, POST_FORM_DELAY_MS);
      return;
    }

    if (Date.now() - start > maxWaitMs) {
      clearInterval(interval);
      callback();
    }
  }, 100);
}

function submitNoteViaModal(entry, openBtn, done) {
  console.log(
    "[JobHawk Timesheet] Opening note modal:",
    openBtn.getAttribute("data-id") || openBtn.getAttribute("aria-label")
  );

  openBtn.click();

  waitForNoteModalReady((textarea) => {
    if (!textarea) {
      done?.(false);
      return;
    }

    setFieldWithRetry(NOTE_MODAL_TEXTAREA_ID, entry.note, 0, (ok) => {
      if (!ok) {
        done?.(false);
        return;
      }

      const submitBtn = document.getElementById(NOTE_MODAL_SUBMIT_ID);
      if (!submitBtn) {
        console.error("[JobHawk Timesheet] Missing note submit button");
        done?.(false);
        return;
      }

      console.log("[JobHawk Timesheet] Submitting note via modal");
      localStorage.removeItem(PENDING_NOTE_KEY);
      submitBtn.click();

      waitForNoteModalClosed(() => {
        done?.(true);
      });
    });
  });
}

function stashPendingNote(entry, rowIndex) {
  if (!entry.note) {
    localStorage.removeItem(PENDING_NOTE_KEY);
    return;
  }

  localStorage.setItem(
    PENDING_NOTE_KEY,
    JSON.stringify({
      note: entry.note,
      rowIndex,
      date: entry.date,
      start: entry.start,
      end: entry.end,
    })
  );
}

function applyNoteToAddedRow(entry, rowIndexBeforeAdd, done) {
  if (!entry.note) {
    localStorage.removeItem(PENDING_NOTE_KEY);
    done?.();
    return;
  }

  waitForNoteButton(
    entry,
    rowIndexBeforeAdd,
    (openBtn) => {
      submitNoteViaModal(entry, openBtn, (ok) => {
        if (!ok) {
          console.warn("[JobHawk Timesheet] Could not save note via modal");
        }
        done?.();
      });
    },
    FORM_WAIT_MS,
    () => {
      localStorage.removeItem(PENDING_NOTE_KEY);
      done?.();
    }
  );
}

function applyStoredPendingNote(done) {
  const raw = localStorage.getItem(PENDING_NOTE_KEY);
  if (!raw) {
    done();
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    localStorage.removeItem(PENDING_NOTE_KEY);
    done();
    return;
  }

  const entry = {
    date: payload.date,
    start: payload.start,
    end: payload.end,
    note: payload.note || "",
  };

  if (!entry.note) {
    localStorage.removeItem(PENDING_NOTE_KEY);
    done();
    return;
  }

  applyNoteToAddedRow(entry, payload.rowIndex, done);
}

function isOnAddPage() {
  const addParam = new URL(window.location.href).searchParams.get("add");
  return addParam?.toLowerCase() === "true";
}

function findAddNewEntryLink() {
  return (
    document.querySelector('a[title="Add a New Entry"]') ||
    [...document.querySelectorAll("a")].find(
      (link) => link.textContent.trim() === "Add New Entry"
    ) ||
    null
  );
}

function getControlLabel(element) {
  return (element.value || element.textContent || element.innerText || "").trim();
}

function isSubmitTimesheetButton(element) {
  const label = getControlLabel(element);
  const id = element.id || "";

  if (id.includes("tctl26")) {
    return true;
  }

  return /submit/i.test(label) && /timesheet/i.test(label);
}

function isClickableButton(element) {
  return !!(element && !element.disabled);
}

function findAddEntryButton() {
  const exact = document.getElementById(ADD_ENTRY_BUTTON_ID);
  if (exact) {
    return exact;
  }

  const byName = document.querySelector(
    'input[name*="ManageTimesheetControl"][value="Add"]'
  );
  if (byName && !isSubmitTimesheetButton(byName)) {
    return byName;
  }

  const controls = document.querySelectorAll(
    `[id^="${TIMESHEET_CONTROL_PREFIX}ctl"]`
  );

  for (const element of controls) {
    const tag = element.tagName;
    if (tag !== "INPUT" && tag !== "BUTTON") {
      continue;
    }

    const type = (element.getAttribute("type") || "").toLowerCase();
    if (type === "hidden") {
      continue;
    }

    if (getControlLabel(element) === "Add" && !isSubmitTimesheetButton(element)) {
      return element;
    }
  }

  const fallback = [...document.querySelectorAll(
    'input[type="submit"], input[type="button"], button'
  )].find(
    (element) =>
      (element.id || "").includes("ManageTimesheetControl") &&
      getControlLabel(element) === "Add" &&
      !isSubmitTimesheetButton(element)
  );

  return fallback || null;
}

function logFormProbe() {
  const row1 = buildFieldIds(1);
  const addBtn = findAddEntryButton();
  console.log("[JobHawk Timesheet] Form probe:", {
    url: window.location.href,
    addParam: new URL(window.location.href).searchParams.get("add"),
    day1: !!document.getElementById(row1.day),
    startHour1: !!document.getElementById(row1.startHour),
    addBtnId: addBtn?.id || null,
    addBtnCtl25: !!document.getElementById(ADD_ENTRY_BUTTON_ID),
    addLink: !!findAddNewEntryLink(),
    detectedRow: detectFillableRowIndex(),
  });
}

function formatDateForDropdown(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} 12:00:00 AM`;
}

function setFieldValue(id, value) {
  const element = document.getElementById(id);
  if (!element) {
    console.error("[JobHawk Timesheet] Missing element:", id);
    return false;
  }

  element.value = String(value);
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("input", { bubbles: true }));
  console.log("[JobHawk Timesheet] Set", id, "=", value);
  return true;
}

function valuesMatch(element, expected) {
  if (!element) {
    return false;
  }

  const actual = String(element.value).trim();
  const target = String(expected).trim();

  if (actual === target) {
    return true;
  }

  if (/^\d+$/.test(actual) && /^\d+$/.test(target)) {
    return parseInt(actual, 10) === parseInt(target, 10);
  }

  return false;
}

function setFieldWithRetry(id, value, attempt, done) {
  setFieldValue(id, value);
  const element = document.getElementById(id);
  const matches = valuesMatch(element, value);

  if (matches || attempt >= 5) {
    if (!matches) {
      console.warn("[JobHawk Timesheet] Could not confirm", id, "=", value);
    }
    done(matches);
    return;
  }

  setTimeout(() => setFieldWithRetry(id, value, attempt + 1, done), 200);
}

function snapMinuteToQuarter(minutes) {
  const snapped = Math.round(minutes / 15) * 15;
  return snapped === 60 ? 0 : snapped;
}

function parseISOTime(isoString) {
  const date = new Date(isoString);

  let hours = date.getHours();
  const minutes = String(snapMinuteToQuarter(date.getMinutes())).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  if (hours === 0) {
    hours = 12;
  }

  return {
    hour: String(hours),
    minute: minutes,
    period,
  };
}

function normalizeEntry(data) {
  const date =
    data.date ||
    (data.start ? new Date(data.start).toISOString().slice(0, 10) : null);

  return {
    date,
    start: data.start,
    end: data.end,
    note: data.note || "",
  };
}

function normalizeQueue(data) {
  let entries = Array.isArray(data) ? [...data] : [data];

  if (Array.isArray(entries[0]) && entries[0].length) {
    console.log("[JobHawk Timesheet] Flattening nested entries array");
    entries = entries[0];
  }

  return entries
    .map(normalizeEntry)
    .filter((entry) => entry.date && entry.start && entry.end);
}

function navigateToAddEntry() {
  const url = new URL(window.location.href);
  url.searchParams.set("add", "true");
  window.location.href = url.toString();
}

function rowLooksEmpty(rowIndex) {
  const day = document.getElementById(buildFieldIds(rowIndex).day);
  const startHour = document.getElementById(buildFieldIds(rowIndex).startHour);

  if (!day || !startHour) {
    return false;
  }

  const startEmpty =
    !startHour.value || startHour.value === "" || startHour.value === "0";
  const dayEmpty = !day.value || day.value === "";

  return startEmpty || dayEmpty;
}

function detectFillableRowIndex() {
  let lastRow = null;
  let emptyRow = null;

  for (let i = 1; i <= 20; i += 1) {
    const fields = buildFieldIds(i);
    const day = document.getElementById(fields.day);
    const startHour = document.getElementById(fields.startHour);

    if (!day || !startHour) {
      break;
    }

    lastRow = i;
    if (rowLooksEmpty(i)) {
      emptyRow = i;
    }
  }

  if (emptyRow ?? lastRow) {
    return emptyRow ?? lastRow;
  }

  if (document.getElementById(buildFieldIds(1).startHour)) {
    return 1;
  }

  return null;
}

function getFormContext() {
  const rowIndex = detectFillableRowIndex();
  if (!rowIndex) {
    return null;
  }

  const fields = buildFieldIds(rowIndex);
  const day = document.getElementById(fields.day);
  const startHour = document.getElementById(fields.startHour);

  if (!startHour) {
    return null;
  }

  return {
    rowIndex,
    fields,
    addBtn: findAddEntryButton(),
  };
}

function isFormReady() {
  return getFormContext() !== null;
}

function waitForFormReady(callback, maxWaitMs = FORM_WAIT_MS, onTimeout) {
  const tryReady = () => {
    const ctx = getFormContext();
    if (ctx) {
      localStorage.removeItem(CREATING_ROW_KEY);
      callback(ctx);
      return true;
    }
    return false;
  };

  if (tryReady()) {
    return;
  }

  const start = Date.now();
  let lastProbe = 0;

  const interval = setInterval(() => {
    if (Date.now() - lastProbe > 3000) {
      lastProbe = Date.now();
      logFormProbe();
    }

    if (tryReady()) {
      clearInterval(interval);
      return;
    }

    if (Date.now() - start > maxWaitMs) {
      clearInterval(interval);
      logFormProbe();
      console.error("[JobHawk Timesheet] Timed out waiting for form");
      if (onTimeout) {
        onTimeout();
      }
    }
  }, 100);
}

function waitForAddButton(callback, maxWaitMs = ADD_BUTTON_WAIT_MS) {
  const start = Date.now();

  const interval = setInterval(() => {
    const btn = findAddEntryButton();

    if (btn && isClickableButton(btn)) {
      clearInterval(interval);
      console.log("[JobHawk Timesheet] Found Add button:", btn.id || btn.name);
      callback(btn);
      return;
    }

    if (Date.now() - start > maxWaitMs) {
      clearInterval(interval);
      const addCandidates = [
        ...document.querySelectorAll(
          `[id^="${TIMESHEET_CONTROL_PREFIX}ctl"]`
        ),
      ]
        .filter((el) => getControlLabel(el) === "Add")
        .map((el) => ({ id: el.id, disabled: el.disabled, tag: el.tagName }));

      console.error("[JobHawk Timesheet] Timed out waiting for Add button", {
        ctl25: !!document.getElementById(ADD_ENTRY_BUTTON_ID),
        candidates: addCandidates,
      });
    }
  }, 100);
}

function getFieldSpecs(entry, fields) {
  const formattedDate = formatDateForDropdown(entry.date);
  const start = parseISOTime(entry.start);
  const end = parseISOTime(entry.end);

  return [
    [fields.day, formattedDate],
    [fields.startHour, start.hour],
    [fields.startMinute, start.minute],
    [fields.startAmPm, start.period],
    [fields.endHour, end.hour],
    [fields.endMinute, end.minute],
    [fields.endAmPm, end.period],
  ];
}

function fieldsLookFilled(entry, fields) {
  const specs = getFieldSpecs(entry, fields);

  return specs.every(([id, value]) => {
    const element = document.getElementById(id);
    return valuesMatch(element, value);
  });
}

function fillFieldsSequential(entry, fields, done) {
  const specs = getFieldSpecs(entry, fields);
  const formattedDate = specs[0][1];
  const start = parseISOTime(entry.start);
  const end = parseISOTime(entry.end);

  console.log(
    `[JobHawk Timesheet] Filling row ${fields.day.match(/(\d+)$/)?.[1] || "?"}`
  );
  console.log("[JobHawk Timesheet] Setting date:", formattedDate);
  console.log("[JobHawk Timesheet] Setting times:", start, end);

  let index = 0;

  function setNext() {
    if (index >= specs.length) {
      done();
      return;
    }

    const [id, value] = specs[index];
    setFieldWithRetry(id, value, 0, () => {
      index += 1;
      setNext();
    });
  }

  setNext();
}

function fillAndSubmit(entry, remainingEntries, fields, rowIndex) {
  console.log("[JobHawk Timesheet] Filling entry…");

  fillFieldsSequential(entry, fields, () => {
    const verifyAndClick = (attempt = 0) => {
      if (!fieldsLookFilled(entry, fields)) {
        if (attempt < 4) {
          console.log("[JobHawk Timesheet] Re-checking fields…", attempt + 1);
          fillFieldsSequential(entry, fields, () => {
            setTimeout(() => verifyAndClick(attempt + 1), 400);
          });
          return;
        }

        console.error(
          "[JobHawk Timesheet] Fields did not stick — not clicking Add"
        );
        window.__JOBHAWK_FILLING = false;
        return;
      }

      console.log("[JobHawk Timesheet] Fields verified — clicking Add");

      Object.values(fields).forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("blur", { bubbles: true }));
        }
      });

      waitForAddButton((addBtn) => {
        setTimeout(() => {
          stashPendingNote(entry, rowIndex);
          remainingEntries.shift();

          if (remainingEntries.length > 0) {
            localStorage.setItem(
              PENDING_KEY,
              JSON.stringify(remainingEntries)
            );
            localStorage.setItem(CREATING_ROW_KEY, "true");
            console.log(
              `[JobHawk Timesheet] ${remainingEntries.length} entries left — will open new row after reload`
            );
          } else {
            localStorage.removeItem(PENDING_KEY);
            localStorage.removeItem(CREATING_ROW_KEY);
            console.log("[JobHawk Timesheet] All entries done");
          }

          window.__JOBHAWK_FILLING = false;
          addBtn.click();
          applyNoteToAddedRow(entry, rowIndex);
        }, PRE_CLICK_DELAY_MS);
      });
    };

    setTimeout(() => verifyAndClick(0), 300);
  });
}

function beginFill(entries) {
  waitForFormReady(
    (ctx) => {
      console.log(
        `[JobHawk Timesheet] Form ready on row ${ctx.rowIndex} — filling after delay`
      );
      setTimeout(
        () => fillAndSubmit(entries[0], entries, ctx.fields, ctx.rowIndex),
        POST_FORM_DELAY_MS
      );
    },
    FORM_WAIT_MS,
    () => {
      const link = findAddNewEntryLink();
      if (link) {
        console.log(
          "[JobHawk Timesheet] Form missing — clicking Add New Entry link"
        );
        localStorage.setItem(PENDING_KEY, JSON.stringify(entries));
        window.__JOBHAWK_FILLING = false;
        link.click();
        return;
      }

      console.error("[JobHawk Timesheet] Form not found — retrying add=true");
      window.__JOBHAWK_FILLING = false;
      openAddPageForQueue(entries, true);
    }
  );
}

function openAddPageForQueue(entries, forceNavigate = false) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(entries));
  localStorage.setItem(CREATING_ROW_KEY, "true");
  window.__JOBHAWK_FILLING = false;

  if (!forceNavigate) {
    const link = findAddNewEntryLink();
    if (link) {
      console.log("[JobHawk Timesheet] Clicking Add New Entry link");
      link.click();
      return;
    }
  }

  console.log("[JobHawk Timesheet] Navigating to add=true");
  navigateToAddEntry();
}

function processNextEntry(entries) {
  if (!entries.length) {
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(PENDING_NOTE_KEY);
    localStorage.removeItem(CREATING_ROW_KEY);
    window.__JOBHAWK_FILLING = false;
    return;
  }

  if (window.__JOBHAWK_FILLING) {
    console.log("[JobHawk Timesheet] Already filling, skipping duplicate");
    return;
  }

  window.__JOBHAWK_FILLING = true;

  console.log(
    `[JobHawk Timesheet] Processing entry (1 of ${entries.length} remaining)`
  );
  console.log("[JobHawk Timesheet] On add page:", isOnAddPage());

  localStorage.setItem(PENDING_KEY, JSON.stringify(entries));

  if (!isOnAddPage()) {
    openAddPageForQueue(entries);
    return;
  }

  beginFill(entries);
}

function fillTimesheet(data) {
  const entries = normalizeQueue(data);

  if (!entries.length) {
    return { success: false, error: "No valid entries to fill" };
  }

  localStorage.removeItem(CREATING_ROW_KEY);
  localStorage.removeItem(PENDING_NOTE_KEY);
  window.__JOBHAWK_FILLING = false;
  localStorage.setItem(PENDING_KEY, JSON.stringify(entries));
  processNextEntry(entries);

  return {
    success: true,
    message: `Filling ${entries.length} entries…`,
  };
}

const cancelBtn = document.querySelector('input[value="Cancel"]');
if (cancelBtn) {
  cancelBtn.addEventListener("click", () => {
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(PENDING_NOTE_KEY);
    localStorage.removeItem(CREATING_ROW_KEY);
    window.__JOBHAWK_FILLING = false;
    console.log("[JobHawk Timesheet] Autofill canceled");
  });
}

function scheduleResume() {
  const pending = localStorage.getItem(PENDING_KEY);
  const pendingNote = localStorage.getItem(PENDING_NOTE_KEY);
  if (!pending && !pendingNote) {
    localStorage.removeItem(CREATING_ROW_KEY);
    return;
  }

  const run = () => {
    applyStoredPendingNote(() => {
      const stillPending = localStorage.getItem(PENDING_KEY);
      if (!stillPending) {
        localStorage.removeItem(CREATING_ROW_KEY);
        return;
      }

      const entries = normalizeQueue(JSON.parse(stillPending));
      console.log(
        "[JobHawk Timesheet] Resuming queued entries:",
        entries.length
      );
      logFormProbe();

      if (isFormReady()) {
        processNextEntry(entries);
        return;
      }

      if (!isOnAddPage()) {
        openAddPageForQueue(entries);
        return;
      }

      processNextEntry(entries);
    });
  };

  if (document.readyState === "complete") {
    setTimeout(run, RESUME_DELAY_MS);
  } else {
    window.addEventListener(
      "load",
      () => setTimeout(run, RESUME_DELAY_MS),
      { once: true }
    );
  }
}

scheduleResume();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "fillTimesheet") {
    return;
  }

  try {
    const result = fillTimesheet(message.data);
    sendResponse(result);
  } catch (err) {
    console.error("[JobHawk Timesheet] Fill failed:", err);
    sendResponse({ success: false, error: err.message });
  }

  return true;
});
