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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CppAnalyzer = exports.CppAnalyzerMode = void 0;
const node_path_1 = __importDefault(require("node:path"));
const analyzer_1 = require("./analyzer");
const PVSErrors = __importStar(require("./errors"));
const Utils = __importStar(require("./actions-utils"));
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
/**
 * Special class to easy extend an analyzer output
 */
// export class CppAnalyzerRunResult {
//     rawReport!: string
// };
var CppAnalyzerMode;
(function (CppAnalyzerMode) {
    CppAnalyzerMode[CppAnalyzerMode["Analyze"] = 0] = "Analyze";
    CppAnalyzerMode[CppAnalyzerMode["Trace"] = 1] = "Trace";
})(CppAnalyzerMode || (exports.CppAnalyzerMode = CppAnalyzerMode = {}));
/**
 * Analysis task for PVS-Studio C++ analyzer
 *
 * The class contains all the options that can be obtained from the GitHub Actions API.
 * These data are used to generate arguments for launching the analyzer.
 */
class CppAnalysisTask {
    fileToAnalyze;
    outputRawReportFilePath;
    licenseFilePath;
    analysisMode;
    sourceTreeRoot;
    excludedDirs;
    rulesConfigFiles;
    suppressFiles;
    additionalArgs;
    parallelCount;
    getOutput() {
        return this.outputRawReportFilePath;
    }
}
class CppTraceTask {
    traceCommand;
    ignoreReturnCode;
    outputFilepath;
    additionalArgs;
    getOutput() {
        return this.outputFilepath;
    }
}
class CppAnalyzer extends analyzer_1.AbstractAnalyzer {
    async analyzerFilePath() {
        return this.backend.getCppAnalyzerFilePath();
    }
    async coreFilePath() {
        return this.backend.getCppAnalyzerCoreFilePath();
    }
    async available() {
        return Boolean(await this.analyzerFilePath());
    }
    async install() {
        return this.backend.install('cpp');
    }
    async generateAnalysisTask() {
        let task = new CppAnalysisTask();
        task.fileToAnalyze = core.getInput('file-to-analyze', Utils.RequiredInputWithTrim);
        task.analysisMode = core.getInput('analysis-mode', Utils.OptionalInputWithTrim);
        task.sourceTreeRoot = core.getInput('source-tree-root', Utils.OptionalInputWithTrim);
        task.excludedDirs = Utils.splitStringValues(core.getInput('excluded-dirs', Utils.OptionalInputWithTrim));
        task.suppressFiles = Utils.splitStringValues(core.getInput('suppress-files', Utils.OptionalInputWithTrim));
        task.rulesConfigFiles = Utils.splitStringValues(core.getInput('rules-configs', Utils.OptionalInputWithTrim));
        task.additionalArgs = Utils.splitStringValues(core.getInput('additional-args', Utils.OptionalInputWithTrim));
        const parallelText = core.getInput('parallel', Utils.OptionalInputWithTrim);
        if (parallelText !== '0') {
            const parallelValue = parseInt(parallelText, 10);
            if (isNaN(parallelValue)) {
                throw new PVSErrors.PVSError("The 'parallel' input should be a number!");
            }
            task.parallelCount = parallelValue;
        }
        const outputFileText = core.getInput('output-file', Utils.RequiredInputWithTrim);
        const parts = node_path_1.default.parse(outputFileText);
        task.outputRawReportFilePath = `${parts.dir}/${parts.name}-raw.log`;
        const licenseFileText = core.getInput('licence-file', Utils.OptionalInputWithTrim);
        if (licenseFileText) {
            task.licenseFilePath = licenseFileText;
        }
        else {
            task.licenseFilePath = await this.backend.exportLicenseFromEnvVars();
        }
        return task;
    }
    generateTraceTask() {
        let task = new CppTraceTask();
        task.traceCommand = core.getInput('trace-args', Utils.RequiredInputWithTrim);
        task.outputFilepath = core.getInput('output-file', Utils.RequiredInputWithTrim);
        task.ignoreReturnCode = core.getBooleanInput('ignore-return-code', Utils.OptionalInputWithTrim);
        task.additionalArgs = Utils.splitStringValues(core.getInput('additional-args', Utils.OptionalInputWithTrim));
        return task;
    }
    async generateTask(mode) {
        if (mode === CppAnalyzerMode.Analyze) {
            return this.generateAnalysisTask();
        }
        else if (mode === CppAnalyzerMode.Trace) {
            return this.generateTraceTask();
        }
        throw new PVSErrors.PVSError('Unknown mode');
    }
    createArgs(task) {
        if (task instanceof CppAnalysisTask) {
            return this.createAnalysisArgs(task);
        }
        else if (task instanceof CppTraceTask) {
            return this.createTraceArgs(task);
        }
        throw new PVSErrors.PVSError('Unknown mode');
    }
    createAnalysisArgs(task) {
        let args = [
            'analyze',
            '-f',
            task.fileToAnalyze,
            '-o',
            task.outputRawReportFilePath,
            '-l',
            task.licenseFilePath
        ];
        if (task.analysisMode) {
            args.push('-a', task.analysisMode);
        }
        if (task.parallelCount) {
            args.push('-j', task.parallelCount.toString());
        }
        if (task.sourceTreeRoot) {
            args.push('-r', task.sourceTreeRoot);
        }
        Utils.appendArgs(args, task.excludedDirs, '-e');
        Utils.appendArgs(args, task.rulesConfigFiles, '-R');
        Utils.appendArgs(args, task.suppressFiles, '-s');
        Utils.appendArgs(args, task.additionalArgs);
        return args;
    }
    createTraceArgs(task) {
        let args = ['trace', '-o', task.outputFilepath];
        if (task.ignoreReturnCode) {
            args.push('-i');
        }
        Utils.appendArgs(args, task.additionalArgs);
        args.push('--', task.traceCommand);
        return args;
    }
    async run(mode) {
        const task = await this.generateTask(mode);
        core.debug(`Task: ${task}`);
        const args = this.createArgs(task);
        core.debug(`Args: ${args}`);
        const analyzerExecutable = await this.analyzerFilePath();
        const res = await exec.getExecOutput(`"${analyzerExecutable}"`, args);
        if (res.exitCode !== 0) {
            throw new Error(`Analyzer exited with code ${res.exitCode}. Details: ${res}`);
        }
        return task.getOutput();
    }
}
exports.CppAnalyzer = CppAnalyzer;
//# sourceMappingURL=cpp-analyzer.js.map