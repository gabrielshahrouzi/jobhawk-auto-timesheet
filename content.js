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

function fillTimesheet(data) {
  console.log("[JobHawk Timesheet] Filling timesheet with:", data);

  const startHourField = document.getElementById(FIELD_IDS.startHour);

  if (!startHourField) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(data));
    console.log("[JobHawk Timesheet] Saved pending data, navigating to add entry");

    const url = new URL(window.location.href);
    url.searchParams.set("add", "true");
    window.location.href = url.toString();
    return { success: true };
  }

  const formattedDate = formatDateForDropdown(data.date);
  console.log("[JobHawk Timesheet] Formatted date:", formattedDate);

  setFieldValue(FIELD_IDS.day, formattedDate);
  setFieldValue(FIELD_IDS.startHour, data.start.hour);
  setFieldValue(FIELD_IDS.startMinute, data.start.minute);
  setFieldValue(FIELD_IDS.startAmPm, data.start.period);
  setFieldValue(FIELD_IDS.endHour, data.end.hour);
  setFieldValue(FIELD_IDS.endMinute, data.end.minute);
  setFieldValue(FIELD_IDS.endAmPm, data.end.period);

  const addBtn = document.getElementById(ADD_ENTRY_BUTTON_ID);
  if (addBtn) {
    addBtn.click();
    console.log("✅ Added entry to table");
  } else {
    console.error("❌ Add button not found");
    return { success: false, error: "Add button not found" };
  }

  return { success: true };
}

const saved = localStorage.getItem(PENDING_KEY);
if (saved) {
  console.log("[JobHawk Timesheet] Resuming after reload");
  localStorage.removeItem(PENDING_KEY);
  fillTimesheet(JSON.parse(saved));
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
