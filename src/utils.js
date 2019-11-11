// @flow

function sanitizeUri(uri: string): string {
  return uri.replace(/[^0-9a-zA-Z-]/, "");
}

function getFileNameFromUri(uri: string): string {
  const s = uri.split("/");
  return s[s.length - 1];
}
export type Obj = { [key: string | number]: any };
export type Article = {
  nid: number,
  title: string,
  created: number,
  changed: number,
  status: 0 | 1,
  body: string,
  caption: string,
  category_id: number,
  category_name: string,
  teaser: string,
  year: number,
  image_id: number,
  image_uri: string,
  relative_uri: string,
  tags_info: string
};
module.exports = { getFileNameFromUri, sanitizeUri };
