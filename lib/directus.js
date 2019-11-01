


const request = require("request-promise-native");

async function uploadImage(
imageBase64,
fileName,
type)
{
  const options = {
    method: "POST",
    url: "http://admin.satirev.org/satirev/files",
    project: "_", // default
    auth: {
      // static auth token
      bearer: "letmeinyoubitch" },

    formData: {
      filename: fileName,
      data: imageBase64,
      contentType: type || "" },

    json: true };

  const content = await request(options);
  // return url for sourcing
  // and id for database linking
  return { fullUri: content.data.data.full_url, imageID: content.data.id };
}

module.exports = { uploadImage };
//# sourceMappingURL=directus.js.map