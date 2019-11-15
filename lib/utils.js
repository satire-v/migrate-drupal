
const request = require('request-promise-native');



const sanitizeUri = uri => uri.replace(/[^0-9a-zA-Z-]/, '');

const getFileNameFromUri = uri => {
  const s = uri.split('/');
  return s[s.length - 1];
};


const uploadImageDirectus = async (
imageBase64,
fileName,
type) =>
{
  const options = {
    method: 'POST',
    url: 'http://admin.satirev.org/_/files',
    project: '_', // default
    auth: {
      // static auth token
      bearer: 'letmeinyoubitch' },

    formData: {
      filename: fileName,
      data: imageBase64,
      contentType: type || '' },

    json: true };

  const content = await request(options);
  // return url for sourcing
  // and id for database linking
  return { fullUri: content.data.data.full_url, imageID: content.data.id };
};


module.exports = { getFileNameFromUri, sanitizeUri, uploadImageDirectus };
//# sourceMappingURL=utils.js.map