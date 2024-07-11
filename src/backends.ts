import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import * as tc from '@actions/tool-cache'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

import * as PVSErrors from './errors'

export abstract class AbstractPlatformBackend {

    public async createFile(filepath: string, content: string): Promise<void> {
        return fsp.writeFile(filepath, content)
    }

    public async createTempFile(content: string, fileExt?: string): Promise<string> {
        let tmpFileName = 'pvs-';
        if (fileExt) {
            tmpFileName += fileExt;
        }
        const tmpFilePath = path.join(os.tmpdir(), tmpFileName);
        await this.createFile(tmpFilePath, content);
        return tmpFilePath;
    }

    // public abstract installPath(): string;

    // public abstract plogConverterFilePath(): string;

    public async exportLicenseFromEnvVars(): Promise<string> {
        const name = process.env.PVS_STUDIO_LICENSE_NAME
        const key = process.env.PVS_STUDIO_LICENSE_KEY
        let tempLicenseFilePath = ''
        if (name && key) {
            const licenseFileContent = `${name}\n${key}`;
            tempLicenseFilePath = await this.createTempFile(licenseFileContent);
        }
        return tempLicenseFilePath;
    }
};

export class WindowsBackend extends AbstractPlatformBackend {

    public async install(_: string): Promise<void> {
        core.info('Installing PVS-Studio analyzer on Windows via choco');
        const res = await exec.exec('choco', ['install', 'pvs-studio']);
        if (res !== 0) {
            throw new PVSErrors.PVSError(`Unable to install analyzer. Details: ${res}`);
        }
        core.debug('PVS-Studio successfuly installed');
    }
};

export class LinuxBackend extends AbstractPlatformBackend {

    public async install(analyzer: string): Promise<void> {
        core.info(`Installing PVS-Studio (${analyzer}) on Linux via direct download`)
        let downloadLink = ''
        switch (analyzer) {
            case 'cpp':
                downloadLink = 'https://cdn.pvs-studio.com/pvs-studio-latest.deb';
                break;
            case 'csharp':
                // There are no *latest links
                throw new PVSErrors.Unimplemented();
                break;
            case 'java':
                downloadLink = 'https://cdn.pvs-studio.com/pvs-studio-java.zip';
                break;
            default:
                throw new PVSErrors.PVSError(`Tried to install unknown analyzer '${analyzer}'`)
        }

        const distFilePath: string = await tc.downloadTool(downloadLink);
        if (analyzer in ['cpp', 'csharp']) {
            const newDistFilePath = `${distFilePath}.deb`
            await io.mv(distFilePath, newDistFilePath)
            await exec.exec('sudo', [
                'apt-get',
                'install',
                `${core.toPlatformPath(newDistFilePath)}`
            ])
        } else if (analyzer === 'java') {
            throw new PVSErrors.Unimplemented();
        }
        core.debug('PVS-Studio successfuly installed');
    }
};

export class MacOSBackend extends AbstractPlatformBackend {

    public async install(analyzer: string): Promise<void> {
        core.info(`Installing PVS-Studio (${analyzer}) on macOS via brew`)
        await exec.exec('brew update')
        await exec.exec('brew', ['install', 'viva64/pvs-studio/pvs-studio'])
        if (analyzer === 'csharp') {
            await exec.exec('brew', ['install', 'viva64/pvs-studio/pvs-studio-dotnet'])
        } else if (analyzer === 'java') {
            throw new PVSErrors.Unimplemented();
        }
        core.debug('PVS-Studio successfuly installed');
    }
};

export function getBackend(): AbstractPlatformBackend {
    if (process.platform === 'win32') {
        core.debug('Detected Windows')
        return new WindowsBackend();
    } else if (process.platform === 'darwin') {
        core.debug('Detected macOS')
        throw new PVSErrors.Unimplemented();
    } else if (process.platform === 'linux') {
        core.debug('Detected Linux')
        return new LinuxBackend();
    }
    throw new PVSErrors.UnsuppotedPlatform();
}