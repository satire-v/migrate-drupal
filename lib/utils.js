



const sanitizeUri = uri => uri.replace(/[^0-9a-zA-Z-]/, '');

const getFileNameFromUri = uri => {
  const s = uri.split('/');
  return s[s.length - 1].replace(/[^0-9a-zA-Z-._]/, '');
};

module.exports = { getFileNameFromUri, sanitizeUri };
//# sourceMappingURL=utils.js.map