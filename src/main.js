const core = require('@actions/core')
const exec = require('@actions/exec')
const tc = require('@actions/tool-cache')

//const { wait } = require('./wait')

const { platform } = require('@actions/core')

//import { platform } from '@actions/core'

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
      await exec.exec('sudo', ['apt-get', 'update'])
      await exec.exec('sudo', [
        'apt-get',
        'install',
        `${core.toPlatformPath(distFilePath)}`
      ])
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

    exec.exec('pvs-studio', ['--version'], options)

    if (!output || !output.includes('PVS-Studio ')) {
      throw new Error('Unable to install PVS-Studio1')
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
