// @flow

const fs = require('fs');

const request = require('request-promise-native');

export type Obj = { [key: string | number]: any };

const sanitizeUri = (uri: string): string => uri.replace(/[^0-9a-zA-Z-]/, '');

const getFileNameFromUri = (uri: string): string => {
  const s = uri.split('/');
  return s[s.length - 1];
};

const uploadImageDirectus = async (
  fileName: string,
  req: request,
): Promise<{ fullUri: string, imageID: number }> => {
  const options: Obj = {
    url: 'http://api.satirev.org/satire-v/files',
    project: 'satire-v',
    auth: {
      // static auth token
      bearer: 'letmeinyoubitch',
    },
    formData: {
      filename_disk: fileName,
      filename_download: fileName,
      data: req,
    },
  };
  let content = await request.post(options).on('data', (chunk) => {
    console.log(chunk.length);
  });
  content = JSON.parse(content);

  // return url for sourcing
  // and id for database linking
  return {
    fullUri: content.data.data.full_url,
    imageID: content.data.id,
  };
};

module.exports = { getFileNameFromUri, sanitizeUri, uploadImageDirectus };
