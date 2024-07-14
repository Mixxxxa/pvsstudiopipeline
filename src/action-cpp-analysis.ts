import * as core from '@actions/core'
import { getBackend } from './backends'
import * as cpp from './cpp-analyzer'

export async function run(): Promise<void> {
  try {
    const backend = getBackend()
    const analyzer = new cpp.CppAnalyzer(backend)
    if (!analyzer.available()) {
      analyzer.install()
    }

    const analysisResult = await analyzer.run()
    core.setOutput('raw-report', analysisResult.rawReport)
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

run()
