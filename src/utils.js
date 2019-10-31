// @flow

function sanitizeUri(uri: string): string {
  return uri.replace(/[^0-9a-zA-Z-]/, "");
}

function getFileNameFromUri(uri: string): string {
  return uri.replace(/^.*(\\|\/|:)/, "");
}

const catchAwait = async <T>(awaitable: Promise<T>): Promise<T> => {
  try {
    return await awaitable;
  } catch (e) {
    throw e;
  }
};

module.exports = { catchAwait, getFileNameFromUri, sanitizeUri };
