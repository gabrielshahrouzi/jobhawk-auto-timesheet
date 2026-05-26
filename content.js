console.log("✅ content.js loaded on JobHawk");

const PENDING_KEY = "pendingTimesheet";

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

function parseISOTime(isoString) {
  const date = new Date(isoString);

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");

  const period = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  if (hours === 0) hours = 12;

  return {
    hour: String(hours),
    minute: minutes,
    period,
  };
}

function navigateToAddEntry() {
  const url = new URL(window.location.href);
  url.searchParams.set("add", "true");
  window.location.href = url.toString();
}

const cancelBtn = document.querySelector('input[value="Cancel"]');
if (cancelBtn) {
  cancelBtn.addEventListener("click", () => {
    localStorage.removeItem("pendingTimesheet");
    console.log("🛑 Autofill canceled");
  });
}

function normalizeEntries(entriesOrEntry) {
  if (Array.isArray(entriesOrEntry)) {
    return entriesOrEntry;
  }
  return [entriesOrEntry];
}

function fillTimesheet(entriesOrEntry, isResuming = false) {
  const entries = normalizeEntries(entriesOrEntry);
  const current = entries[0];

  if (!current) {
    localStorage.removeItem(PENDING_KEY);
    return { success: true };
  }

  console.log("[JobHawk Timesheet] Filling timesheet with entry:", current);

  const startHourField = document.getElementById(FIELD_IDS.startHour);

  if (!startHourField) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(entries));
    console.log("Navigating to Add Entry page");
    navigateToAddEntry();
    return { success: true };
  }

  const formattedDate = formatDateForDropdown(current.date);
  console.log("[JobHawk Timesheet] Formatted date:", formattedDate);

  const start = parseISOTime(current.start);
  const end = parseISOTime(current.end);

  setFieldValue(FIELD_IDS.day, formattedDate);

  setFieldValue(FIELD_IDS.startHour, start.hour);
  setFieldValue(FIELD_IDS.startMinute, start.minute);
  setFieldValue(FIELD_IDS.startAmPm, start.period);

  setFieldValue(FIELD_IDS.endHour, end.hour);
  setFieldValue(FIELD_IDS.endMinute, end.minute);
  setFieldValue(FIELD_IDS.endAmPm, end.period);

  function waitForAddButton(callback) {
    const interval = setInterval(() => {
      const btn = document.getElementById(ADD_ENTRY_BUTTON_ID);

      if (btn) {
        clearInterval(interval);
        callback(btn);
      }
    }, 100);
  }

  waitForAddButton((addBtn) => {
    addBtn.click();
    console.log("✅ Added entry to table");

    entries.shift();
    if (entries.length > 0) {
      localStorage.setItem(PENDING_KEY, JSON.stringify(entries));
      console.log("Waiting for page reload to process next entry");
      return;
    }

    localStorage.removeItem(PENDING_KEY);
    console.log("[JobHawk Timesheet] All entries processed");
  });

  return { success: true };
}

const saved = localStorage.getItem(PENDING_KEY);
if (saved) {
  console.log("Resuming after reload");

  const entries = JSON.parse(saved);

  const interval = setInterval(() => {
    const ready = document.getElementById(
      "Skin_body_ManageTimesheetControl_Day1"
    );

    if (ready) {
      clearInterval(interval);
      console.log("Form ready → continuing batch");
      fillTimesheet(entries, true);
    }
  }, 100);
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
