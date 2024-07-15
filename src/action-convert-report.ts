import * as core from '@actions/core'
import { getBackend } from './backends'
import * as plog from './plog-converter'

export async function run(): Promise<void> {
  try {
    const converter = new plog.PlogConverter(getBackend())
    if (!(await converter.available())) {
      core.debug('PlogConverter not found. Installing...')
      await converter.install()
    }

    const result = await converter.run()
    core.setOutput('report', result)
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

run()
