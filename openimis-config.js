const fs = require("fs");
const pkg = require("./package.json");

function processLocales(config) {
  var locales = fs.createWriteStream("./src/locales.js");
  let localeByLang = config["locales"].reduce((lcs, lc) => {
    lc.languages.forEach((lg) => (lcs[lg] = lc.intl));
    return lcs;
  }, {});
  let filesByLang = config["locales"].reduce((fls, lc) => {
    lc.languages.forEach((lg) => (fls[lg] = lc.fileNames));
    return fls;
  }, {});
  locales.write(`export const locales = ${JSON.stringify(config["locales"].map((lc) => lc.intl))}`);
  locales.write(`\nexport const fileNamesByLang = ${JSON.stringify(filesByLang)}`);
  locales.write(`/* eslint import/no-anonymous-default-export: [2, {"allowObject": true}] */`);
  locales.write(`\nexport default ${JSON.stringify(localeByLang)}`);
}

function getConfig() {
  // Try to get the configuration from the args
  if (process.argv[2]) {
    console.log(`  load configuration from '${process.argv[2]}'`);
    return JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
  } else if (process.env.OPENIMIS_CONF_JSON) {
    console.log(`  load configuration from env`);
    return JSON.parse(process.env.OPENIMIS_CONF_JSON);
  } else if (fs.existsSync("./openimis.json")) {
    console.log(`  load configuration from ./openimis.json`);
    return JSON.parse(fs.readFileSync("./openimis.json", "utf-8"));
  } else {
    throw new Error(
      "No configuration file found. Please provide a configuration in the CLI or in the OPENIMIS_CONF_JSON environment variable",
    );
  }
}

function processModules(modules) {
  const stream = fs.createWriteStream("./src/modules.js");

  stream.write(`
export const packages = [
  ${modules.map(({ moduleName }) => `"${moduleName}"`).join(",\n  ")}
];\n
`);

  stream.write(`
export function loadModules (cfg = {}) {
  return [
    ${modules
      .map(
        ({ name, logicalName, moduleName }) =>
          `require("${moduleName}").${name ?? "default"}(cfg["${logicalName}"] || {})`,
      )
      .join(",\n    ")}
  ];\n
}
`);

  stream.end();
}

/*
"@openimis/fe-core@git+https://github.com/openimis/openimis-fe-core_js.git#develop"
=> moduleName="@openimis/fe-core" and version="git+https://github.com/openimis/openimis-fe-core_js.git#develop"
"@openimis/fe-language_my@git+ssh://git@github.com:BLSQ/openimis-fe-language_my_js.git#main"
=> moduleName="@openimis/fe-language_my" and version="git+ssh://git@github.com:BLSQ/openimis-fe-language_my_js.git#main"
"@openimis/fe-core@>=1.5.1"
=> moduleName="@openimis/fe-core" and version=">=1.5.1"
 */
function splitModuleNameAndVersion(str) {
    // Finding the index of the first '@' symbol
    let firstAtIndex = str.indexOf('@');
    // Finding the index of the second '@' symbol
    let secondAtIndex = str.indexOf('@', firstAtIndex + 1);

    let moduleName, version;
    if (secondAtIndex !== -1) {
        // If there is a second '@', split based on its position
        moduleName = str.substring(0, secondAtIndex);
        version = str.substring(secondAtIndex + 1);
    } else {
        // If there is no second '@', the entire string is the moduleName
        moduleName = str;
        version = '';
    }

    return { moduleName, version };
}

function main() {
  /*
  Load openIMIS configuration. Configuration is taken from args if provided or from the environment variable
  */

  // Remove @openimis dependencies from package.json
  console.log("Remove @openimis dependencies from package.json");
  for (const key in pkg.dependencies) {
    if (key.startsWith("@openimis/")) {
      // This only covers modules made from the openIMIS organization
      console.log(`  removed ${key}`);
      delete pkg.dependencies[key];
    }
  }

  // Get openIMIS configuration from args
  console.log("Load configuration");
  const config = getConfig();

  console.log("Process Locales");
  processLocales(config);

  console.log("Process Modules");
  const modules = [];
  for (const module of config.modules) {
    const { npm, name, logicalName } = module;
    let ver = splitModuleNameAndVersion(npm);
    // Find version number
    if (ver.version === '') {
      throw new Error(`  Module ${npm} has no version set.`);
    }
    console.log(`  added "${ver.moduleName}": ${ver.version}`);
    pkg.dependencies[ver.moduleName] = ver.version;
    modules.push({
      moduleName: ver.moduleName,
      verison: ver.version,
      name,
      npm,
      logicalName: logicalName || npm.match(/([^/]*)\/([^@]*).*/)[2],
    });
  }
  processModules(modules);

  console.log("Save package.json");
  fs.writeFileSync("./package.json", JSON.stringify(pkg, null, 2), { encoding: "utf-8", flag: "w" });
}

main();
