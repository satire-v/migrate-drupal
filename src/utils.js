// @flow

export type Obj = { [key: string | number]: any };

const sanitizeUri = (uri: string): string => uri.replace(/[^0-9a-zA-Z-]/, '');

const getFileNameFromUri = (uri: string): string => {
  const s = uri.split('/');
  return s[s.length - 1].replace(/[^0-9a-zA-Z-._]/, '');
};

module.exports = { getFileNameFromUri, sanitizeUri };
