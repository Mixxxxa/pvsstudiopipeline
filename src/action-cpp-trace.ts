import * as core from '@actions/core'
import { getBackend } from './backends'
import * as cpp from './cpp-analyzer'

export async function run(): Promise<void> {
  try {
    const analyzer = new cpp.CppAnalyzer(getBackend())
    if (!(await analyzer.available())) {
      core.debug('Analyzer not found. Installing...')
      await analyzer.install()
    }

    const analysisResult = await analyzer.run(cpp.CppAnalyzerMode.Trace)
    core.setOutput('trace-file', analysisResult)
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

run()
