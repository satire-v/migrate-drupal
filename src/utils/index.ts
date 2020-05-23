export function sanitizePath(uri: string): string {
  return uri.replace(/[^0-9a-zA-Z-_]/g, "");
}

export const getFileNameFromUri = (uri: string): string => {
  const s = uri.split("/");
  const fname = s[s.length - 1];
  return decodeURI(fname);
};

export default {
  getFileNameFromUri,
  sanitizePath,
};
