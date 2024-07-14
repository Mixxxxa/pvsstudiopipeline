import * as core from '@actions/core'
import * as fsp from 'node:fs/promises'

export function splitStringValues(text: string): Array<string> {
  if (!text || text.length === 0) {
    return []
  }

  const regex = /[;\n]/
  const parts = text.split(regex)
  const filteredParts = parts.filter(part => part.trim() !== '')
  return filteredParts
}

export function appendArgs(
  container: Array<string>,
  values: Array<string>,
  flag?: string
): void {
  for (let value of values) {
    if (flag) {
      container.push(flag)
    }
    container.push(value)
  }
}

export function is64Bit(): boolean {
  return ['x64', 'arm64'].includes(process.arch)
}

export function isWindows(): boolean {
  return process.platform === 'win32'
}

export function isLinux(): boolean {
  return process.platform === 'linux'
}

export function isMacOS(): boolean {
  return process.platform === 'darwin'
}

export async function checkPathExist(pathToCheck?: string): Promise<boolean> {
  if (!pathToCheck) {
    return false
  }

  try {
    await fsp.access(pathToCheck, fsp.constants.R_OK)
  } catch {
    return false
  }
  return true
}

export const OptionalInputWithTrim: core.InputOptions = {
  required: false,
  trimWhitespace: true
}

export const RequiredInputWithTrim: core.InputOptions = {
  required: false,
  trimWhitespace: true
}

// export function getInput(name: string, optional: boolean) : string {
//     const text = core.getInput(name, optional ? OptionalInputWithTrim
//                                               : RequiredInputWithTrim);
//     if(!optional && !text) {
//         throw
//     }
// }
