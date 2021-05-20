import nock from "nock";
import { join as pathJoin } from "path";
import * as fs from "fs";

const wsdlUrl = "https://www.w3schools.com/xml/tempconvert.asmx?WSDL";
let hasCache: boolean;
// We'll cache the WSDL request on disk to avoid spamming w3schools
const requestCacheFile = pathJoin(
  __dirname,
  "../cache/wsdl-recording-cache.js.lock"
);
(function initNock() {
  try {
    const nockScript = fs.readFileSync(requestCacheFile, "utf8");
    if (nockScript.trim().length) {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function("nock", nockScript)(nock);
      hasCache = true;
      nock.disableNetConnect();
    } else {
      hasCache = false;
    }
  } catch (err) {
    console.warn(err);
    hasCache = false;
  }
  if (!hasCache) {
    nock.recorder.rec({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      dont_print: true
    });
    console.info(
      "No previously recorded cache for WSDL requests, passing them trhough"
    );
  }
})();

import * as soap from "soap";
import {
  mergeTypedWsdl,
  outputTypedWsdl,
  wsdl2flow
} from "../src/wsdl-to-flow";

describe("wsdl2flow", () => {
  let client: soap.Client;
  beforeAll(async () => {
    client = await soap.createClientAsync(wsdlUrl);
  });

  it("should create Flow definitions", async () => {
    const result = await wsdl2flow(() => Promise.resolve(client))
      .then(mergeTypedWsdl)
      .then(outputTypedWsdl);

    const resultFiles = result
      .map(({ file, data }) => {
        return ["// File: " + file, "", ...data].join("\n");
      })
      .join("\n\n");
    expect(resultFiles).toMatchSnapshot();
  });

  afterAll(() => {
    if (!hasCache) {
      const cache = nock.recorder.play();
      const cacheScript = cache.join(";\n");
      if (cacheScript.trim().length) {
        fs.writeFileSync(requestCacheFile, cacheScript);
      }
      nock.recorder.clear();
    }
  });
});
