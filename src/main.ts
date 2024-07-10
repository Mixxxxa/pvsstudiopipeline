import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'
import * as io from '@actions/io'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

namespace PVSStudio {
  export namespace Errors {
    export class PVSError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "PVSError";
      }
    }

    export class Unimplemented extends PVSError {
      constructor() {
        super('Unimplemented');
        this.name = "Unimplemented";
      }
    }

    export class AnalyzerNotFound extends PVSError {
      constructor(message: string) {
        super(message);
        this.name = "AnalyzerNotFound";
      }
    }

    export class UnsuppotedPlatform extends PVSError {
      constructor() {
        super('Unsupported platfrom');
        this.name = "UnsuppotedPlatform";
      }
    }
  }

  export namespace Utils {
    export function splitStringValues(text: string): Array<string> | undefined {
      if (!text || text.length === 0) {
        return undefined;
      }

      const regex = /[;\n]/
      const parts = text.split(regex)
      const filteredParts = parts.filter(part => part.trim() !== '')
      return filteredParts;
    }

    export function appendArgs(container: Array<string>, values: Array<string>, flag?: string) : void {
      for (let value of values) {
        if(flag){
          container.push(flag)
        }
        container.push(value)
      }
    }

    export const OptionalInputWithTrim: core.InputOptions = {
      required: false,
      trimWhitespace: true
    }
  
    export const RequiredInputWithTrim: core.InputOptions = {
      required: false,
      trimWhitespace: true
    }

    export function getBackend() : Backend.AbstractPlatformBackend {
      if (process.platform === 'win32') {
        core.debug('Detected Windows')
        return new Backend.Windows();
      } else if (process.platform === 'darwin') {
        core.debug('Detected macOS')
        throw new Errors.UnsuppotedPlatform();
      } else if (process.platform === 'linux') {
        core.debug('Detected Linux')
        return new Backend.Linux();
      } 
      throw new Errors.UnsuppotedPlatform();
    }
  }

  namespace Backend {
    export abstract class AbstractPlatformBackend {

      public async createFile(filepath: string, content: string): Promise<void> {
        return fsp.writeFile(filepath, content)
      }

      public async createTempFile(content: string, fileExt?: string): Promise<string> {
        let tmpFileName = 'pvs-';
        if(fileExt)
        {
          tmpFileName += fileExt;
        }
        const tmpFilePath = path.join(os.tmpdir(), tmpFileName);
        await this.createFile(tmpFilePath, content);
        return tmpFilePath;
      }
      
      // public abstract installPath(): string;

      // public abstract plogConverterFilePath(): string;

      public async exportLicenseFromEnvVars() : Promise<string> {
        const name = process.env.PVS_STUDIO_LICENSE_NAME
        const key = process.env.PVS_STUDIO_LICENSE_KEY
        let tempLicenseFilePath = ''
        if (name && key) {
          const licenseFileContent = `${name}\n${key}`;
          tempLicenseFilePath = await this.createTempFile(licenseFileContent);
        }
        return tempLicenseFilePath;
      }
    };

    export class Windows extends AbstractPlatformBackend {

      public async install(_: string) : Promise<void> {
        core.info('Installing PVS-Studio analyzer on Windows via choco');
        const res = await exec.exec('choco', ['install', 'pvs-studio']);
        if(res !== 0) {
          throw new PVSStudio.Errors.PVSError(`Unable to install analyzer. Details: ${res}`);
        }
        core.debug('PVS-Studio successfuly installed');
      }
    };

    export class Linux extends AbstractPlatformBackend {

      public async install(analyzer: string) : Promise<void> {
        core.info(`Installing PVS-Studio (${analyzer}) on Linux via direct download`)
        let downloadLink = ''
        switch(analyzer){
          case 'cpp':
            downloadLink = 'https://cdn.pvs-studio.com/pvs-studio-latest.deb'; 
            break;
          case 'csharp':
            // There are no *latest links
            throw new PVSStudio.Errors.Unimplemented();
            break;
          case 'java':
            downloadLink = 'https://cdn.pvs-studio.com/pvs-studio-java.zip';
            break;
          default:
            throw new PVSStudio.Errors.PVSError(`Tried to install unknown analyzer '${analyzer}'`)
        }

        const distFilePath: string = await tc.downloadTool(downloadLink);
        if (analyzer in ['cpp', 'csharp']) {
          const newDistFilePath = `${distFilePath}.deb`
          await io.mv(distFilePath, newDistFilePath)
          await exec.exec('sudo', [
            'apt-get',
            'install',
            `${core.toPlatformPath(newDistFilePath)}`
          ])
        } else if(analyzer === 'java') {
          throw new PVSStudio.Errors.Unimplemented();
        }
        core.debug('PVS-Studio successfuly installed');
      }
    };

    export class macOS extends AbstractPlatformBackend {

      public async install(analyzer: string) : Promise<void> {
        core.info(`Installing PVS-Studio (${analyzer}) on macOS via brew`)
        await exec.exec('brew update')
        await exec.exec('brew', ['install', 'viva64/pvs-studio/pvs-studio'])
        if(analyzer === 'csharp'){
          await exec.exec('brew', ['install', 'viva64/pvs-studio/pvs-studio-dotnet'])
        } else if(analyzer === 'java') {
          throw new PVSStudio.Errors.Unimplemented();
        }
        core.debug('PVS-Studio successfuly installed');
      }
    };
  }

  export namespace Analyzer {
    abstract class AbstractAnalyzer {
      protected backend: Backend.AbstractPlatformBackend;
    
      constructor(backend: Backend.AbstractPlatformBackend){
        this.backend = backend;
      }
    
      public abstract run() : Promise<string>;
    };

    enum CppAnalyzerCLIFlags {
      AnalyzeModeKey = "analyze",
      InputFile = '-f',
      OutputFile = "-o",
      AnalysisMode = "-a",
      ExcludedDir = "-e",
      LicenseFile = "-l",
      SuppressFile = "-s",
      RulesConfigFile = "-R",
      ParallelCount = "-j"
    };

    /**
     * Analysis task for PVS-Studio C++ analyzer
     * 
     * The class contains all the options that can be obtained from the GitHub Actions API.
     * These data are used to generate arguments for launching the analyzer.
     */
    export class CppAnalyzerTask {
      traceAnalysisCommand?: string;
      projectFilePath?: string;//

      licenseFilePath!: string;//
      excludedDirs?: Array<string>;//
      rulesConfigFiles?: Array<string>;//
      suppressFiles?: Array<string>;//
      additionalArgs?: Array<string>;//
      parallelCount?: number;//
      analysisMode?: string;//
      
      sourceTreeRoot?: string;
      
      outputFormat?: string;
      outputReportFilePath!: string;
      outputRawReportFilePath!: string;//

      public shouldBeConverted() : boolean {
        return Boolean(this.outputFormat && this.outputFormat.length !== 0);
      }

      public traceMode() : boolean {
        return Boolean(this.traceAnalysisCommand && this.traceAnalysisCommand.length !== 0);
      }
    };
    
    export class CppAnalyzer extends AbstractAnalyzer {
    
      public coreFilePath() : string {
    
      }
    
      public analyzerFilePath() : string {

    
      }
    
      public available() : boolean {
        
      }
    
      public async install() : Promise<void> {
        return this.backend.
      }

      protected generateRawLogFilePath(sourceFilePath: string) : string {
        const parts = path.parse(sourceFilePath)
        return `${parts.dir}/${parts.name}-raw.log`
      }

      protected async generateAnalysisTask() : Promise<CppAnalyzerTask> {
        let task = new CppAnalyzerTask();
        task.projectFilePath = core.getInput('file-to-analyze', Utils.OptionalInputWithTrim);
        task.traceAnalysisCommand = core.getInput('trace-args', Utils.OptionalInputWithTrim);
        if(task.projectFilePath && task.traceAnalysisCommand) {
          throw new PVSStudio.Errors.PVSError('Only one analysis mode can be selected at once (project or trace).')
        }

        task.analysisMode = core.getInput('analysis-mode', Utils.OptionalInputWithTrim);
        
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
          if(isNaN(parallelValue)) {
            throw new PVSStudio.Errors.PVSError("The 'parallel' input should be a number!")
          }
          task.parallelCount = parallelValue;
        }

        const outputFormatText = core.getInput('output-format', Utils.OptionalInputWithTrim);
        const outputFileText = core.getInput('output-file', Utils.OptionalInputWithTrim);
        if(!outputFileText) {
          throw new PVSStudio.Errors.PVSError("The 'output-file' input should be a specified!");
        }
        
        task.outputReportFilePath = outputFileText;
        // If the output format is set, we need to save the raw report separately 
        if(outputFormatText) {
          task.outputFormat = outputFormatText;
          const parts = path.parse(outputFileText);
          task.outputRawReportFilePath = `${parts.dir}/${parts.name}-raw.log`
        } else {
          task.outputRawReportFilePath = outputFileText;
        }

        const licenseFileText = core.getInput('licence-file', Utils.OptionalInputWithTrim);
        if(licenseFileText) {
          task.licenseFilePath = licenseFileText;
        } else {
          task.licenseFilePath = await this.backend.exportLicenseFromEnvVars();
        }

        return task;
      }

      protected createArgs(task: PVSStudio.Analyzer.CppAnalyzerTask) : Array<string> {
        let args: Array<string> = [];
        args.push('analyze');
        if(!task.projectFilePath) {
          throw new PVSStudio.Errors.PVSError("The project file (compile DB or trace-file) should be a specified!");
        }

        args.push('-f', task.projectFilePath,
          '-o', task.outputRawReportFilePath,
          '-l', task.licenseFilePath
        );

        if(task.analysisMode){
          args.push('-a', task.analysisMode);
        }

        if(task.parallelCount) {
          args.push('-j', task.parallelCount.toString());
        }

        if(task.excludedDirs) {
          for(let dir of task.excludedDirs) {
            args.push('-e', dir);
          }
        }

        if(task.rulesConfigFiles) {
          for(let file of task.rulesConfigFiles) {
            args.push('-R', file);
          }
        }

        if(task.suppressFiles) {
          for(let file of task.suppressFiles) {
            args.push('-s', file);
          }
        }

        if(task.additionalArgs) {
          for(let arg of task.additionalArgs) {
            args.push(arg);
          }
        }
        return args;
      }
    
      // protected async createArgs() : Promise<Array<string>> {
      //   const Flags = CppAnalyzerCLIFlags;
      //   let args = [
      //     Flags.AnalyzeModeKey,
      //     Flags.InputFile, core.getInput('file-to-analyze', Utils.RequiredInputWithTrim),
      //     Flags.AnalysisMode, core.getInput('analysis-mode', Utils.OptionalInputWithTrim)
      //   ]

      //   const outputText = core.getInput('output-file', Utils.RequiredInputWithTrim);
      //   args.push(Flags.InputFile, this.generateRawLogFilePath(outputText));

      //   const excludesText = core.getInput('excluded-dirs', Utils.OptionalInputWithTrim)
      //   Utils.appendArgs(args, Utils.splitStringValues(excludesText), Flags.ExcludedDir);
        
      //   const suppressText = core.getInput('suppress-files', Utils.OptionalInputWithTrim)
      //   Utils.appendArgs(args, Utils.splitStringValues(suppressText), Flags.SuppressFile);

      //   const rulesConfigsText = core.getInput('rules-configs', Utils.OptionalInputWithTrim)
      //   Utils.appendArgs(args, Utils.splitStringValues(rulesConfigsText), Flags.RulesConfigFile);

      //   const parallelText = core.getInput('parallel', Utils.OptionalInputWithTrim)
      //   if (parallelText && parallelText !== '0') {
      //     args.push(Flags.ParallelCount, parallelText)
      //   }

      //   const licenseFileText = core.getInput('licence-file', Utils.OptionalInputWithTrim);
      //   args.push(Flags.LicenseFile);
      //   if(licenseFileText) {
      //     args.push(licenseFileText)
      //   } else {
      //     const tempLicenseFilePath = await this.backend.exportLicenseFromEnvVars();
      //     args.push(tempLicenseFilePath)
      //   }

      //   return args;
      // }
    
      public async run() : Promise<string> {
        const analysisTask = await this.generateAnalysisTask();
        const args = this.createArgs(analysisTask);
        
        const analyzerExecutable = await this.analyzerFilePath();
        const res = await exec.getExecOutput(`"${analyzerExecutable}"`, args)
        if(res.exitCode !== 0) {
          throw new Error(
            `Analyzer exited with code ${res.exitCode}. Details: ${res}`
          )
        }

      }
    };
  }
}











/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    core.debug('RUN')
    const backend = PVSStudio.Utils.getBackend();
    const analyzer = new PVSStudio.Analyzer.CppAnalyzer(backend);
    if(!analyzer.available()) {
      analyzer.install();
    }

    const rawReportFilePath = await analyzer.run();
    core.setOutput('raw-report', rawReportFilePath);
    core.debug('FINISH')
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

async function installAnalyzer(): Promise<void> {
  core.debug('Trying to install analyzer')
  if (process.platform === 'win32') {
    core.debug('Detected Windows')
    await exec.exec('choco', ['install', 'pvs-studio'])
  } else if (process.platform === 'darwin') {
    core.debug('Detected macos1')
    await exec.exec('brew update')
    await exec.exec('brew', ['install', 'viva64/pvs-studio/pvs-studio'])
  } else if (process.platform === 'linux') {
    core.debug('Detected Linux1')
    const distFilePath: string = await tc.downloadTool(
      'https://cdn.pvs-studio.com/pvs-studio-latest.deb'
    )
    const newDistFilePath = `${distFilePath}.deb`
    await io.mv(distFilePath, newDistFilePath)
    await exec.exec('sudo', ['apt-get', 'update'])
    await exec.exec('sudo', [
      'apt-get',
      'install',
      `${core.toPlatformPath(newDistFilePath)}`
    ])
  } else {
    throw new Error('Unsuppoted OS')
  }

  const coreFilePath: string = await getAnalyzerCorePath()
  core.info(`Detected analyzer path: ${coreFilePath}`)

  const res: exec.ExecOutput = await exec.getExecOutput(`"${coreFilePath}"`, [
    '--version'
  ])
  core.debug(
    `Return code is ${res.exitCode}. Output: '${res.stdout}'. Error: ${res.stderr}`
  )
  if (res.exitCode !== 0 || !res.stdout.includes('PVS-Studio ')) {
    throw new Error('Unable to install PVS-Studio')
  }

  core.info(`Successfuly installed ${res.stdout}`)
}

async function prepareConverterArgs() {
  const RequiredWithTrim = {
    required: false,
    trimWhitespace: true
  }

  const OptionalWithTrim = {
    required: false,
    trimWhitespace: true
  }

  let args = [
    '-t',
    `${core.getInput('output-format', RequiredWithTrim)}`,
    '-a',
    'all'
  ]

  const outputText = core.getInput('output-file', RequiredWithTrim)
  args.push('-o')
  args.push(outputText)
  core.setOutput('report', outputText)

  const sourceTreeRoot = core.getInput('source-tree-root', OptionalWithTrim)
  if (sourceTreeRoot) {
    args.push('-R')
    args.push('toRelative')
    args.push('-r')
    args.push(`${sourceTreeRoot}`)
  }

  args.push(await createRawLogPath(outputText))

  return args
}

async function convertReport(): Promise<void> {
  const runArgs = await prepareConverterArgs()
  core.debug(`Args before run converter: ${runArgs}`)
  const executable = await getConverterPath()
  core.debug(`Found converter path: ${executable}`)

  const runResult = await exec.getExecOutput(`"${executable}"`, runArgs)
  if (runResult.exitCode !== 0) {
    throw new Error(
      `Converter exited with code ${runResult.exitCode}. Details: ${runResult}`
    )
  }
}

async function getConverterPath() {
  if (process.platform === 'win32') {
    // todo check registry too
    return 'C:\\Program Files (x86)\\PVS-Studio\\HtmlGenerator.exe'
  }
  return io.which('plog-converter')
}

async function getAnalyzerCorePath() {
  if (process.platform === 'win32') {
    // todo check registry too
    return 'C:\\Program Files (x86)\\PVS-Studio\\x64\\PVS-Studio.exe'
  }
  return io.which('pvs-studio')
}

async function getAnalyzerPath() {
  if (process.platform === 'win32') {
    // todo check registry too
    return 'C:\\Program Files (x86)\\PVS-Studio\\CompilerCommandsAnalyzer.exe'
  }
  return io.which('pvs-studio-analyzer')
}

async function getLicenseFromEnv() {
  const name = process.env.PVS_STUDIO_LICENSE_NAME
  const key = process.env.PVS_STUDIO_LICENSE_KEY
  if (name) {
    core.debug('NAME FOUND')
  }
  if (key) {
    core.debug('KEY FOUND')
  }

  // const check = async data => {
  //   temp.open('pvs', (err, info) => {
  //     if (!err) {
  //       fs.writeFileSync(info.fd, data, err => {
  //         if (err) {
  //           throw new Error(
  //             `Unable to write temporary license file to ${info.path}`
  //           )
  //         }
  //         core.debug('SET LICENSE FILE PATH')
  //         return info.path
  //         //tempLicenseFilePath = info.path
  //       })
  //     } else {
  //       core.debug('UNABLE TO OPEN FILE')
  //     }
  //   })
  //   return ''
  // }

  let tempLicenseFilePath = ''
  if (name && key) {
    core.debug('NAME AND KEY FOUND')
    const licenseData = `${name}\n${key}`

    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pvs-'))
    const tempLicFilePath = `${tempDir}.lic`
    core.debug(`Trying to write license to ${tempLicFilePath}`)
    // TODO rework
    await fsp.writeFile(tempLicFilePath, licenseData)
    tempLicenseFilePath = tempLicFilePath
  }
  return tempLicenseFilePath
}

function createRawLogPath(sourcePath: string): string {
  const parts = path.parse(sourcePath)
  return `${parts.dir}/${parts.name}-raw.log`
}

async function prepareAnalyzerArgs() {
  const OptionalWithTrim = {
    required: false,
    trimWhitespace: true
  }

  const RequiredWithTrim = {
    required: false,
    trimWhitespace: true
  }

  const processMultipleArgsFromText = (
    container: Array<string>,
    text: string,
    flag?: string
  ) => {
    if (text.length === 0) {
      return
    }

    const regex = /[;\n]/
    const parts = text.split(regex)
    const filteredParts = parts.filter(part => part.trim() !== '')

    for (let value of filteredParts) {
      if (flag) {
        container.push(flag)
      }
      container.push(value)
    }
  }

  let args = [
    'analyze',
    '-f',
    `${core.getInput('file-to-analyze', { required: true, trimWhitespace: true })}`,
    '-a',
    `${core.getInput('analysis-mode', OptionalWithTrim)}`
  ]

  const outputText = core.getInput('output-file', RequiredWithTrim)
  if (outputText) {
    args.push('-o')
    args.push(await createRawLogPath(outputText))
    const rawOutputFilePath = await createRawLogPath(outputText)
    core.setOutput('raw-report', rawOutputFilePath)
  }

  const excludesText = core.getInput('excluded-dirs', OptionalWithTrim)
  processMultipleArgsFromText(args, excludesText, '-e')

  const suppressText = core.getInput('suppress-files', OptionalWithTrim)
  processMultipleArgsFromText(args, suppressText, '-s')

  const rulesConfigsText = core.getInput('rules-configs', OptionalWithTrim)
  processMultipleArgsFromText(args, rulesConfigsText, '-R')

  const parallel = core.getInput('parallel', OptionalWithTrim)
  if (parallel && parallel !== '0') {
    args.push('-j')
    args.push(parallel)
  }

  const additionalArgsText = core.getInput('additional-args', OptionalWithTrim)
  processMultipleArgsFromText(args, additionalArgsText)

  const licenseFile = core.getInput('licence-file')
  args.push('-l')
  if (licenseFile) {
    args.push(licenseFile)
  } else {
    const tempLicenseFile = await getLicenseFromEnv()
    if (!tempLicenseFile) {
      core.debug(`FAILED TO WRITE TEMP LIC ${tempLicenseFile}`)
      throw new Error(
        'License file or corresponding environment variables must be set'
      )
    }
    args.push(tempLicenseFile)
  }

  core.debug(`Arguments for analyzer: ${args}`)
  return args
}

async function runAnalyzer(): Promise<void> {
  const runArgs = await prepareAnalyzerArgs()
  core.debug(`Args before run: ${runArgs}`)
  const analyzerExecutable = await getAnalyzerPath()
  core.debug(`Found analyzer path: ${analyzerExecutable}`)

  const runResult = await exec.getExecOutput(`"${analyzerExecutable}"`, runArgs)
  if (runResult.exitCode !== 0) {
    throw new Error(
      `Analyzer exited with code ${runResult.exitCode}. Details: ${runResult}`
    )
  }
}
