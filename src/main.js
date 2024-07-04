const core = require('@actions/core')
const exec = require('@actions/exec')
const tc = require('@actions/tool-cache')
const io = require('@actions/io')
const fs = require('node:fs')
const temp = require('temp')

//const { wait } = require('./wait')
//import { platform } from '@actions/core'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  try {
    core.debug('RUN')
    await installAnalyzer()
    await runAnalyzer()
    core.debug('FINISH')

    // const ms = core.getInput('milliseconds', { required: true })

    // // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
    // core.debug(`Waiting ${ms} milliseconds ...`)

    // // Log the current timestamp, wait, then log the new timestamp
    // core.debug(new Date().toTimeString())
    // await wait(parseInt(ms, 10))
    // core.debug(new Date().toTimeString())

    // Set outputs for other workflow steps to use
    core.setOutput('time', new Date().toTimeString())
  } catch (error) {
    // Fail the workflow run if an error occurs
    core.setFailed(error.message)
  }
}

async function installAnalyzer() {
  try {
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
      const distFilePath = await tc.downloadTool(
        'https://cdn.pvs-studio.com/pvs-studio-latest.deb'
      )
      const newDistFilePath = await `${distFilePath}.deb`
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

    const coreFilePath = await getAnalyzerCorePath()
    core.info(`Detected analyzer path: ${coreFilePath}`)

    const res = await exec.getExecOutput(`"${coreFilePath}"`, ['--version'])
    core.debug(
      `Return code is ${res.exitCode}. Output: '${res.stdout}'. Error: ${res.stderr}`
    )
    if (res.exitCode !== 0 || !res.stdout.includes('PVS-Studio ')) {
      throw new Error('Unable to install PVS-Studio')
    }

    core.info(`Successfuly installed ${res.stdout}`)
  } catch (error) {
    core.setFailed(error.message)
  }
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
  const name = process.env.PVS_STUDIO_NAME
  const key = process.env.PVS_STUDIO_KEY
  if (name) {
    core.debug('NAME FOUND')
  }
  if (key) {
    core.debug('KEY FOUND')
  }

  let tempLicenseFilePath = ''
  if (name && key) {
    core.debug('NAME AND KEY FOUND')
    const licenseData = `${name}\n${key}`
    temp.open('pvs', function (err, info) {
      if (!err) {
        fs.writeFile(info.fd, licenseData, err => {
          if (err) {
            throw new Error(
              `Unable to write temporary license file to ${info.path}`
            )
          }
          core.debug('SET LICENSE FILE PATH')
          tempLicenseFilePath = info.path
        })
      } else {
        core.debug('UNABLE TO OPEN FILE')
      }
    })
  }
  return tempLicenseFilePath
}

async function prepareArgs() {
  const OptionalWithTrim = {
    required: false,
    trimWhitespace: true
  }

  const processMultipleArgsFromText = (container, flag, text) => {
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
    `"${core.getInput('file-to-analyze', { required: true, trimWhitespace: true })}"`,
    '-a',
    `${core.getInput('analysis-mode', OptionalWithTrim)}`,
    '-o',
    `${core.getInput('output-file', OptionalWithTrim)}`
  ]

  const excludesText = core.getInput('excluded-dirs', OptionalWithTrim)
  processMultipleArgsFromText(args, '-e', excludesText)

  const suppressText = core.getInput('suppress-files', OptionalWithTrim)
  processMultipleArgsFromText(args, '-s', suppressText)

  const rulesConfigsText = core.getInput('rules-configs', OptionalWithTrim)
  processMultipleArgsFromText(args, '-R', rulesConfigsText)

  const parallel = core.getInput('parallel', OptionalWithTrim)
  if (parallel && parallel !== '0') {
    args.push('-j')
    args.push(parallel)
  }

  const sourceTreeRoot = core.getInput('source-tree-root', OptionalWithTrim)
  if (sourceTreeRoot) {
    args.push('-r')
    args.push(`${sourceTreeRoot}`)
  }

  const additionalArgsText = core.getInput('additional-args', OptionalWithTrim)
  processMultipleArgsFromText(args, '', additionalArgsText)

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

async function runAnalyzer() {
  const runArgs = await prepareArgs()
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

module.exports = {
  run
}
