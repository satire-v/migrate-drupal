// @flow

function sanitizeUri(uri: string): string {
  return uri.replace(/[^0-9a-zA-Z-]/, "");
}

function getFileNameFromUri(uri: string): string {
  return uri.replace(/^.*(\\|\/|:)/, "");
}
export type Obj = { [key: string | number]: any };
module.exports = { getFileNameFromUri, sanitizeUri };
