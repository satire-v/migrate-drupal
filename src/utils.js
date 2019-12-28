// @flow
export type Obj = { [key: string | number]: any };

const sanitizeUri = (uri: string): string => uri.replace(/[^0-9a-zA-Z-]/g, '');

const getFileNameFromUri = (uri: string): string => {
  const s = uri.split('/');
  const fname = s[s.length - 1];
  return decodeURI(fname);
};

function getValidExt(fileName: string): false | string {
  const parts = fileName.split('.');
  if (parts.length === 1) {
    return false;
  }
  const ext = parts[parts.length - 1];
  if (['png', 'jpg', 'jpeg', 'JPG'].includes(ext)) return ext;
  return false;
}

function validateImageExt(fileName: string, ext: string): string {
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

module.exports = {
  getFileNameFromUri,
  sanitizeUri,
  getValidExt,
  validateImageExt,
};
