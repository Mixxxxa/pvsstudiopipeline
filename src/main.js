const core = require('@actions/core')
const exec = require('@actions/exec')
const tc = require('@actions/tool-cache')
const io = require('@actions/io')

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

function customSplit(str) {
  if (str.length === 0) {
    return []
  }
  const regex = /[;\n]/
  const parts = str.split(regex)
  const filteredParts = parts.filter(part => part.trim() !== '')
  return filteredParts
}

async function runAnalyzer() {
  let runArgs = [
    '-f',
    `"${core.getInput('file-to-analyze', { required: true, trimWhitespace: true })}"`,
    '-a',
    `${core.getInput('analysis-mode', { required: false, trimWhitespace: true })}`
  ]
  core.debug(`1Run args: ${runArgs}`)

  const excludesText = core.getInput('excluded-dirs')
  core.debug(`Basic excludes: ${excludesText}`)

  const excludedDirs = customSplit(excludesText)
  core.debug(`Directories to exclude: ${excludedDirs}`)
  for (const excludedDir of excludedDirs) {
    runArgs.push('-e')
    runArgs.push(`"${excludedDir}"`)
  }
  core.debug(`Total runArgs: ${runArgs}`)
}

module.exports = {
  run
}
