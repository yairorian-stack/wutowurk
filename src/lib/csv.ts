export function csvText(headers: string[], rows: (string | number)[][]) {
  const cell = (value: string | number) => {
    let text = String(value);
    if (
      typeof value === "string" &&
      (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))
    )
      text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")
  );
}
