export type Obj = Record<string | number, any>;

export function sanitizeUri(uri: string): string {
  return uri.replace(/[^0-9a-zA-Z-]/g, '');
}

export const getFileNameFromUri = (uri: string): string => {
  const s = uri.split('/');
  const fname = s[s.length - 1];
  return decodeURI(fname);
};

export function getValidExt(fileName: string): false | string {
  const parts = fileName.split('.');
  if (parts.length === 1) {
    return false;
  }
  const ext = parts[parts.length - 1];
  if (['png', 'jpg', 'jpeg', 'JPG'].includes(ext)) return ext;
  return false;
}

export function validateImageExt(fileName: string, ext: string): string {
  const fileNameSan = fileName.replace(/[^0-9a-zA-Z-._]/g, '');
  let fileNameExt = fileNameSan;
  const parts = fileNameSan.split('.');
  if (parts.length === 1) {
    fileNameExt = [parts[0].slice(0, 25), ext].join('.');
  } else {
    parts.pop();
    fileNameExt = `${parts.join('.').slice(0, 25)}.${ext}`;
  }
  return fileNameExt;
}

export default { validateImageExt, getValidExt, getFileNameFromUri, sanitizeUri };

