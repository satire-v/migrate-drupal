// @flow

function sanitizeUri(uri: string): string {
  return uri.replace(/[^0-9a-zA-Z-]/, "");
}

function getFileNameFromUri(uri: string): string {
  const s = uri.split("/");
  return s[s.length - 1];
}
export type Obj = { [key: string | number]: any };
module.exports = { getFileNameFromUri, sanitizeUri };
