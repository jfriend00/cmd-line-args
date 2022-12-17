// -noDisk          don't write to disk
// -noCleanup       erase bucket files when done
// -analyzeOnly     analyze files in bucket directory only
// -skipAnalyze     skip the analysis, just generate the bucket files
// -workers=nnn     use this many workers for key generation
// -numToBatch=nnn  how many in a batch to send back from worker to main thread
// -dirs="path1;path2;path3"


// pass in
// -xxxxx
// whether it's an =yyyy
// when the = should be split
// plain options with no - and which are numbers of paths
// type checking
//
// ["-nodisk", false, "-workers=num", 0, "-dirs=[dir]", null]

// types are
// num
// str
// yesno    (accepts "y", "yes", "n", "no")
// dir      (will be checked for existence)
// file     (will be checked for existence)
// filepath (extract filename and path will be checked for existence)
//
// result {nodisk: true, workers: 7, dirs:["aaa", "bbb"], unnamed: ["1,000,000,000"]}


/*
// sample spec
let specData = [
    "-nodisk", false,           // single option with default avlue
    "-workers=num", 0,          // option with numeric parameter
    "-name=str", "",            // option with string parameter
    "-file=file", "",           // option with filename parameter where filename must exist
    "-dir=dir", "",             // option with directory parameter where directory must exist
    "-disk=yesno", true,        // yes/no option
    "-output=filepath", null,   // option with filepath where directory much exist
    "-dirs=[dir]", null,        // option with multiple directories
    "-input=[file]", [],        // option with multiple filenames
    "-names=[str]", [],         // option with multiple strings
    "-files=list=normal,all,hidden,system", "normal"   // one of several preset values
];
*/

const fs = require('node:fs');
const path = require('node:path');

// these are the types allowed
const types = {
    file: ["file", "isFile"],                   // make sure the file exists
    dir: ["directory", "isDirectory"],          // make sure the directory exists
    filepath: ["directory", "isDirectory"]      // strip the filename and make sure the path exists
};

function checkFile(val, wholeArg, type = "file") {
    let pathToCheck = val;
    if (type === "filepath") {
        pathToCheck = path.dirname(val);
    }
    try {
        let stats = fs.statSync(pathToCheck);
        let [fsType, fsMethod] = types[type];
        if (!fsType) {
            throw new TypeError(`Invalid type ${type} parameter in ${wholeArg}`);
        }
        if (stats[fsMethod]()) {
            return true;
        } else {
            throw new Error(`${pathToCheck} is not a file in ${wholeArg}`);
        }
    } catch (e) {
        if (e.code === 'ENOENT') {
            throw new Error(`${pathToCheck} does not exist in ${wholeArg}`)
        }
        throw e;
    }
}

// something is considered an option if it starts with a - 
function isOption(arg) {
    return arg.startsWith("-");
}

function trimArg(arg) {
    return isOption(arg) ? arg.slice(1) : arg;
}

const possibleTypes = new Set(["str", "num", "file", "dir", "yesno", "flag", "filepath", "[dir]", "[file]", "[str]", "list"]);

function processArgsArray(data, args, exit = true) {
    // this is the final result if all command line argument processing
    const result = { unnamed: [] };

    try {
        if (!Array.isArray(data)) {
            throw new TypeError("processArgs expects an array for an argument");
        }
        /*
        parse the description into both a spec object and a default result object

        The spec object is a series of  key: type from "/key=type" in the definition
        The result object is key: value where value starts out with the default value
        spec object is all lowercase keys so we can do a case insensitive match
        result object is original case

        It's property: value
        Usually, value is a string which represents the type
        But, if value is an object, then it's a type with other specifications and obj.type is the type

        Sample spec object that we build from the cmdLineSpec input passed in:

        let spec = {
                // "nodisk", "false"
                "nodisk": {type: "flag"}

                // "crcfile=filepath", "",
                "crcfile": {type: "filepath"}

                // "wildcard=[str]"
                "wildcard": {type: "[str]"}

                // "files=str=normal,system,hidden,all", ""
                "files": {type: "str", allowedValues: Set(["normal", "system", "hidden", "all"])}
            }
        */
        const spec = {};

        // process the passed in cmd line argument specification
        // so we know what we're looking for in parsing the comamnd line
        function parseSpec() {
            for (let i = 0; i < data.length; i += 2) {
                const [arg, type = "flag", list] = data[i].split("=");

                // check to see if the type is allowed
                if (!possibleTypes.has(type)) {
                    throw new Error(`Unexpected type "${type}" specified in "${data[i]}"`);
                }

                // allowed values are a comma delimited string with no spaces around the commas
                const allowedValues = list ? new Set(list.toLowerCase().split(",")) : null;

                const lowerArg = arg.toLowerCase();

                // initialize default value
                result[trimArg(lowerArg)] = data[i + 1];
                spec[lowerArg] = { type, allowedValues };
            }
        }

        function parseArgs() {
            for (const wholeArg of args) {
                /* three possibilities here for each argument:
                -option=value
                -option
                sometext
                */

                if (!isOption(wholeArg)) {
                    // if not an option, then treat it as an unnamed argument
                    result.unnamed.push(wholeArg);
                    continue;
                }
                const [argOrig, val] = wholeArg.split("=");
                const arg = argOrig.toLowerCase();
                const specObj = spec[arg];
                if (!specObj) {
                    throw new Error(`Unknown argument ${argOrig}`);
                }

                const type = specObj.type;
                const resultName = trimArg(arg);

                if (type === "flag") {
                    result[resultName] = true;
                    continue;
                }

                if (!val) {
                    throw new Error(`Expecting ${argName}=value in "${wholeArg}"`);
                }

                switch (type) {
                    case "num": {
                        // strip commas and underscores
                        if (/[^\d,_]/.test(val)) {
                            throw new Error(`Expecting number ${argName}=nnn in "${wholeArg}"`);
                        }
                        val = val.replace(/[,_]/g, "");
                        result[resultName] = parseInt(val, 10);
                        break;
                    }
                    case "str": {
                        result[resultName] = val;
                        break;
                    }
                    case "[str]": {
                        result[resultName] = val.split(";");
                        break;
                    }
                    case "yesno": {
                        let v = val.toLowerCase();
                        if (v === "y" || v === "yes" || v === "1") {
                            result[resultName] = true;
                        } else if (v === "n" || v === "no" || v === "0") {
                            result[resultName] = false;
                        } else {
                            throw new Error(`Expecting value after = of "yes", "y", "1", "no", "n" or "0" in "${wholeArg}"`);
                        }
                        break;
                    }
                    case "dir": {
                        checkFile(val, wholeArg, "dir");
                        result[resultName] = path.resolve(val);
                        break;
                    }
                    case "file": {
                        checkFile(val, wholeArg, "file");
                        result[resultName] = path.resolve(val);
                        break;
                    }
                    case "[dir]": {
                        let parts = val.split(";")
                        for (let [index, dir] of parts.entries()) {
                            checkFile(dir, wholeArg, "dir");    // will throw the error if not correct
                            parts[index] = path.resolve(dir);
                        }
                        result[resultName] = parts;
                        break;
                    }
                    case "[file]": {
                        let parts = val.split(";")
                        for (let [index, dir] of parts.entries()) {
                            checkFile(dir, wholeArg, "file");    // will throw the error if not correct
                            parts[index] = path.resolve(dir);
                        }
                        result[resultName] = parts;
                        break;
                    }
                    case "filepath": {
                        checkFile(val, wholeArg, "filepath");
                        result[resultName] = path.resolve(val);
                        break;
                    }
                    case "list": {
                        // check to see if val is an allowedValue
                        if (!specObj.allowedValues.has(val)) {
                            throw new Error(`Unexpected value "${val}" in "${wholeArg}"`);
                        }
                        result[resultName] = val;
                        break;
                    }
                    default: {
                        throw new Error(`Unexpected argument type in specification: "${type}" in "${wholeArg}"`);
                    }
                }
            }
        }

        parseSpec();
        parseArgs();


    } catch (e) {
        if (exit) {
            //console.log(e);
            console.log(e.message);
            process.exit(1);
        } else {
            throw e;
        }
    }
    return result;
}

// uses process.argv
function processArgs(spec, exit = true) {
    const args = process.argv.length > 2 ? process.argv.slice(2) : [];
    return processArgsArray(spec, args, exit);
}

module.exports = { processArgs, processArgsArray };
