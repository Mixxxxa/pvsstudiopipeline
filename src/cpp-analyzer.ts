import path from "node:path";
import { AbstractAnalyzer } from "./analyzer";
import * as PVSErrors from './errors'
import * as Utils from "./actions-utils";
import * as core from '@actions/core'
import * as exec from '@actions/exec'

/**
* Special class to easy extend an analyzer output
*/
export class CppAnalyzerRunResult {
    rawReport!: string
};

/**
 * Analysis task for PVS-Studio C++ analyzer
 * 
 * The class contains all the options that can be obtained from the GitHub Actions API.
 * These data are used to generate arguments for launching the analyzer.
 */
class CppAnalysisTask {
    fileToAnalyze!: string;
    outputRawReportFilePath!: string;

    licenseFilePath!: string;
    excludedDirs!: Array<string>;
    rulesConfigFiles!: Array<string>;
    suppressFiles!: Array<string>;
    additionalArgs!: Array<string>;
    parallelCount?: number;
    analysisMode?: string;
    sourceTreeRoot?: string;
};

class CppTraceTask {
    traceCommand!: string;
    ignoreReturnCode!: boolean;
    outputFilepath!: string;
    additionalArgs!: Array<string>;
};

export class CppAnalyzer extends AbstractAnalyzer {

    public coreFilePath(): string {
        throw new PVSErrors.Unimplemented();
    }

    public analyzerFilePath(): string {
        throw new PVSErrors.Unimplemented();
    }

    public available(): boolean {
        throw new PVSErrors.Unimplemented();
    }

    public async install(): Promise<void> {
        throw new PVSErrors.Unimplemented();
    }

    protected generateRawLogFilePath(sourceFilePath: string): string {
        const parts = path.parse(sourceFilePath)
        return `${parts.dir}/${parts.name}-raw.log`
    }

    protected async generateAnalysisTask(): Promise<CppAnalysisTask> {
        let task = new CppAnalysisTask();
        task.fileToAnalyze = core.getInput('file-to-analyze', Utils.RequiredInputWithTrim);
        
        const analysisModeText = core.getInput('analysis-mode', Utils.OptionalInputWithTrim);
        if(analysisModeText) {
            task.analysisMode = analysisModeText;
        }

        task.sourceTreeRoot = core.getInput('source-tree-root', Utils.OptionalInputWithTrim);
        task.excludedDirs = Utils.splitStringValues(core.getInput('excluded-dirs',
            Utils.OptionalInputWithTrim));
        task.suppressFiles = Utils.splitStringValues(core.getInput('suppress-files',
            Utils.OptionalInputWithTrim));
        task.rulesConfigFiles = Utils.splitStringValues(core.getInput('rules-configs',
            Utils.OptionalInputWithTrim));
        task.additionalArgs = Utils.splitStringValues(core.getInput('additional-args',
            Utils.OptionalInputWithTrim));

        const parallelText = core.getInput('parallel', Utils.OptionalInputWithTrim)
        if (parallelText && parallelText !== '0') {
            const parallelValue = parseInt(parallelText, 10);
            if (isNaN(parallelValue)) {
                throw new PVSErrors.PVSError("The 'parallel' input should be a number!")
            }
            task.parallelCount = parallelValue;
        }

        const outputFormatText = core.getInput('output-format', Utils.OptionalInputWithTrim);
        const outputFileText = core.getInput('output-file', Utils.OptionalInputWithTrim);
        if (!outputFileText) {
            throw new PVSErrors.PVSError("The 'output-file' input should be a specified!");
        }

        task.outputReportFilePath = outputFileText;
        // If the output format is set, we need to save the raw report separately 
        if (outputFormatText) {
            task.outputFormat = outputFormatText;
            const parts = path.parse(outputFileText);
            task.outputRawReportFilePath = `${parts.dir}/${parts.name}-raw.log`
        } else {
            task.outputRawReportFilePath = outputFileText;
        }

        const licenseFileText = core.getInput('licence-file', Utils.OptionalInputWithTrim);
        if (licenseFileText) {
            task.licenseFilePath = licenseFileText;
        } else {
            task.licenseFilePath = await this.backend.exportLicenseFromEnvVars();
        }

        return task;
    }

    protected generateTraceTask(): CppTraceTask {
        let task = new CppTraceTask();
        task.traceCommand = core.getInput('trace-args', Utils.RequiredInputWithTrim);
        task.outputFilepath = core.getInput('output-file', Utils.RequiredInputWithTrim);
        task.ignoreReturnCode = core.getBooleanInput('ignore-return-code', Utils.OptionalInputWithTrim);
        task.additionalArgs = Utils.splitStringValues(core.getInput('additional-args', 
            Utils.OptionalInputWithTrim));
        return task;
    }

    protected createArgs(task: CppAnalyzerTask): Array<string> {
        let args: Array<string> = [];
        args.push('analyze');
        if (!task.projectFilePath) {
            throw new PVSErrors.PVSError("The project file (compile DB or trace-file) should be a specified!");
        }

        args.push('-f', task.projectFilePath,
            '-o', task.outputRawReportFilePath,
            '-l', task.licenseFilePath
        );

        if (task.analysisMode) {
            args.push('-a', task.analysisMode);
        }

        if (task.parallelCount) {
            args.push('-j', task.parallelCount.toString());
        }

        if (task.excludedDirs) {
            for (let dir of task.excludedDirs) {
                args.push('-e', dir);
            }
        }

        if (task.rulesConfigFiles) {
            for (let file of task.rulesConfigFiles) {
                args.push('-R', file);
            }
        }

        if (task.suppressFiles) {
            for (let file of task.suppressFiles) {
                args.push('-s', file);
            }
        }

        if (task.additionalArgs) {
            for (let arg of task.additionalArgs) {
                args.push(arg);
            }
        }
        return args;
    }

    public async run(): Promise<CppAnalyzerRunResult> {
        const task = await this.generateAnalysisTask();
        const args = this.createArgs(task);

        const analyzerExecutable = await this.analyzerFilePath();
        const res = await exec.getExecOutput(`"${analyzerExecutable}"`, args)
        if (res.exitCode !== 0) {
            throw new Error(
                `Analyzer exited with code ${res.exitCode}. Details: ${res}`
            )
        }

        const result = new CppAnalyzerRunResult();
        result.rawReport = task.outputRawReportFilePath;
        return result;
    }
};