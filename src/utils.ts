import logger from "./logger";

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

export function handleShellReturn(returns: {
  stderr: string;
  [key: string]: any;
}): void {
  const err = returns.stderr;
  if (
    err === "" ||
    err ===
      "mysql: [Warning] Using a password on the command line interface can be insecure.\n"
  ) {
    return;
  } else {
    logger.error(err);
    throw new Error(err);
  }
}
