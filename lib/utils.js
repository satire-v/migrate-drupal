

const fs = require('fs');

const request = require('request-promise-native');



const sanitizeUri = uri => uri.replace(/[^0-9a-zA-Z-]/, '');

const getFileNameFromUri = uri => {
  const s = uri.split('/');
  return s[s.length - 1];
};

const uploadImageDirectus = async (
fileName,
req) =>
{
  const options = {
    url: 'http://api.satirev.org/satire-v/files',
    project: 'satire-v',
    auth: {
      // static auth token
      bearer: 'letmeinyoubitch' },

    formData: {
      filename_disk: fileName,
      filename_download: fileName,
      data: req } };


  let content = await request.post(options).on('data', chunk => {
    console.log(chunk.length);
  });
  content = JSON.parse(content);

  // return url for sourcing
  // and id for database linking
  return {
    fullUri: content.data.data.full_url,
    imageID: content.data.id };

};

module.exports = { getFileNameFromUri, sanitizeUri, uploadImageDirectus };
//# sourceMappingURL=utils.js.map