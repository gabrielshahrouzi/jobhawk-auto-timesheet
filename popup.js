const STORAGE_KEY = "entries";

const form = document.getElementById("log-form");
const dateInput = document.getElementById("date");
const logTimeFieldsEl = document.getElementById("log-time-fields");
const noteInput = document.getElementById("note");
const logBtn = document.getElementById("log-btn");
const messageEl = document.getElementById("message");
const entriesListEl = document.getElementById("entries-list");

const QUARTER_MINUTES = ["00", "15", "30", "45"];
const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
const PERIODS = ["AM", "PM"];

let entries = [];
let editingIndex = null;
let logStartTime;
let logEndTime;

// --- Messages ---

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = type || "";
}

// --- Date helpers ---

function getTodayDateString() {
  return isoToDateString(new Date().toISOString());
}

function isoToDateString(isoString) {
  const date = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getEntryDate(entry) {
  return entry.date || isoToDateString(entry.start);
}

// --- Time formatting ---

function formatTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "Invalid time";
  }
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// --- Time parts & selectors ---

function snapDateToQuarterHour(date) {
  const quarterMs = 15 * 60 * 1000;
  return new Date(Math.round(date.getTime() / quarterMs) * quarterMs);
}

function dateToTimeParts(date) {
  const snapped = snapDateToQuarterHour(date);
  const hours24 = snapped.getHours();
  const minute = String(snapped.getMinutes()).padStart(2, "0");
  const period = hours24 >= 12 ? "PM" : "AM";
  let hour12 = hours24 % 12;
  if (hour12 === 0) {
    hour12 = 12;
  }

  return {
    hour: String(hour12),
    minute,
    period,
  };
}

function combineDateAndTimeParts(dateValue, parts) {
  const [year, month, day] = dateValue.split("-").map(Number);
  let hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const period = parts.period;

  if (period === "AM") {
    if (hour === 12) {
      hour = 0;
    }
  } else if (hour !== 12) {
    hour += 12;
  }

  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function fillSelect(selectEl, options, selectedValue) {
  selectEl.innerHTML = "";
  for (const value of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    if (value === selectedValue) {
      option.selected = true;
    }
    selectEl.appendChild(option);
  }
}

function createTimeSelector(labelText, baseIso, idPrefix, getDateValue) {
  const parts = dateToTimeParts(new Date(baseIso));

  const label = document.createElement("label");
  label.textContent = labelText;

  const row = document.createElement("div");
  row.className = "time-row";

  const hourSelect = document.createElement("select");
  hourSelect.className = "time-select time-hour";
  hourSelect.id = `${idPrefix}-hour`;
  hourSelect.setAttribute("aria-label", `${labelText} hour`);
  fillSelect(hourSelect, HOURS_12, parts.hour);

  const minuteSelect = document.createElement("select");
  minuteSelect.className = "time-select time-minute";
  minuteSelect.id = `${idPrefix}-minute`;
  minuteSelect.setAttribute("aria-label", `${labelText} minute`);
  fillSelect(minuteSelect, QUARTER_MINUTES, parts.minute);

  const periodSelect = document.createElement("select");
  periodSelect.className = "time-select time-period";
  periodSelect.id = `${idPrefix}-period`;
  periodSelect.setAttribute("aria-label", `${labelText} AM/PM`);
  fillSelect(periodSelect, PERIODS, parts.period);

  row.append(hourSelect, minuteSelect, periodSelect);

  function getParts() {
    return {
      hour: hourSelect.value,
      minute: minuteSelect.value,
      period: periodSelect.value,
    };
  }

  function getDate() {
    const dateValue = getDateValue();
    return combineDateAndTimeParts(dateValue, getParts());
  }

  function setFromIso(isoString) {
    const next = dateToTimeParts(new Date(isoString));
    hourSelect.value = next.hour;
    minuteSelect.value = next.minute;
    periodSelect.value = next.period;
  }

  return { label, row, getDate, getParts, setFromIso };
}

// --- Entry helpers ---

function calculateHoursFromTimestamps(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const diffMs = end.getTime() - start.getTime();
  return diffMs / (1000 * 60 * 60);
}

function createEntry(dateValue, startIso, endIso, note) {
  return {
    date: dateValue,
    start: startIso,
    end: endIso,
    hours: calculateHoursFromTimestamps(startIso, endIso),
    note: note.trim(),
  };
}

function buildUpdatedEntry(entry, startIso, endIso, note) {
  return {
    ...entry,
    date: isoToDateString(startIso),
    start: startIso,
    end: endIso,
    hours: calculateHoursFromTimestamps(startIso, endIso),
    note: note.trim(),
  };
}

function getDefaultLogTimes(dateValue) {
  const now = snapDateToQuarterHour(new Date());
  const end = combineDateAndTimeParts(dateValue, dateToTimeParts(now));
  const start = new Date(end.getTime() - 60 * 60 * 1000);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function getSortedIndices() {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => new Date(b.entry.end) - new Date(a.entry.end));
}

// --- Storage ---

async function loadEntries() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY];
  entries = Array.isArray(stored) ? stored : [];
  return entries;
}

async function saveEntries() {
  await chrome.storage.local.set({ [STORAGE_KEY]: entries });
}

async function addEntry(entry) {
  entries.push(entry);
  await saveEntries();
  return entries;
}

async function deleteEntryAt(index) {
  if (index < 0 || index >= entries.length) {
    return;
  }
  entries.splice(index, 1);
  await saveEntries();
}

async function updateEntryAt(index, updatedEntry) {
  if (index < 0 || index >= entries.length) {
    return;
  }
  entries[index] = updatedEntry;
  await saveEntries();
}

// --- Rendering ---

function renderEntries() {
  entriesListEl.innerHTML = "";
  editingIndex = null;

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No entries yet";
    entriesListEl.appendChild(empty);
    return;
  }

  const sorted = getSortedIndices();
  for (const { entry, index } of sorted) {
    entriesListEl.appendChild(createEntryElement(entry, index));
  }
}

function createEntryElement(entry, index) {
  const card = document.createElement("div");
  card.className = "entry";
  card.dataset.index = String(index);

  const dateLine = document.createElement("div");
  dateLine.className = "entry-meta";
  dateLine.textContent = formatDate(getEntryDate(entry));

  const times = document.createElement("div");
  times.className = "entry-times";
  times.textContent = `${formatTime(entry.start)} – ${formatTime(entry.end)}`;

  const meta = document.createElement("div");
  meta.className = "entry-meta";
  meta.textContent = `${entry.hours.toFixed(2)} hrs`;

  const note = document.createElement("div");
  note.className = "entry-note" + (entry.note ? "" : " empty");
  note.textContent = entry.note || "No note";

  const actions = document.createElement("div");
  actions.className = "entry-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn-edit";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => showEditForm(index));

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn-delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => handleDelete(index));

  actions.append(editBtn, deleteBtn);
  card.append(dateLine, times, meta, note, actions);
  return card;
}

function showEditForm(index) {
  if (editingIndex !== null) {
    renderEntries();
  }
  editingIndex = index;
  const entry = entries[index];
  if (!entry) {
    return;
  }

  const sorted = getSortedIndices();
  const position = sorted.findIndex((item) => item.index === index);
  if (position === -1) {
    return;
  }

  entriesListEl.innerHTML = "";

  for (let i = 0; i < sorted.length; i++) {
    const { entry: e, index: idx } = sorted[i];
    if (i === position) {
      entriesListEl.appendChild(createEditForm(e, idx));
    } else {
      entriesListEl.appendChild(createEntryElement(e, idx));
    }
  }
}

function createEditForm(entry, index) {
  const card = document.createElement("div");
  card.className = "entry entry-edit";
  const entryDate = getEntryDate(entry);
  const getDateValue = () => entryDate;

  const startTime = createTimeSelector(
    "Start time",
    entry.start,
    `edit-start-${index}`,
    getDateValue
  );
  const endTime = createTimeSelector(
    "End time",
    entry.end,
    `edit-end-${index}`,
    getDateValue
  );

  const noteLabel = document.createElement("label");
  noteLabel.setAttribute("for", `edit-note-${index}`);
  noteLabel.textContent = "Note";

  const noteField = document.createElement("input");
  noteField.type = "text";
  noteField.id = `edit-note-${index}`;
  noteField.value = entry.note;

  const actions = document.createElement("div");
  actions.className = "edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn-save";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () =>
    handleSaveEdit(index, startTime, endTime, noteField)
  );

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn-cancel";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => {
    editingIndex = null;
    renderEntries();
  });

  actions.append(saveBtn, cancelBtn);
  card.append(
    startTime.label,
    startTime.row,
    endTime.label,
    endTime.row,
    noteLabel,
    noteField,
    actions
  );
  return card;
}

// --- Log form setup ---

function setupLogFormTimeSelectors() {
  logTimeFieldsEl.innerHTML = "";
  const dateValue = dateInput.value || getTodayDateString();
  const { startIso, endIso } = getDefaultLogTimes(dateValue);
  const getDateValue = () => dateInput.value;

  logStartTime = createTimeSelector("Start time", startIso, "log-start", getDateValue);
  logEndTime = createTimeSelector("End time", endIso, "log-end", getDateValue);

  logTimeFieldsEl.append(
    logStartTime.label,
    logStartTime.row,
    logEndTime.label,
    logEndTime.row
  );
}

function resetLogForm() {
  dateInput.value = getTodayDateString();
  const { startIso, endIso } = getDefaultLogTimes(dateInput.value);
  logStartTime.setFromIso(startIso);
  logEndTime.setFromIso(endIso);
  noteInput.value = "";
}

function collectTimesheetPayload() {
  const dateValue = dateInput.value;
  if (!dateValue) {
    showMessage("Please select a date.", "error");
    dateInput.focus();
    return null;
  }

  if (!logStartTime || !logEndTime) {
    showMessage("Time fields are not ready.", "error");
    return null;
  }

  const startDate = logStartTime.getDate();
  const endDate = logEndTime.getDate();

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    alert("Please enter valid start and end times.");
    return null;
  }

  if (startDate >= endDate) {
    alert("End time must be after start time.");
    return null;
  }

  return {
    date: dateValue,
    start: logStartTime.getParts(),
    end: logEndTime.getParts(),
    note: noteInput.value.trim(),
  };
}

async function handleFillTimesheet() {
  showMessage("");

  if (entries.length === 0) {
    showMessage("No saved entries to fill.", "error");
    return;
  }

  const payload = entries;
  console.log("Sending all entries:", payload.length);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showMessage("No active tab found.", "error");
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "fillTimesheet",
      data: payload,
    });

    console.log("Fill timesheet response:", response);

    if (response?.success) {
      showMessage(response.message || "Timesheet filled on page.", "success");
    } else {
      showMessage(response?.error || "Could not fill timesheet.", "error");
    }
  } catch (err) {
    console.error("Failed to send message to tab:", err);
    showMessage(
      "Open the JobHawk timesheet page, reload it, then try again.",
      "error"
    );
  }
}

// --- Actions ---

async function handleDelete(index) {
  try {
    await deleteEntryAt(index);
    showMessage("Entry deleted.", "success");
    renderEntries();
  } catch (err) {
    console.error("Failed to delete entry:", err);
    showMessage("Could not delete entry.", "error");
  }
}

async function handleSaveEdit(index, startTime, endTime, noteField) {
  const startDate = startTime.getDate();
  const endDate = endTime.getDate();

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    alert("Please enter valid start and end times.");
    return;
  }

  if (startDate >= endDate) {
    alert("Start time must be before end time.");
    return;
  }

  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  const entry = entries[index];
  if (!entry) {
    return;
  }

  const updated = buildUpdatedEntry(entry, startIso, endIso, noteField.value);

  try {
    await updateEntryAt(index, updated);
    console.log("Updated entry:", updated);
    editingIndex = null;
    showMessage("Entry updated.", "success");
    renderEntries();
  } catch (err) {
    console.error("Failed to update entry:", err);
    showMessage("Could not save changes.", "error");
  }
}

async function refreshAndRender() {
  await loadEntries();
  renderEntries();
}

// --- Init ---

const fillTimesheetBtn = document.getElementById("fill-timesheet-btn");
dateInput.value = getTodayDateString();
setupLogFormTimeSelectors();

fillTimesheetBtn.addEventListener("click", handleFillTimesheet);

// Delete All Entries button (added once per popup open)
const deleteAllBtn = document.getElementById("delete-all-entries-btn");
if (!deleteAllBtn) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "delete-all-entries-btn";
  btn.className = "btn-delete";
  btn.textContent = "Delete All Entries";
  btn.style.width = "100%";
  btn.style.marginTop = "10px";

  entriesListEl.insertAdjacentElement("afterend", btn);

  btn.addEventListener("click", async () => {
    entries = [];
    await saveEntries();
    renderEntries();
    showMessage("All entries cleared", "success");
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("");

  const dateValue = dateInput.value;
  if (!dateValue) {
    showMessage("Please select a date.", "error");
    dateInput.focus();
    return;
  }

  const startDate = logStartTime.getDate();
  const endDate = logEndTime.getDate();

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    alert("Please enter valid start and end times.");
    return;
  }

  if (startDate >= endDate) {
    alert("End time must be after start time.");
    return;
  }

  const entry = createEntry(
    dateValue,
    startDate.toISOString(),
    endDate.toISOString(),
    noteInput.value
  );

  logBtn.disabled = true;

  try {
    await addEntry(entry);
    console.log("Saved entry:", entry);
    console.log("All entries:", entries);
    showMessage("Session logged.", "success");
    resetLogForm();
    renderEntries();
    dateInput.focus();
  } catch (err) {
    console.error("Failed to save entry:", err);
    showMessage("Could not save. Try again.", "error");
  } finally {
    logBtn.disabled = false;
  }
});

refreshAndRender();
