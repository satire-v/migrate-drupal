

function sanitizeUri(uri) {
  return uri.replace(/[^0-9a-zA-Z-]/, "");
}

function getFileNameFromUri(uri) {
  const s = uri.split("/");
  return s[s.length - 1];
}


















module.exports = { getFileNameFromUri, sanitizeUri };
//# sourceMappingURL=utils.js.map