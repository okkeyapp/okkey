export type CsvParseOptions = {
  header?: boolean;
  skipEmptyLines?: boolean;
};

export function parseCsv(text: string, options: CsvParseOptions = {}): Record<string, string>[] | string[][] {
  const rows = parseCsvRows(text, options.skipEmptyLines !== false);
  if (!options.header || rows.length === 0) {
    return rows;
  }
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });
}

function parseCsvRows(text: string, skipEmptyLines: boolean): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n" || (char === "\r" && next === "\n")) {
      row.push(field);
      field = "";
      if (!(skipEmptyLines && row.every((cell) => cell.trim() === ""))) {
        rows.push(row);
      }
      row = [];
      if (char === "\r") {
        i += 1;
      }
      continue;
    }

    if (char === "\r") {
      row.push(field);
      field = "";
      if (!(skipEmptyLines && row.every((cell) => cell.trim() === ""))) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);
  if (!(skipEmptyLines && row.every((cell) => cell.trim() === ""))) {
    rows.push(row);
  }
  return rows;
}
