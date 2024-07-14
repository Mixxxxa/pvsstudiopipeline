import path from 'node:path'
import { AbstractAnalyzer } from './analyzer'
import * as PVSErrors from './errors'
import * as Utils from './actions-utils'
import * as core from '@actions/core'
import * as exec from '@actions/exec'

/**
 * Special class to easy extend an analyzer output
 */
// export class CppAnalyzerRunResult {
//     rawReport!: string
// };

export enum CppAnalyzerMode {
  Analyze,
  Trace
}

/**
 * Analysis task for PVS-Studio C++ analyzer
 *
 * The class contains all the options that can be obtained from the GitHub Actions API.
 * These data are used to generate arguments for launching the analyzer.
 */
class CppAnalysisTask {
  fileToAnalyze!: string
  outputRawReportFilePath!: string
  licenseFilePath!: string
  analysisMode!: string
  sourceTreeRoot!: string
  excludedDirs!: Array<string>
  rulesConfigFiles!: Array<string>
  suppressFiles!: Array<string>
  additionalArgs!: Array<string>
  parallelCount?: number

  public getOutput(): string {
    return this.outputRawReportFilePath
  }
}

class CppTraceTask {
  traceArgs!: Array<string>
  ignoreReturnCode!: boolean
  outputFilepath!: string
  additionalArgs!: Array<string>

  public getOutput(): string {
    return this.outputFilepath
  }
}

export class CppAnalyzer extends AbstractAnalyzer {
  public async analyzerFilePath(): Promise<string | undefined> {
    return this.backend.getCppAnalyzerFilePath()
  }

  public async coreFilePath(): Promise<string | undefined> {
    return this.backend.getCppAnalyzerCoreFilePath()
  }

  public async available(): Promise<boolean> {
    return Boolean(await this.analyzerFilePath())
  }

  public async install(): Promise<void> {
    return this.backend.install('cpp')
  }

  protected async generateAnalysisTask(): Promise<CppAnalysisTask> {
    let task = new CppAnalysisTask()
    task.fileToAnalyze = core.getInput(
      'file-to-analyze',
      Utils.RequiredInputWithTrim
    )
    task.analysisMode = core.getInput(
      'analysis-mode',
      Utils.OptionalInputWithTrim
    )
    task.sourceTreeRoot = core.getInput(
      'source-tree-root',
      Utils.OptionalInputWithTrim
    )
    task.excludedDirs = Utils.splitStringValues(
      core.getInput('excluded-dirs', Utils.OptionalInputWithTrim)
    )
    task.suppressFiles = Utils.splitStringValues(
      core.getInput('suppress-files', Utils.OptionalInputWithTrim)
    )
    task.rulesConfigFiles = Utils.splitStringValues(
      core.getInput('rules-configs', Utils.OptionalInputWithTrim)
    )
    task.additionalArgs = Utils.splitStringValues(
      core.getInput('additional-args', Utils.OptionalInputWithTrim)
    )

    const parallelText = core.getInput('parallel', Utils.OptionalInputWithTrim)
    if (parallelText !== '0') {
      const parallelValue = parseInt(parallelText, 10)
      if (isNaN(parallelValue)) {
        throw new PVSErrors.PVSError("The 'parallel' input should be a number!")
      }
      task.parallelCount = parallelValue
    }

    const outputFileText = core.getInput(
      'output-file',
      Utils.RequiredInputWithTrim
    )
    const parts = path.parse(outputFileText)
    task.outputRawReportFilePath = `${parts.dir}/${parts.name}-raw.log`

    const licenseFileText = core.getInput(
      'licence-file',
      Utils.OptionalInputWithTrim
    )
    if (licenseFileText) {
      task.licenseFilePath = licenseFileText
    } else {
      task.licenseFilePath = await this.backend.exportLicenseFromEnvVars()
    }

    return task
  }

  protected generateTraceTask(): CppTraceTask {
    let task = new CppTraceTask()
    const traceArgText = core.getInput('trace-args', Utils.RequiredInputWithTrim)
    try {
      const traceArgs = JSON.parse(traceArgText);
      if(!Utils.isArrayOfStrings(traceArgs) || traceArgs.length === 0) {
        throw new SyntaxError()
      }
      task.traceArgs = traceArgs;
    } catch(e) {
      if(e instanceof SyntaxError) {
        throw new PVSErrors.PVSError(`Unable to parse the 'trace-args' input (${traceArgText}). Non empty JSON array of string was expected.`)
      }
      // Rethrow if not a syntax error
      throw e;
    }
    task.outputFilepath = core.getInput(
      'output-file',
      Utils.RequiredInputWithTrim
    )
    task.ignoreReturnCode = core.getBooleanInput(
      'ignore-return-code',
      Utils.OptionalInputWithTrim
    )
    task.additionalArgs = Utils.splitStringValues(
      core.getInput('additional-args', Utils.OptionalInputWithTrim)
    )
    return task
  }

  public async generateTask(
    mode: CppAnalyzerMode
  ): Promise<CppAnalysisTask | CppTraceTask> {
    if (mode === CppAnalyzerMode.Analyze) {
      return this.generateAnalysisTask()
    } else if (mode === CppAnalyzerMode.Trace) {
      return this.generateTraceTask()
    }
    throw new PVSErrors.PVSError('Unknown mode')
  }

  protected createArgs(task: CppAnalysisTask | CppTraceTask): Array<string> {
    if (task instanceof CppAnalysisTask) {
      return this.createAnalysisArgs(task as CppAnalysisTask)
    } else if (task instanceof CppTraceTask) {
      return this.createTraceArgs(task as CppTraceTask)
    }
    throw new PVSErrors.PVSError('Unknown mode')
  }

  protected createAnalysisArgs(task: CppAnalysisTask): Array<string> {
    let args: Array<string> = [
      'analyze',
      '-f',
      task.fileToAnalyze,
      '-o',
      task.outputRawReportFilePath,
      '-l',
      task.licenseFilePath
    ]

    if (task.analysisMode) {
      args.push('-a', task.analysisMode)
    }

    if (task.parallelCount) {
      args.push('-j', task.parallelCount.toString())
    }

    if (task.sourceTreeRoot) {
      args.push('-r', task.sourceTreeRoot)
    }

    Utils.appendArgs(args, task.excludedDirs, '-e')
    Utils.appendArgs(args, task.rulesConfigFiles, '-R')
    Utils.appendArgs(args, task.suppressFiles, '-s')
    Utils.appendArgs(args, task.additionalArgs)
    return args
  }

  protected createTraceArgs(task: CppTraceTask): Array<string> {
    let args: Array<string> = ['trace', '-o', task.outputFilepath]
    if (task.ignoreReturnCode) {
      args.push('-i')
    }
    Utils.appendArgs(args, task.additionalArgs)
    args.push('--');
    return args.concat(task.traceArgs);
  }

  public async run(mode: CppAnalyzerMode): Promise<string> {
    const task = await this.generateTask(mode)
    core.debug(`Task: ${JSON.stringify(task)}`)
    const args = this.createArgs(task)
    core.debug(`Args: ${JSON.stringify(args)}`)

    const analyzerExecutable = await this.analyzerFilePath()
    const res = await exec.getExecOutput(`"${analyzerExecutable}"`, args)
    if (res.exitCode !== 0) {
      throw new Error(
        `Analyzer exited with code ${res.exitCode}. Details: ${res}`
      )
    }

    return task.getOutput()
  }
}
