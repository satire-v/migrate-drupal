// @flow
const request = require('request-promise-native');

export type Obj = { [key: string | number]: any };

const sanitizeUri = (uri: string): string => uri.replace(/[^0-9a-zA-Z-]/, '');

const getFileNameFromUri = (uri: string): string => {
  const s = uri.split('/');
  return s[s.length - 1];
};


const uploadImageDirectus = async (
  imageBase64: string,
  fileName: string,
  type?: ?string,
): Promise<{ fullUri: string, imageID: number }> => {
  const options: Obj = {
    method: 'POST',
    url: 'http://admin.satirev.org/_/files',
    project: '_', // default
    auth: {
      // static auth token
      bearer: 'letmeinyoubitch',
    },
    formData: {
      filename: fileName,
      data: imageBase64,
      contentType: type || '',
    },
    json: true,
  };
  const content = await request(options);
  // return url for sourcing
  // and id for database linking
  return { fullUri: content.data.data.full_url, imageID: content.data.id };
};


module.exports = { getFileNameFromUri, sanitizeUri, uploadImageDirectus };
