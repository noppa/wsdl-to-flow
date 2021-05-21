import nock from "nock";
import { join as pathJoin } from "path";
import * as fs from "fs";

const relative = (path: string): string => pathJoin(__dirname, path);

const wsdlUrl = "https://www.w3schools.com/xml/tempconvert.asmx?WSDL";
let hasCache: boolean;
// We'll cache the WSDL request on disk to avoid spamming w3schools
const requestCacheFile = relative("../cache/wsdl-recording-cache.js.lock");
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
import { createDefinitionFileContents, wsdl2flow } from "../src/wsdl-to-flow";
import { format } from "prettier";
import flowBinPath from "flow-bin";
import { execFile } from "child_process";
import mkdirp from "mkdirp";

describe("wsdl2flow", () => {
  let client: soap.Client;
  let compiledOutput: undefined | string;
  beforeAll(async () => {
    client = await soap.createClientAsync(wsdlUrl);
  });

  it("should create Flow definitions", async () => {
    const { fileContents } = await wsdl2flow(() =>
      Promise.resolve(client)
    ).then(createDefinitionFileContents);
    expect(fileContents).toMatchSnapshot();
    compiledOutput = fileContents;
  });

  it("should pass Flow check", async () => {
    if (!compiledOutput) {
      throw new Error("Previous test failed");
    }
    const { writeFile } = fs.promises;

    const testJsSource = format(
      `
      // @flow
      /* eslint-disable */
      import type {TempConvertSoap} from 'wsdl-types/TempConvert/TempConvertSoap'
      declare var soapClient: TempConvertSoap;

      soapClient.FahrenheitToCelsius(
        { Fahrenheit: '5'},
        (err, res) => console.log(res.FahrenheitToCelsiusResult)
      )
    `,
      { parser: "babel-flow" }
    );

    await mkdirp(relative("../flow-sadbox/lib"));

    await Promise.all([
      writeFile(relative("../flow-sadbox/soap-client.js"), testJsSource),
      writeFile(
        relative("../flow-sadbox/lib/wsdl-temp-convert.js.flow"),
        compiledOutput
      )
    ]);

    execFile(
      flowBinPath,
      ["check"],
      {
        cwd: relative("../flow-sadbox/")
      },
      (err, stdout) => {
        expect(stdout?.trim()).toBe("Found 0 errors");
      }
    );
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
