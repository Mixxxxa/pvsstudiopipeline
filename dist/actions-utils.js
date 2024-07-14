"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequiredInputWithTrim = exports.OptionalInputWithTrim = void 0;
exports.splitStringValues = splitStringValues;
exports.appendArgs = appendArgs;
exports.is64Bit = is64Bit;
exports.isWindows = isWindows;
exports.isLinux = isLinux;
exports.isMacOS = isMacOS;
exports.checkPathExist = checkPathExist;
const fsp = __importStar(require("node:fs/promises"));
function splitStringValues(text) {
    if (!text || text.length === 0) {
        return [];
    }
    const regex = /[;\n]/;
    const parts = text.split(regex);
    const filteredParts = parts.filter(part => part.trim() !== '');
    return filteredParts;
}
function appendArgs(container, values, flag) {
    for (let value of values) {
        if (flag) {
            container.push(flag);
        }
        container.push(value);
    }
}
function is64Bit() {
    return ['x64', 'arm64'].includes(process.arch);
}
function isWindows() {
    return process.platform === 'win32';
}
function isLinux() {
    return process.platform === 'linux';
}
function isMacOS() {
    return process.platform === 'darwin';
}
async function checkPathExist(pathToCheck) {
    if (!pathToCheck) {
        return false;
    }
    try {
        await fsp.access(pathToCheck, fsp.constants.R_OK);
    }
    catch {
        return false;
    }
    return true;
}
exports.OptionalInputWithTrim = {
    required: false,
    trimWhitespace: true
};
exports.RequiredInputWithTrim = {
    required: false,
    trimWhitespace: true
};
// export function getInput(name: string, optional: boolean) : string {
//     const text = core.getInput(name, optional ? OptionalInputWithTrim
//                                               : RequiredInputWithTrim);
//     if(!optional && !text) {
//         throw
//     }
// }
//# sourceMappingURL=actions-utils.js.map