import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import * as tc from '@actions/tool-cache'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import * as regedit from 'regedit'

import * as PVSErrors from './errors'
import * as Utils from './actions-utils'

export abstract class AbstractPlatformBackend {
  public async createFile(filepath: string, content: string): Promise<void> {
    return fsp.writeFile(filepath, content)
  }

  public async createTempFile(
    content: string,
    fileExt?: string
  ): Promise<string> {
    let tmpFileName = 'pvs-'
    if (fileExt) {
      tmpFileName += fileExt
    }
    const tmpFilePath = path.join(os.tmpdir(), tmpFileName)
    await this.createFile(tmpFilePath, content)
    return tmpFilePath
  }

  public async exportLicenseFromEnvVars(): Promise<string> {
    const name = process.env.PVS_STUDIO_LICENSE_NAME
    const key = process.env.PVS_STUDIO_LICENSE_KEY
    let tempLicenseFilePath = ''
    if (name && key) {
      const licenseFileContent = `${name}\n${key}`
      tempLicenseFilePath = await this.createTempFile(licenseFileContent)
    }
    return tempLicenseFilePath
  }

  public is64Bit(): boolean {
    return ['x64', 'arm64'].includes(process.arch)
  }

  public async checkPathExist(pathToCheck?: string): Promise<boolean> {
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

  public abstract getCppAnalyzerFilePath(): Promise<string | undefined>

  public abstract getCppAnalyzerCoreFilePath(): Promise<string | undefined>

  public abstract getPlogConverterFilePath(): Promise<string | undefined>

  public abstract install(analyzerLanguage: string): Promise<void>

  public abstract isWindows(): boolean
  
  public abstract isLinux(): boolean
  
  public abstract isMacOS(): boolean

  public async runProgram(program: string, args: Array<string>): Promise<exec.ExecOutput> {
    return await exec.getExecOutput(`"${program}"`, args)
  }
}

export class WindowsBackend extends AbstractPlatformBackend {
  protected async getInstallPath(): Promise<string | undefined> {
    const getRegistryPath = (): string => {
      return this.is64Bit()
        ? 'HKLM\\SOFTWARE\\Wow6432Node\\ProgramVerificationSystems\\PVS-Studio'
        : 'HKLM\\SOFTWARE\\ProgramVerificationSystems\\PVS-Studio'
    }
    const getRegistryUninstallPath = (): string => {
      return this.is64Bit()
        ? 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PVS-Studio_is1'
        : 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PVS-Studio_is1'
    }
    const getRegistryValue = async (
      basePath: string,
      valueName: string
    ): Promise<string | undefined> => {
      const values = await regedit.promisified.list([basePath])
      return values[basePath]?.values[valueName]?.value as string
    }

    try {
      const pvsRegEntry = await getRegistryValue(
        getRegistryPath(),
        'InstallDir'
      )
      if (await this.checkPathExist(pvsRegEntry)) {
        console.log('From main registry entry')
        return pvsRegEntry
      }

      const pvsRegUninstallEntry = await getRegistryValue(
        getRegistryUninstallPath(),
        'InstallLocation'
      )
      if (await this.checkPathExist(pvsRegUninstallEntry)) {
        console.log('From uninstall registry entry')
        return pvsRegUninstallEntry
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('cscript.exe')) {
        console.log(
          'Unable to find PVS-Studio via registry because WSC (Windows Script Host) unavailable'
        )
      } else {
        throw err
      }
    }

    const programFilesPath = process.env['ProgramFiles(x86)']
    if (programFilesPath) {
      const pathWithEnv = path.join(programFilesPath, 'PVS-Studio')
      if (await this.checkPathExist(pathWithEnv)) {
        console.log('From env')
        return pathWithEnv
      }
    }

    const fallbackPath = 'C:\\Program Files (x86)\\PVS-Studio'
    if (await this.checkPathExist(fallbackPath)) {
      console.log('Fallback')
      return fallbackPath
    }
    return undefined
  }

  public async install(_: string): Promise<void> {
    core.info('Installing PVS-Studio analyzer on Windows via choco')
    const res = await exec.exec('choco', ['install', 'pvs-studio'])
    if (res !== 0) {
      throw new PVSErrors.PVSError(
        `Unable to install analyzer. Details: ${res}`
      )
    }
    core.debug('PVS-Studio successfuly installed')
  }

  public async getCppAnalyzerFilePath(): Promise<string | undefined> {
    const installPath = await this.getInstallPath()
    if (installPath) {
      return path.join(installPath, 'CompilerCommandsAnalyzer.exe')
    }
    return undefined
  }

  public async getCppAnalyzerCoreFilePath(): Promise<string | undefined> {
    const installPath = await this.getInstallPath()
    if (installPath) {
      return path.join(installPath, 'x64', 'PVS-Studio.exe')
    }
    return undefined
  }

  public async getPlogConverterFilePath(): Promise<string | undefined> {
    const installPath = await this.getInstallPath()
    if (installPath) {
      return path.join(installPath, 'HtmlGenerator.exe')
    }
    return undefined
  }

  public isWindows(): boolean {
    return true
  }
  
  public isLinux(): boolean {
    return false
  }
  
  public isMacOS(): boolean {
    return false
  }
}

export class LinuxBackend extends AbstractPlatformBackend {
  public async install(analyzer: string): Promise<void> {
    core.info(
      `Installing PVS-Studio (${analyzer}) on Linux via direct download`
    )
    if (analyzer !== 'cpp') {
      throw new PVSErrors.Unimplemented()
    }

    let downloadLink = 'https://cdn.pvs-studio.com/pvs-studio-latest.deb'

    const distFilePath: string = await tc.downloadTool(downloadLink)
    const newDistFilePath = `${distFilePath}.deb`
    await io.mv(distFilePath, newDistFilePath)
    const res = await exec.getExecOutput('sudo', [
      'apt-get',
      'install',
      `${core.toPlatformPath(newDistFilePath)}`
    ])
    if (res.exitCode !== 0) {
      throw new Error(
        `Unable to install ${analyzer}. Installer exit code is: ${res.exitCode}. Details: ${res}`
      )
    }
    core.debug('PVS-Studio successfuly installed')
  }

  protected async findTool(tool: string): Promise<string | undefined> {
    const basicSearch = await io.which(tool)
    if (basicSearch) {
      console.log('From basic search')
      return basicSearch
    }

    // So, lets manually search in PATH
    let forcedPaths: Array<string> = []
    if (this.isLinux()) {
      forcedPaths.push('/usr/bin', '/usr/sbin')
    } else if (this.isMacOS()) {
      forcedPaths.push('/usr/local/bin', '/usr/local/sbin')
    }
    const pathsFromEnv = process.env['PATH']?.split(':')
    const pathsToSearch: Array<string> = [
      ...forcedPaths,
      ...(pathsFromEnv ?? [])
    ]

    for (const pathEntry of pathsToSearch) {
      const utilFilePath = path.join(pathEntry, tool)
      if (await this.checkPathExist(utilFilePath)) {
        console.log('From manual search')
        return utilFilePath
      }
    }
    return undefined
  }

  public async getCppAnalyzerFilePath(): Promise<string | undefined> {
    return this.findTool('pvs-studio-analyzer')
  }

  public async getCppAnalyzerCoreFilePath(): Promise<string | undefined> {
    return this.findTool('pvs-studio')
  }

  public async getPlogConverterFilePath(): Promise<string | undefined> {
    return this.findTool('plog-converter')
  }

  public isWindows(): boolean {
    return false
  }
  
  public isLinux(): boolean {
    return true
  }
  
  public isMacOS(): boolean {
    return false
  }
}

export class MacOSBackend extends LinuxBackend {
  public async install(analyzer: string): Promise<void> {
    core.info(`Installing PVS-Studio (${analyzer}) on macOS via brew`)
    await exec.exec('brew update')
    await exec.exec('brew', ['install', 'viva64/pvs-studio/pvs-studio'])
    if (analyzer === 'csharp') {
      await exec.exec('brew', [
        'install',
        'viva64/pvs-studio/pvs-studio-dotnet'
      ])
    } else if (analyzer === 'java') {
      throw new PVSErrors.Unimplemented()
    }
    core.debug('PVS-Studio successfuly installed')
  }

  public isWindows(): boolean {
    return false
  }
  
  public isLinux(): boolean {
    return false
  }
  
  public isMacOS(): boolean {
    return true
  }
}

export function getBackend(): AbstractPlatformBackend {
  const platform = process.platform;
  if (platform === 'win32') {
    core.debug('Detected Windows')
    return new WindowsBackend()
  } else if (platform === 'darwin') {
    core.debug('Detected macOS')
    return new MacOSBackend();
  } else if (platform === 'linux') {
    core.debug('Detected Linux')
    return new LinuxBackend()
  }
  throw new PVSErrors.UnsuppotedPlatform()
}
