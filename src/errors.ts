export class PVSError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PVSError'
  }
}

export class Unimplemented extends PVSError {
  constructor() {
    super('Unimplemented')
    this.name = 'Unimplemented'
  }
}

export class AnalyzerComponentNotFound extends PVSError {
  constructor(component: string) {
    super(`Unable to find PVS-Studio component: ${component}`)
    this.name = 'AnalyzerComponentNotFound'
  }
}

export class UnsuppotedPlatform extends PVSError {
  constructor() {
    super('Unsupported platfrom')
    this.name = 'UnsuppotedPlatform'
  }
}
