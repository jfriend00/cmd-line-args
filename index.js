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


// sample spec
let spec = [
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
];

const fs = require('fs');
const path = require('path');

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
    } catch(e) {
        if (e.code === 'ENOENT') {
            throw new Error(`${pathToCheck} does not exist in ${wholeArg}`)
        }
        throw e;
    }
}

function processArgs(data, exit = true) {
    let result = {unnamed: []};
    try {
        if (!Array.isArray(data)) {
            throw new TypeError("processArgs expects an array for an argument");
        }
        // parse the description into both a spec object and a default result object
        // spec object is all lowercase keys so we can do a case insensitive match
        // result object is original case
        let spec = {};
        let origCase = new Map();

        for (let i = 0; i < data.length; i += 2) {
            let [arg, val] = data[i].split("=");
            let lowerArg = arg.toLowerCase();
            // save original case in the map so we can get it back later
            // when all we have it the lowercase
            // this allows us to do case insensitive matching on the arguments
            // but have output properties be case sensitive for the programmer
            origCase.set(lowerArg, arg);
            // resultKey is without leading "-"
            let resultName = arg.startsWith("-") ? arg.slice(1) : arg;
            result[resultName] = data[i + 1];
            // if no "=" part in the spec, then it's just a flag
            spec[lowerArg] = val ? val : "flag";
        }
        if (process.argv.length > 2) {
            let args = process.argv.slice(2);
            for (let i = 0; i < args.length; i++) {
                let wholeArg = args[i];
                let [argOrig, val] = wholeArg.split("=");
                let arg = argOrig.toLowerCase();
                let type = spec[arg];
                if (!type) {
                    // didn't find this argument in the spec
                    if (arg.startsWith("-")) {
                        throw new Error(`Unknown argument ${argOrig}`);
                    } else {
                        result.unnamed.push(args[i]);
                    }
                } else {
                    let argName = origCase.get(arg);
                    let resultName = argName.startsWith("-") ? argName.slice(1) : argName;
                    // we have a type that will look like: "flag", "num", "str", "yesno", "dir", "file"
                    if (type === "flag") {
                        result[resultName] = true;
                    } else {
                        if (!val) {
                            throw new Error(`Expecting ${argName}=value in "${wholeArg}"`);
                        }
                        switch(type) {
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
                        }
                    }
                }
            }
        }
    } catch(e) {
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



console.log(processArgs(spec));


module.exports = processArgs;
