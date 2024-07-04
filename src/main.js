const core = require('@actions/core')
const exec = require('@actions/exec')

//const { wait } = require('./wait')

import { platform } from '@actions/core'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  try {
    core.debug('RUN')
    await installAnalyzer()

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
    if (platform.isWindows) {
      core.debug('Detected Windows')
      await exec.exec('choco', ['install', 'pvs-studio'])
    } else if (platform.isLinux) {
      core.debug('Detected Linux')
      await exec.exec('sudo', ['apt-get', 'update'])
      await exec.exec('sudo', ['apt-get', 'install', 'pvs-studio'])
    } else if (platform.isMacOS) {
      core.debug('Detected macos')
      await exec.exec('brew update')
      await exec.exec('brew', ['install', 'viva64/pvs-studio/pvs-studio'])
    } else {
      throw new Error('Unsuppoted OS')
    }

    let output = ''
    const options = {
      stdout: data => {
        output += data.toString()
      },
      stderr: data => {
        output += data.toString()
      }
    }

    if (!output || !output.includes('PVS-Studio ')) {
      throw new Error('Unable to install PVS-Studio')
    }
    core.debug(`Successfuly installed ${output}`)
  } catch (error) {
    core.setFailed(error.message)
  }
}

//async function getAnalyzerVersion() {}

module.exports = {
  run
}
