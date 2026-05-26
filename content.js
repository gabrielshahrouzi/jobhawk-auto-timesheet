console.log("✅ Content script loaded on JobHawk");

const FIELD_IDS = {
  day: "Skin_body_ManageTimesheetControl_Day1",
  startHour: "Skin_body_ManageTimesheetControl_StartHour1",
  startMinute: "Skin_body_ManageTimesheetControl_StartMinute1",
  startAmPm: "Skin_body_ManageTimesheetControl_StartAmPm1",
  endHour: "Skin_body_ManageTimesheetControl_EndHour1",
  endMinute: "Skin_body_ManageTimesheetControl_EndMinute1",
  endAmPm: "Skin_body_ManageTimesheetControl_EndAmPm1",
  addButton: "Skin_body_ManageTimesheetControl_tctl26",
};

function findElementInFrames(id) {
  console.log("[JobHawk Timesheet] Searching for element:", id);

  function searchInDocument(doc, location) {
    const element = doc.getElementById(id);
    if (element) {
      console.log("[JobHawk Timesheet] Found in", location, ":", id);
      return element;
    }

    const iframes = doc.querySelectorAll("iframe");
    console.log(
      "[JobHawk Timesheet] Searching",
      iframes.length,
      "iframe(s) in",
      location,
      "for:",
      id
    );

    for (let i = 0; i < iframes.length; i++) {
      try {
        const frameDoc =
          iframes[i].contentDocument || iframes[i].contentWindow?.document;
        if (!frameDoc) {
          continue;
        }

        const found = searchInDocument(
          frameDoc,
          `${location} > iframe ${i}`
        );
        if (found) {
          return found;
        }
      } catch (err) {
        console.warn(
          "[JobHawk Timesheet] Cannot access iframe",
          i,
          "in",
          location,
          ":",
          err.message
        );
      }
    }

    return null;
  }

  const result = searchInDocument(document, "main document");
  if (!result) {
    console.warn("[JobHawk Timesheet] Element not found:", id);
  }
  return result;
}

function dateStringToDay(dateValue) {
  const parts = dateValue.split("-");
  const day = parseInt(parts[2], 10);
  return String(day);
}

function setFieldValue(id, value) {
  const element = findElementInFrames(id);
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

  const day = dateStringToDay(data.date);
  console.log("[JobHawk Timesheet] Day from date:", day);

  setFieldValue(FIELD_IDS.day, day);
  setFieldValue(FIELD_IDS.startHour, data.start.hour);
  setFieldValue(FIELD_IDS.startMinute, data.start.minute);
  setFieldValue(FIELD_IDS.startAmPm, data.start.period);
  setFieldValue(FIELD_IDS.endHour, data.end.hour);
  setFieldValue(FIELD_IDS.endMinute, data.end.minute);
  setFieldValue(FIELD_IDS.endAmPm, data.end.period);

  const addButton = findElementInFrames(FIELD_IDS.addButton);
  if (!addButton) {
    console.error("[JobHawk Timesheet] Missing Add button:", FIELD_IDS.addButton);
    return { success: false, error: "Add button not found" };
  }

  addButton.click();
  console.log("[JobHawk Timesheet] Clicked Add button");

  return { success: true };
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
