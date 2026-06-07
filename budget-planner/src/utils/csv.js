function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";

  const stringValue = String(value);

  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

// Converts object rows using the supplied header names as object keys and CSV columns.
export function rowsToCsv(headers, rows) {
  const headerRow = headers.map(escapeCsvValue).join(",");

  const dataRows = rows.map((row) =>
    headers.map((header) => escapeCsvValue(row[header])).join(",")
  );

  return [headerRow, ...dataRows].join("\n");
}

// Converts a complete two-dimensional table where each inner array is one CSV row.
export function tableRowsToCsv(rows) {
  return rows
    .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
    .join("\n");
}
