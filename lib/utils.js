"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function sanitizeUri(uri) {
    return uri.replace(/[^0-9a-zA-Z-]/g, '');
}
exports.sanitizeUri = sanitizeUri;
exports.getFileNameFromUri = function (uri) {
    var s = uri.split('/');
    var fname = s[s.length - 1];
    return decodeURI(fname);
};
function getValidExt(fileName) {
    var parts = fileName.split('.');
    if (parts.length === 1) {
        return false;
    }
    var ext = parts[parts.length - 1];
    if (['png', 'jpg', 'jpeg', 'JPG'].includes(ext))
        return ext;
    return false;
}
exports.getValidExt = getValidExt;
function validateImageExt(fileName, ext) {
    var fileNameSan = fileName.replace(/[^0-9a-zA-Z-._]/g, '');
    var fileNameExt = fileNameSan;
    var parts = fileNameSan.split('.');
    if (parts.length === 1) {
        fileNameExt = [parts[0].slice(0, 25), ext].join('.');
    }
    else {
        parts.pop();
        fileNameExt = parts.join('.').slice(0, 25) + "." + ext;
    }
    return fileNameExt;
}
exports.validateImageExt = validateImageExt;
exports.default = { validateImageExt: validateImageExt, getValidExt: getValidExt, getFileNameFromUri: exports.getFileNameFromUri, sanitizeUri: sanitizeUri };
//# sourceMappingURL=utils.js.map