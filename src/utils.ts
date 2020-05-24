export function sanitizePath(uri: string): string {
  return uri.replace(/[^0-9a-zA-Z-_]/g, "");
}

export function getFileNameFromUri(uri: string): string {
  const s = uri.split("/");
  const fname = s[s.length - 1];
  return decodeURI(fname);
}

// SQL dates are formatted slightly differently than unix
export function unixToSQLDate(unixts: number): string {
  return new Date(unixts * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}
