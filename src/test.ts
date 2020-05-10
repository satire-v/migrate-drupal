/* eslint-disable @typescript-eslint/camelcase */
import axios from "axios";
import { AuthModes } from "@directus/sdk-js/dist/types/Authentication";
import SDK from "@directus/sdk-js";

const test = async (): Promise<void> => {
  const dirOptions = {
    mode: "cookie" as AuthModes,
    url: "http://api.satirev.org/",
    project: "satire-v",
    token: "letmeinyoubitch",
  };
  const sdk = new SDK(dirOptions);

  const res = await sdk.getFiles({ fields: "id", limit: -1 });

  console.log(res);
};
test();
