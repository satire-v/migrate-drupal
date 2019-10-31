// @flow
const request = require("request-promise-native");

async function uploadImage(
  imageBase64: string,
  fileName: string
): Promise<{ fullUri: string, imageID: number }> {
  const options: Object = {
    method: "POST",
    url: "http://admin.satirev.org/_/files",
    project: "_", // default
    auth: {
      // static auth token
      bearer: "idrdhjfrhcvdbedekjhfvjdbuuelhece"
    },
    formData: {
      filename: fileName,
      data: imageBase64
    },
    json: true
  };
  const content = await request(options);
  // return url for sourcing
  // and id for database linking
  return { fullUri: content.data.data.full_url, imageID: content.data.id };
}

module.exports = { uploadImage };
