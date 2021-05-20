#!/usr/bin/env node
"use strict";

import { rename, writeFile } from "fs";
import minimist, { ParsedArgs } from "minimist";
import mkdirp from "mkdirp";
import {
  IInterfaceOptions,
  mergeTypedWsdl,
  outputTypedWsdl,
  wsdl2ts
} from "./wsdl-to-ts";

interface IConfigObject {
  outdir: string;
  files: string[];
  tslintDisable: null | string[];
  tslintEnable: null | string[];
}

const opts: IInterfaceOptions = {};
const config: IConfigObject = {
  outdir: "./wsdl",
  files: [],
  tslintDisable: ["max-line-length", "no-empty-interface"],
  tslintEnable: []
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
const args: ParsedArgs = minimist(process.argv.slice(2));

if (args.help) {
  // TODO
}

if (args.version) {
  // eslint-disable-next-line
  const pack: { version: number } = require("../package.json");
  console.log("%s %s", "wsdl-to-ts", pack.version);
  process.exit(0);
}

if (args.outdir || args.outDir) {
  config.outdir = String(args.outdir || args.outDir);
}

if (args._) {
  config.files = config.files.concat(args._.map(String));
}

if (config.files.length === 0) {
  console.error("No files given");
  process.exit(1);
}

function mkdirpp(dir: string, mode?: number): Promise<string> {
  return mkdirp(dir, mode || 0o755);
}

Promise.all(config.files.map((a) => wsdl2ts(a, opts)))
  .then(([xs1, ...restXs]) => mergeTypedWsdl(xs1, ...restXs))
  .then(outputTypedWsdl)
  .then((xs: { file: string; data: string[] }[]) => {
    return Promise.all(
      xs.map((x) => {
        console.log("-- %s --", x.file);
        console.log("%s", x.data.join("\n\n"));
        const file = config.outdir + "/" + x.file;
        const dir = file.replace(/\/[^/]+$/, "");
        return mkdirpp(dir).then(() => {
          return new Promise((resolve, reject) => {
            const tsfile = file + ".ts.tmp";
            const fileData: string[] = [];
            if (config.tslintEnable === null) {
              fileData.push("/* tslint:enable */");
            }
            if (config.tslintDisable === null) {
              fileData.push("/* tslint:disable */");
            } else if (config.tslintDisable.length !== 0) {
              fileData.push(
                "/* tslint:disable:" + config.tslintDisable.join(" ") + " */"
              );
            }
            if (config.tslintEnable && config.tslintEnable.length !== 0) {
              fileData.push(
                "/* tslint:enable:" + config.tslintEnable.join(" ") + " */"
              );
            }
            fileData.push(x.data.join("\n\n"));
            fileData.push("");
            writeFile(tsfile, fileData.join("\n"), (err) => {
              if (err) {
                reject(err);
              } else {
                resolve(tsfile);
              }
            });
          });
        });
      })
    );
  })
  .then((files: string[]) =>
    Promise.all(
      files.map((file) => {
        return new Promise((resolve, reject) => {
          const realFile = file.replace(/\.[^.]+$/, "");
          rename(file, realFile, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve(realFile);
            }
          });
        });
      })
    )
  )
  .catch((err) => {
    console.error(err);
    process.exitCode = 3;
  });
