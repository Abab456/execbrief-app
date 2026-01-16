const { parse } = require("csv-parse/sync");
const XLSX = require("xlsx");

/**
 * Entry point
 */
function parseUploadFiles(files) {
  let rows = [];

  for (const file of files) {
    const buffer = file.buffer;

    // CSV
    if (file.mimetype.includes("csv")) {
      const csv = buffer.toString("utf8");
      rows.push(
        ...parse(csv, { columns: true, skip_empty_lines: true })
      );
    }

    // XLSX
    if (
      file.mimetype.includes("spreadsheet") ||
      file.originalname.endsWith(".xlsx")
    ) {
      const wb = XLSX.read(buffer, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows.push(...XLSX.utils.sheet_to_json(sheet));
    }
  }

  return buildTimeBasedRaw(rows);
}

/**
 * Core logic:
 * - Parse dates
 * - Sort chronologically
 * - Split into periods
 */
function buildTimeBasedRaw(rows) {
  const parsed = rows
    .map(r => ({
      ...r,
      __date: new Date(r.date)
    }))
    .filter(r => !isNaN(r.__date));

  if (parsed.length < 2) {
    throw new Error("Not enough dated rows to compare periods");
  }

  parsed.sort((a, b) => a.__date - b.__date);

  // Split dataset in half (simple & robust for MVP)
  const midpoint = Math.floor(parsed.length / 2);
  const previousRows = parsed.slice(0, midpoint);
  const currentRows = parsed.slice(midpoint);

  return {
    source: "upload",
    currency: "USD",
    confidence: "high",
    assumptions: [
      "Time-based comparison derived from uploaded data",
      "Periods split evenly"
    ],
    current: aggregate(currentRows),
    previous: aggregate(previousRows)
  };
}

/**
 * Aggregate metrics
 */
function aggregate(rows) {
  const sum = k =>
    rows.reduce((a, r) => a + Number(r[k] || 0), 0);

  const avg = k =>
    rows.length
      ? rows.reduce((a, r) => a + Number(r[k] || 0), 0) / rows.length
      : null;

  return {
    revenue: sum("revenue"),
    marketing_spend: sum("marketing_spend"),
    cac: avg("cac"),
    churn_rate: avg("churn_rate"),
    ltv: avg("ltv")
  };
}

module.exports = { parseUploadFiles };
