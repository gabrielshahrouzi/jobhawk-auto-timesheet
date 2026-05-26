console.log("✅ content.js loaded on JobHawk");

const FIELD_IDS = {
  day: "Skin_body_ManageTimesheetControl_Day1",
  startHour: "Skin_body_ManageTimesheetControl_StartHour1",
  startMinute: "Skin_body_ManageTimesheetControl_StartMinute1",
  startAmPm: "Skin_body_ManageTimesheetControl_StartAmPm1",
  endHour: "Skin_body_ManageTimesheetControl_EndHour1",
  endMinute: "Skin_body_ManageTimesheetControl_EndMinute1",
  endAmPm: "Skin_body_ManageTimesheetControl_EndAmPm1",
};

const ADD_ENTRY_BUTTON_ID = "Skin_body_ManageTimesheetControl_ctl25";
const PENDING_KEY = "pendingTimesheet";
const CREATING_ROW_KEY = "jobhawkCreatingRow";

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
  console.log("[JobHawk Timesheet] Set", id, "=", value);
  return true;
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

function isFormReady() {
  const day = document.getElementById(FIELD_IDS.day);
  const start = document.getElementById(FIELD_IDS.startHour);
  const addBtn = document.getElementById(ADD_ENTRY_BUTTON_ID);
  return !!(day && start && addBtn);
}

function waitForFormReady(callback, maxWaitMs = 8000, onTimeout) {
  const start = Date.now();

  const interval = setInterval(() => {
    if (Date.now() - start > maxWaitMs) {
      clearInterval(interval);
      console.error("[JobHawk Timesheet] Timed out waiting for form");
      if (onTimeout) {
        onTimeout();
      }
      return;
    }

    if (isFormReady()) {
      clearInterval(interval);
      localStorage.removeItem(CREATING_ROW_KEY);
      callback();
    }
  }, 100);
}

function waitForTimeFieldsStable(callback, maxWaitMs = 5000) {
  let lastValue = null;
  let stableCount = 0;
  const start = Date.now();

  const interval = setInterval(() => {
    if (Date.now() - start > maxWaitMs) {
      clearInterval(interval);
      callback();
      return;
    }

    const startHour = document.getElementById(FIELD_IDS.startHour);
    if (!startHour) {
      return;
    }

    const currentValue = startHour.value;
    if (currentValue === lastValue) {
      stableCount++;
      if (stableCount >= 3) {
        clearInterval(interval);
        callback();
      }
    } else {
      stableCount = 0;
      lastValue = currentValue;
    }
  }, 100);
}

function waitForAddButton(callback, maxWaitMs = 5000) {
  const start = Date.now();

  const interval = setInterval(() => {
    if (Date.now() - start > maxWaitMs) {
      clearInterval(interval);
      console.error("[JobHawk Timesheet] Timed out waiting for Add button");
      return;
    }

    const btn = document.getElementById(ADD_ENTRY_BUTTON_ID);
    if (btn) {
      clearInterval(interval);
      callback(btn);
    }
  }, 100);
}

function fillFields(entry) {
  const formattedDate = formatDateForDropdown(entry.date);
  const start = parseISOTime(entry.start);
  const end = parseISOTime(entry.end);

  console.log("[JobHawk Timesheet] Setting date:", formattedDate);
  console.log("[JobHawk Timesheet] Setting times:", start, end);

  setFieldValue(FIELD_IDS.day, formattedDate);
  setFieldValue(FIELD_IDS.startHour, start.hour);
  setFieldValue(FIELD_IDS.startMinute, start.minute);
  setFieldValue(FIELD_IDS.startAmPm, start.period);
  setFieldValue(FIELD_IDS.endHour, end.hour);
  setFieldValue(FIELD_IDS.endMinute, end.minute);
  setFieldValue(FIELD_IDS.endAmPm, end.period);
}

function fillAndSubmit(entry, remainingEntries) {
  waitForTimeFieldsStable(() => {
    fillFields(entry);

    setTimeout(() => {
      waitForAddButton((addBtn) => {
        setTimeout(() => {
          remainingEntries.shift();

          if (remainingEntries.length > 0) {
            localStorage.setItem(
              PENDING_KEY,
              JSON.stringify(remainingEntries)
            );
            console.log(
              `[JobHawk Timesheet] ${remainingEntries.length} entries left`
            );
          } else {
            localStorage.removeItem(PENDING_KEY);
            localStorage.removeItem(CREATING_ROW_KEY);
            console.log("[JobHawk Timesheet] All entries done");
          }

          addBtn.click();
        }, 400);
      });
    }, 300);
  });
}

function processNextEntry(entries) {
  if (!entries.length) {
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(CREATING_ROW_KEY);
    return;
  }

  const current = entries[0];
  console.log(
    `[JobHawk Timesheet] Processing entry (1 of ${entries.length} remaining)`
  );

  if (!isFormReady()) {
    const creating = localStorage.getItem(CREATING_ROW_KEY) === "true";

    if (!creating) {
      console.log("[JobHawk Timesheet] Creating new row");
      localStorage.setItem(CREATING_ROW_KEY, "true");
      localStorage.setItem(PENDING_KEY, JSON.stringify(entries));
      navigateToAddEntry();
      return;
    }

    console.log("[JobHawk Timesheet] Waiting for row to load…");
    waitForFormReady(
      () => {
        console.log("[JobHawk Timesheet] Row loaded — filling");
        fillAndSubmit(entries[0], entries);
      },
      8000,
      () => {
        console.log("[JobHawk Timesheet] Retry navigation");
        localStorage.removeItem(CREATING_ROW_KEY);
        processNextEntry(entries);
      }
    );
    return;
  }

  waitForFormReady(() => {
    fillAndSubmit(current, entries);
  });
}

function fillTimesheet(data) {
  const entries = normalizeQueue(data);

  if (!entries.length) {
    return { success: false, error: "No valid entries to fill" };
  }

  localStorage.removeItem(CREATING_ROW_KEY);
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
    localStorage.removeItem(CREATING_ROW_KEY);
    console.log("[JobHawk Timesheet] Autofill canceled");
  });
}

const pending = localStorage.getItem(PENDING_KEY);
if (!pending) {
  localStorage.removeItem(CREATING_ROW_KEY);
}

if (pending && !window.__JOBHAWK_RESUME_RUNNING) {
  window.__JOBHAWK_RESUME_RUNNING = true;
  console.log("[JobHawk Timesheet] Resuming queued entries");
  setTimeout(() => {
    processNextEntry(normalizeQueue(JSON.parse(pending)));
    window.__JOBHAWK_RESUME_RUNNING = false;
  }, 200);
}

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
