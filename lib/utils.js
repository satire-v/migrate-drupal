
const fs = require('fs');

const fileType = require('file-type');



const sanitizeUri = uri => uri.replace(/[^0-9a-zA-Z-]/g, '');

const file = fs.createWriteStream('./files.txt');

const getFileNameFromUri = uri => {
  const s = uri.split('/');
  const fname = s[s.length - 1];
  return decodeURI(fname);
};

function getValidExt(fileName) {
  const parts = fileName.split('.');
  if (parts.length === 1) {
    return false;
  }
  const ext = parts[parts.length - 1];
  if (['png', 'jpg', 'jpeg'].includes(ext)) return ext;
  return false;
}

function validateImageExt(fileName, ext) {
  const fileNameSan = fileName.replace(/[^0-9a-zA-Z-._]/g, '');
  let fileNameExt = fileNameSan;
  const parts = fileNameSan.split('.');
  if (parts.length === 1) {
    fileNameExt = [parts[0].slice(0, 25), ext].join('.');
  } else {
    parts.pop();
    fileNameExt = `${parts.join('.').slice(0, 25)}.${ext}`;
  }
  file.write(`${fileNameExt}\n`);
  return fileNameExt;
}

module.exports = {
  getFileNameFromUri,
  sanitizeUri,
  getValidExt,
  validateImageExt };
//# sourceMappingURL=utils.js.map