/**
 * CSV/PDF import and export for timesheet entries.
 * Loaded before popup.js; exposes window.TimesheetIO.
 */
(function () {
  const CSV_HEADERS = ["date", "start", "end", "hours", "note"];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function isoToDateString(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function calculateHoursFromTimestamps(startIso, endIso) {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const diffMs = end.getTime() - start.getTime();
    return diffMs / (1000 * 60 * 60);
  }

  function normalizeImportedEntry(raw) {
    const date =
      raw.date ||
      (raw.start ? isoToDateString(raw.start) : null);
    const start = raw.start ? String(raw.start).trim() : "";
    const end = raw.end ? String(raw.end).trim() : "";
    const note = raw.note != null ? String(raw.note).trim() : "";

    if (!date || !start || !end) {
      return null;
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return null;
    }
    if (startDate >= endDate) {
      return null;
    }

    let hours = parseFloat(raw.hours);
    if (!Number.isFinite(hours) || hours <= 0) {
      hours = calculateHoursFromTimestamps(start, end);
    }

    return {
      date,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      hours,
      note,
    };
  }

  function sortEntriesForExport(entries) {
    return [...entries].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );
  }

  function formatExportFilename(extension) {
    const today = new Date();
    const stamp = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    return `jobhawk-timesheet-${stamp}.${extension}`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // --- CSV ---

  function escapeCsvField(value) {
    const text = value == null ? "" : String(value);
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function entriesToCsv(entries) {
    const sorted = sortEntriesForExport(entries);
    const lines = [CSV_HEADERS.join(",")];
    for (const entry of sorted) {
      const row = [
        entry.date || isoToDateString(entry.start),
        entry.start,
        entry.end,
        Number(entry.hours).toFixed(2),
        entry.note || "",
      ];
      lines.push(row.map(escapeCsvField).join(","));
    }
    return lines.join("\r\n");
  }

  function parseCsvRow(line) {
    const fields = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields;
  }

  function normalizeHeaderName(name) {
    return name.trim().toLowerCase().replace(/\s+/g, "_");
  }

  function csvToEntries(text) {
    const cleaned = text.replace(/^\uFEFF/, "").trim();
    if (!cleaned) {
      return { entries: [], errors: ["File is empty."] };
    }

    const lines = cleaned.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      return { entries: [], errors: ["CSV must include a header row and at least one entry."] };
    }

    const headerFields = parseCsvRow(lines[0]).map(normalizeHeaderName);
    const columnIndex = {};
    for (let i = 0; i < headerFields.length; i++) {
      columnIndex[headerFields[i]] = i;
    }

    const required = ["date", "start", "end"];
    const missing = required.filter((key) => columnIndex[key] === undefined);
    if (missing.length) {
      return {
        entries: [],
        errors: [`Missing required column(s): ${missing.join(", ")}`],
      };
    }

    const entries = [];
    const errors = [];

    for (let rowNum = 1; rowNum < lines.length; rowNum++) {
      const fields = parseCsvRow(lines[rowNum]);
      if (fields.every((f) => !f.trim())) {
        continue;
      }

      const get = (key) => {
        const idx = columnIndex[key];
        return idx === undefined ? "" : (fields[idx] || "").trim();
      };

      const normalized = normalizeImportedEntry({
        date: get("date"),
        start: get("start"),
        end: get("end"),
        hours: get("hours"),
        note: get("note"),
      });

      if (!normalized) {
        errors.push(`Row ${rowNum + 1}: invalid or incomplete entry.`);
        continue;
      }
      entries.push(normalized);
    }

    if (entries.length === 0 && errors.length === 0) {
      errors.push("No valid entries found in file.");
    }

    return { entries, errors };
  }

  // --- PDF (minimal generator, no dependencies) ---

  function escapePdfText(text) {
    return String(text)
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  function formatPdfDisplayDate(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatPdfDisplayTime(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return "—";
    }
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function truncatePdfText(text, maxLen) {
    const value = text || "";
    if (value.length <= maxLen) {
      return value;
    }
    return `${value.slice(0, maxLen - 1)}…`;
  }

  function buildPdfContentStream(lines) {
    const streamLines = ["BT", "/F1 10 Tf", "14 TL"];
    let y = 750;
    for (const line of lines) {
      streamLines.push(`1 0 0 1 40 ${y} Tm (${escapePdfText(line)}) Tj`);
      y -= 14;
    }
    streamLines.push("ET");
    return streamLines.join("\n");
  }

  function paginatePdfLines(allLines, linesPerPage) {
    const pages = [];
    for (let i = 0; i < allLines.length; i += linesPerPage) {
      pages.push(allLines.slice(i, i + linesPerPage));
    }
    return pages.length ? pages : [["(no entries)"]];
  }

  function buildPdfDocument(entries) {
    const sorted = sortEntriesForExport(entries);
    const totalHours = sorted.reduce((sum, e) => sum + (e.hours || 0), 0);
    const generated = new Date().toLocaleString();

    const headerLines = [
      "JobHawk Auto Timesheet",
      `Generated: ${generated}`,
      `Entries: ${sorted.length}  |  Total hours: ${totalHours.toFixed(2)}`,
      "",
      "Date          Start     End       Hrs   Note",
      "--------------------------------------------------------------",
    ];

    const rowLines = sorted.map((entry) => {
      const date = formatPdfDisplayDate(entry.date || isoToDateString(entry.start));
      const start = formatPdfDisplayTime(entry.start);
      const end = formatPdfDisplayTime(entry.end);
      const hrs = Number(entry.hours).toFixed(2).padStart(4, " ");
      const note = truncatePdfText(entry.note, 28);
      const dateCol = date.padEnd(14, " ").slice(0, 14);
      const startCol = start.padEnd(9, " ").slice(0, 9);
      const endCol = end.padEnd(9, " ").slice(0, 9);
      return `${dateCol}${startCol}${endCol}${hrs}  ${note}`;
    });

    const pageChunks = paginatePdfLines([...headerLines, ...rowLines], 48);
    const fontId = 3 + pageChunks.length * 2;
    const objects = [];

    objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj");

    const pageIds = [];
    for (let i = 0; i < pageChunks.length; i++) {
      pageIds.push(3 + i * 2);
    }
    objects.push(
      `2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageChunks.length} >>\nendobj`
    );

    for (let i = 0; i < pageChunks.length; i++) {
      const pageId = 3 + i * 2;
      const contentId = pageId + 1;
      const contentStream = buildPdfContentStream(pageChunks[i]);
      objects.push(
        `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>\nendobj`
      );
      objects.push(
        `${contentId} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj`
      );
    }

    objects.push(
      `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`
    );

    const body = `${objects.join("\n")}\n`;
    const totalObjects = fontId + 1;
    const offsets = new Array(totalObjects).fill(0);
    const header = "%PDF-1.4\n";
    let cursor = header.length;

    for (const object of objects) {
      const match = object.match(/^(\d+) 0 obj/);
      if (match) {
        offsets[Number(match[1])] = cursor;
      }
      cursor += object.length + 1;
    }

    const padOffset = (value) => String(value).padStart(10, "0");
    const xrefLines = ["xref", `0 ${totalObjects}`, "0000000000 65535 f "];
    for (let i = 1; i < totalObjects; i++) {
      xrefLines.push(`${padOffset(offsets[i])} 00000 n `);
    }

    let pdf = header + body;
    const xrefOffset = pdf.length;
    pdf += `${xrefLines.join("\n")}\n`;
    pdf += `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\n`;
    pdf += `startxref\n${xrefOffset}\n%%EOF`;

    return pdf;
  }

  function entriesToPdfBlob(entries) {
    const pdf = buildPdfDocument(entries);
    return new Blob([pdf], { type: "application/pdf" });
  }

  window.TimesheetIO = {
    exportCsv(entries) {
      const csv = entriesToCsv(entries);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      downloadBlob(blob, formatExportFilename("csv"));
    },

    exportPdf(entries) {
      const blob = entriesToPdfBlob(entries);
      downloadBlob(blob, formatExportFilename("pdf"));
    },

    importCsv(text) {
      return csvToEntries(text);
    },

    normalizeImportedEntry,
  };
})();
