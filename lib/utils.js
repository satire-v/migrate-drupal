

function sanitizeUri(uri) {
  return uri.replace(/[^0-9a-zA-Z-]/, "");
}

function getFileNameFromUri(uri) {
  return uri.replace(/^.*(\\|\/|:)/, "");
}

module.exports = { getFileNameFromUri, sanitizeUri };