import { AuthModes } from "@directus/sdk-js/dist/types/Authentication";
import SDK from "@directus/sdk-js";

const test = async (): Promise<void> => {
  const options = {
    mode: "cookie" as AuthModes,
    url: "http://api.satirev.org/",
    project: "satire-v",
    token: "letmeinyoubitch",
  };
  const sdk = new SDK(options);
  const res = await sdk.getFiles({ fields: "id" });
  console.log(res);
};
test();
