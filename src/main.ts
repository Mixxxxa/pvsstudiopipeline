import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'
import * as io from '@actions/io'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

//const { wait } = require('./wait')
//import { platform } from '@actions/core'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    core.debug('RUN')
    await installAnalyzer()
    await runAnalyzer()
    await convertReport()
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
