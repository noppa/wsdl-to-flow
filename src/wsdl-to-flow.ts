import { format } from "prettier";
import * as soap from "soap";
import { hasOwnProperty } from "./utils";

export const nsEnums: { [k: string]: boolean } = {};

interface ITwoDown<T> {
  [k: string]: { [k: string]: T };
}

interface IInterfaceObject {
  [key: string]: string | IInterfaceObject;
}

export interface ITypedWsdl {
  client: soap.Client | null;
  files: ITwoDown<string>;
  methods: ITwoDown<{ [k: string]: string }>;
  types: ITwoDown<{ [k: string]: string }>;
  namespaces: ITwoDown<{ [k: string]: { [k: string]: string } }>;
}

interface IMethodDescription {
  input: Record<string, any>;
  output: Record<string, any>;
}

interface IPortDescription {
  [method: string]: IMethodDescription;
}

interface IServiceDescription {
  [port: string]: IPortDescription;
}

interface IClientDescription {
  [service: string]: IServiceDescription;
}

export class TypeCollector {
  public readonly registered: { [k: string]: string };
  public readonly collected: { [k: string]: null | string };

  constructor(public readonly ns: string) {
    this.registered = {};
    this.collected = {};
  }

  public registerCollected(): this {
    for (const k of Object.keys(this.collected)) {
      const collectedVal = this.collected[k];
      if (collectedVal) {
        this.registered[k] = collectedVal;
      } else {
        delete this.registered[k];
      }
      delete this.collected[k];
    }
    return this;
  }
}

function isNumberTypeClass(superTypeClass: string): boolean {
  return /:(integer|int|long|double|decimal)$/g.test(superTypeClass);
}

function wsdlTypeToInterfaceObj(
  obj: IInterfaceObject,
  typeCollector?: TypeCollector
): { [k: string]: any } {
  const r: { [k: string]: any } = {};
  for (const k of Object.keys(obj)) {
    if (k === "targetNSAlias" || k === "targetNamespace") {
      continue;
    }
    const isArray = k.endsWith("[]");
    const k2 = isArray ? k.substring(0, k.length - 2) : k;
    const v = obj[k];
    if (typeof v === "string") {
      const vstr = v;
      const [typeName, superTypeClass, typeData] =
        vstr.indexOf("|") === -1 ? [vstr, vstr, undefined] : vstr.split("|");
      const typeFullName =
        obj.targetNamespace && typeof obj.targetNamespace === "string"
          ? obj.targetNamespace + "#" + typeName
          : typeName;
      let typeClass: string = superTypeClass;
      if (isNumberTypeClass(superTypeClass)) {
        typeClass = "number";
      } else if (nsEnums[typeFullName] || typeData) {
        const filter = nsEnums[typeFullName]
          ? () => true
          : (x: string) =>
              x !== "length" &&
              x !== "pattern" &&
              x !== "maxLength" &&
              x !== "minLength";
        const tdsplit = typeData?.split(",").filter(filter);
        if (tdsplit?.length) {
          typeClass = '"' + tdsplit.join('" | "') + '"';
        }
      }
      if (isArray) {
        if (/^[A-Za-z0-9.]+$/.test(typeClass)) {
          typeClass += "[]";
        } else {
          typeClass = "Array<" + typeClass + ">";
        }
      }
      r[k2] =
        "/** " +
        typeFullName +
        "(" +
        String(typeData) +
        ") */ " +
        typeClass +
        ";";
    } else {
      const to = wsdlTypeToInterfaceObj(v, typeCollector);
      let tr: { [k: string]: any } | string;
      if (isArray) {
        let s = wsdlTypeToInterfaceString(to);
        if (typeCollector && typeCollector.ns) {
          if (
            hasOwnProperty(typeCollector.registered, k2) &&
            typeCollector.registered[k2] === s
          ) {
            s = typeCollector.ns + "$" + k2 + ";";
          } else if (hasOwnProperty(typeCollector.collected, k2)) {
            if (typeCollector.collected[k2] !== s) {
              typeCollector.collected[k2] = null;
            }
          } else {
            typeCollector.collected[k2] = s;
          }
        }
        s = s.replace(/\n/g, "\n    ");

        if (s.startsWith("/**")) {
          const i = s.indexOf("*/") + 2;
          s =
            s.substring(0, i) +
            " Array<" +
            s.substring(i).trim().replace(/;$/, "") +
            ">;";
        } else {
          s = s.trim().replace(/;$/, "");
          if (/^[A-Za-z0-9.]+$/.test(s)) {
            s += "[];";
          } else {
            s = "Array<" + s + ">;";
          }
        }

        tr = s;
      } else {
        tr = to;
        if (typeCollector && typeCollector.ns) {
          const ss = wsdlTypeToInterfaceString(to);
          if (
            hasOwnProperty(typeCollector.registered, k2) &&
            typeCollector.registered[k2] === ss
          ) {
            tr = typeCollector.ns + "$" + k2 + ";";
          } else if (hasOwnProperty(typeCollector.collected, k2)) {
            if (typeCollector.collected[k2] !== ss) {
              typeCollector.collected[k2] = null;
            }
          } else {
            typeCollector.collected[k2] = ss;
          }
        }
      }
      r[k2] = tr;
    }
  }
  // console.log("wsdlTypeToInterfaceObj:", r);
  return r;
}

function wsdlTypeToInterfaceString(d: { [k: string]: any }): string {
  const r: string[] = [];
  for (const k of Object.keys(d)) {
    const v: unknown = d[k];
    let p: string = k;
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(k)) {
      p = JSON.stringify(k);
    }
    if (typeof v === "string") {
      if (v.startsWith("/**")) {
        const i = v.indexOf("*/") + 2;
        r.push(v.substring(0, i));

        // for types like "xsd:string" only the "string" part is used
        const rawtype = v.substring(i).trim();
        const colon = rawtype.indexOf(":");
        if (colon !== -1) {
          const preamble = rawtype.substring(0, colon);
          const lastOpenBracket = preamble.lastIndexOf("<");
          if (lastOpenBracket !== -1) {
            r.push(
              p +
                ": " +
                preamble.substring(0, lastOpenBracket + 1) +
                rawtype.substring(colon + 1)
            );
          } else {
            r.push(p + ": " + rawtype.substring(colon + 1));
          }
        } else {
          r.push(p + ": " + rawtype);
        }
      } else {
        r.push(p + ": " + v);
      }
    } else {
      r.push(
        p +
          ": " +
          wsdlTypeToInterfaceString(d[k]).replace(/\n/g, "\n    ") +
          ";"
      );
    }
  }
  if (r.length === 0) {
    return "{||}";
  }
  return "{|\n    " + r.join("\n    ") + "\n|}";
}

function wsdlTypeToInterface(
  obj: { [k: string]: any },
  typeCollector?: TypeCollector
): string {
  return wsdlTypeToInterfaceString(wsdlTypeToInterfaceObj(obj, typeCollector));
}

export async function wsdl2flow(
  getSoapClient: () => Promise<soap.Client>
): Promise<ITypedWsdl> {
  const client = await getSoapClient();
  const r: ITypedWsdl = {
    client,
    files: {},
    methods: {},
    namespaces: {},
    types: {}
  };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const d: IClientDescription = client.describe();
  for (const service of Object.keys(d)) {
    for (const port of Object.keys(d[service])) {
      const collector = new TypeCollector(port + "Types");
      // console.log("-- %s.%s", service, port);
      if (!r.types[service]) {
        r.types[service] = {};
        r.methods[service] = {};
        r.files[service] = {};
        r.namespaces[service] = {};
      }
      if (!r.types[service][port]) {
        r.types[service][port] = {};
        r.methods[service][port] = {};
        r.files[service][port] = service + "/" + port;
        r.namespaces[service][port] = {};
      }

      for (let maxi = 0; maxi < 32; maxi++) {
        for (const method of Object.keys(d[service][port])) {
          // console.log("---- %s", method);
          wsdlTypeToInterface(d[service][port][method].input || {}, collector);
          wsdlTypeToInterface(d[service][port][method].output || {}, collector);
        }

        const reg = cloneObj(collector.registered);
        collector.registerCollected();
        const regKeys0: string[] = Object.keys(collector.registered);
        const regKeys1: string[] = Object.keys(reg);
        if (regKeys0.length === regKeys1.length) {
          let noChange = true;
          for (const rk of regKeys0) {
            if (collector.registered[rk] !== reg[rk]) {
              noChange = false;
              break;
            }
          }
          if (noChange) {
            break;
          }
        }
        if (maxi === 31) {
          console.warn("wsdl-to-ts: Aborted nested interface changes");
        }
      }

      const collectedKeys: string[] = Object.keys(collector.registered);
      if (collectedKeys.length) {
        const ns: { [k: string]: string } = (r.namespaces[service][port][
          collector.ns
        ] = {});
        for (const collectedKey of collectedKeys) {
          ns[collectedKey] =
            "export type " +
            collectedKey +
            " = " +
            collector.registered[collectedKey];
        }
      }

      for (const method of Object.keys(d[service][port])) {
        r.types[service][port][method + "Input"] = wsdlTypeToInterface(
          d[service][port][method].input || {},
          collector
        );
        r.types[service][port][method + "Output"] = wsdlTypeToInterface(
          d[service][port][method].output || {},
          collector
        );
        r.methods[service][port][method] =
          "(input: " +
          method +
          "Input, " +
          "cb: (err: any | null," +
          " result: " +
          method +
          "Output," +
          " raw: string, " +
          " soapHeader: {[k: string]: any; }) => any, " +
          "options?: any, " +
          "extraHeaders?: any" +
          "): void";
        r.methods[service][port][method + "Async"] =
          "(input: " +
          method +
          "Input, " +
          "options?: any, " +
          "extraHeaders?: any" +
          `): Promise<${method}Output>`;
      }
    }
  }
  return r;
}

function cloneObj<T extends { [k: string]: any }>(a: T): T {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const b: T = {} as any;
  for (const k of Object.keys(a)) {
    const val: unknown = a[k];
    const newVal: any =
      typeof val === "object" && val !== null
        ? Array.isArray(val)
          ? val.slice()
          : cloneObj(val)
        : val;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    b[k as keyof T] = newVal;
  }
  return b;
}

export function mergeTypedWsdl(a: ITypedWsdl, ...bs: ITypedWsdl[]): ITypedWsdl {
  const x: ITypedWsdl = {
    client: null,
    files: cloneObj(a.files),
    methods: cloneObj(a.methods),
    namespaces: cloneObj(a.namespaces),
    types: cloneObj(a.types)
  };
  for (const b of bs) {
    for (const service of Object.keys(b.files)) {
      if (!hasOwnProperty(x.files, service)) {
        x.files[service] = cloneObj(b.files[service]);
        x.methods[service] = cloneObj(b.methods[service]);
        x.types[service] = cloneObj(b.types[service]);
        x.namespaces[service] = cloneObj(b.namespaces[service]);
      } else {
        for (const port of Object.keys(b.files[service])) {
          if (!hasOwnProperty(x.files[service], port)) {
            x.files[service][port] = b.files[service][port];
            x.methods[service][port] = cloneObj(b.methods[service][port]);
            x.types[service][port] = cloneObj(b.types[service][port]);
            x.namespaces[service][port] = cloneObj(b.namespaces[service][port]);
          } else {
            x.files[service][port] = b.files[service][port];
            for (const method of Object.keys(b.methods[service][port])) {
              x.methods[service][port][method] =
                b.methods[service][port][method];
            }
            for (const type of Object.keys(b.types[service][port])) {
              x.types[service][port][type] = b.types[service][port][type];
            }
            for (const ns of Object.keys(b.namespaces[service][port])) {
              if (!hasOwnProperty(x.namespaces[service][port], ns)) {
                x.namespaces[service][port][ns] = cloneObj(
                  b.namespaces[service][port][ns]
                );
              } else {
                for (const nsi of Object.keys(
                  b.namespaces[service][port][ns]
                )) {
                  x.namespaces[service][port][ns][nsi] =
                    b.namespaces[service][port][ns][nsi];
                }
              }
            }
          }
        }
      }
    }
  }
  return x;
}

export function outputTypedWsdl(
  a: ITypedWsdl
): { file: string; data: string[] }[] {
  const r: { file: string; data: string[] }[] = [];
  for (const service of Object.keys(a.files)) {
    for (const port of Object.keys(a.files[service])) {
      const d: { file: string; data: string[] } = {
        file: a.files[service][port],
        data: []
      };
      if (a.types[service] && a.types[service][port]) {
        for (const type of Object.keys(a.types[service][port])) {
          d.data.push(`export type ${type} = ` + a.types[service][port][type]);
        }
      }
      if (a.methods[service] && a.methods[service][port]) {
        const ms: string[] = [];
        for (const method of Object.keys(a.methods[service][port])) {
          ms.push(method + a.methods[service][port][method] + ";");
        }
        if (ms.length) {
          d.data.push(`export type ${port} = {|\n` + ms.join("\n") + "\n|}");
        }
      }
      if (a.namespaces[service] && a.namespaces[service][port]) {
        for (const ns of Object.keys(a.namespaces[service][port])) {
          const ms: string[] = [];
          for (const nsi of Object.keys(a.namespaces[service][port][ns])) {
            ms.push(
              a.namespaces[service][port][ns][nsi].replace(/\n/g, "\n    ")
            );
          }
          if (ms.length) {
            d.data.push(
              "export namespace " + ns + " {\n    " + ms.join("\n    ") + "\n}"
            );
          }
        }
      }
      d.data = d.data.map((_) =>
        format(_, {
          parser: "babel-flow"
        })
      );
      r.push(d);
    }
  }
  return r;
}

interface IDefinitionFileContentsOutput {
  fileContents: string;
}

interface ICreateDefinitionFileContentsOptions {
  getModuleName?: (fileName: string) => string;
}

export function createDefinitionFileContents(
  wsdl: ITypedWsdl,
  options?: ICreateDefinitionFileContentsOptions
): IDefinitionFileContentsOutput {
  const outputs = outputTypedWsdl(mergeTypedWsdl(wsdl));
  let combinedOutput = outputs
    .map(({ file, data }) => {
      const moduleName = options?.getModuleName?.(file) ?? "wsdl-types/" + file;
      const moduleDecl = "declare module " + JSON.stringify(moduleName) + " {";
      return [moduleDecl, ...data, "}"].join("\n");
    })
    .join("\n\n")
    .replace(/(export (?:type|interface|class))/g, "declare $1");
  combinedOutput = "// @flow\n/* eslint-disable */\n" + combinedOutput;
  return { fileContents: format(combinedOutput, { parser: "babel-flow" }) };
}
