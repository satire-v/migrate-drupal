import { SDK } from "@directus/sdk-js";

const test = async (): Promise<any> => {
  const options = {
    url: "http://api.satirev.org/",
    project: "satire-v",
    token: "letmeinyoubitch",
  };
  const sdk = new SDK(options);
  const res = await sdk.getItems("articles", { q: "reindeer" });
  console.log(res);
};
test();
