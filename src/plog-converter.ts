import { AbstractAnalyzer } from './analyzer'
import * as Utils from './actions-utils'
import * as core from '@actions/core'
import * as PVSErrors from './errors'

class PlogConverterTask {
    outputFormat!: string;
    outputFile!: string;
    groupsAndLevels!: string
    sourceTreeRoot!: string
    pathTransformMode!: string
    excludedPaths!: Array<string>
    includedPaths!: Array<string>
    excludedCodes!: Array<string> //todo
    additionalArgs!: Array<string>
    keepFalseAlarms!: boolean

    public getOutput(): string {
        return this.outputFile
    }
}

export class PlogConverter extends AbstractAnalyzer {
    public async available(): Promise<boolean> {
        return Boolean(await this.backend.getPlogConverterFilePath())
    }

    public async install(): Promise<void> {
        return this.backend.install('cpp')
    }

    protected async generateTask(): Promise<PlogConverterTask> {
        let task = new PlogConverterTask();
        task.outputFile = core.getInput(
            'output-file',
            Utils.RequiredInputWithTrim
        )
        task.outputFormat = core.getInput(
            'output-format',
            Utils.RequiredInputWithTrim
        )
        task.groupsAndLevels = core.getInput(
            'analysis-mode',
            Utils.OptionalInputWithTrim
        )
        task.sourceTreeRoot = core.getInput('source-tree-root', Utils.OptionalInputWithTrim)
        task.pathTransformMode = core.getInput('path-transformation-mode', Utils.OptionalInputWithTrim)
        if (task.pathTransformMode && !task.sourceTreeRoot) {
            throw new PVSErrors.PVSError("The 'path-transformation-mode' input requires the 'source-tree-root' input to be specified")
        }
        if (task.sourceTreeRoot && !task.pathTransformMode) {
            throw new PVSErrors.PVSError("The 'source-tree-root' input works only if the 'path-transformation-mode' input is specified")
        }
        task.excludedPaths = Utils.splitStringValues(
            core.getInput('excluded-paths', Utils.OptionalInputWithTrim)
        )
        task.includedPaths = Utils.splitStringValues(
            core.getInput('included-paths', Utils.OptionalInputWithTrim)
        )
        task.includedPaths = Utils.splitStringValues(
            core.getInput('included-paths', Utils.OptionalInputWithTrim)
        )
        task.additionalArgs = Utils.splitStringValues(
            core.getInput('additional-args', Utils.OptionalInputWithTrim)
        )
        task.keepFalseAlarms = core.getBooleanInput('keep-false-alarms', Utils.OptionalInputWithTrim)
        return task;
    }

    protected createArgs(task: PlogConverterTask): Array<string> {
        let args: Array<string> = [
            '-t', task.outputFormat,
            '-o', task.outputFile,
        ]
        if (task.groupsAndLevels) {
            args.push('-a', task.groupsAndLevels)
        }
        if (task.sourceTreeRoot) {
            args.push('-r', task.sourceTreeRoot)
        }
        if (task.pathTransformMode) {
            args.push('-R', task.pathTransformMode)
        }
        Utils.appendArgs(args, task.excludedPaths, '-E')
        Utils.appendArgs(args, task.includedPaths, '-I')
        Utils.appendArgs(args, task.additionalArgs)
        if (task.keepFalseAlarms) {
            args.push('-f')
        }
        return args;
    }

    public async run(): Promise<string> {
        const task = await this.generateTask()
        core.debug(`Task: ${JSON.stringify(task)}`)
        const args = this.createArgs(task)
        core.debug(`Args: ${JSON.stringify(args)}`)

        const executable = await this.backend.getPlogConverterFilePath()
        if (executable) {
            const res = await this.backend.runProgram(executable, args);
            if (res.exitCode === 0) {
                return task.getOutput()
            }
            throw new Error(
                `The PVS-Studio PlogConverter exited with code ${res.exitCode}. Details: ${res}`
            )
        }
        throw new PVSErrors.AnalyzerComponentNotFound('PlogConverter');
    }
}
