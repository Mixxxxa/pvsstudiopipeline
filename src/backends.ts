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

    public abstract getCppAnalyzerFilePath() : Promise<string>;

    public abstract getCppAnalyzerCoreFilePath() : Promise<string>;

    public abstract getPlogConverterFilePath() : Promise<string>;

    public abstract install(analyzerLanguage: string): Promise<void>;
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

    public async getCppAnalyzerFilePath() : Promise<string> {
        return '';
    }

    public async getCppAnalyzerCoreFilePath() : Promise<string> {
        return '';
    }

    public async getPlogConverterFilePath() : Promise<string> {
        return ''
    }
};

export class LinuxBackend extends AbstractPlatformBackend {

    public async install(analyzer: string): Promise<void> {
        core.info(`Installing PVS-Studio (${analyzer}) on Linux via direct download`)
        if(analyzer !== 'cpp') {
            throw new PVSErrors.Unimplemented();
        }
        
        let downloadLink = 'https://cdn.pvs-studio.com/pvs-studio-latest.deb';

        const distFilePath: string = await tc.downloadTool(downloadLink);
        const newDistFilePath = `${distFilePath}.deb`
        await io.mv(distFilePath, newDistFilePath)
        const res = await exec.getExecOutput('sudo', [
            'apt-get',
            'install',
            `${core.toPlatformPath(newDistFilePath)}`
        ])
        if(res.exitCode !== 0) {
            throw new Error(
                `Unable to install ${analyzer}. Installer exit code is: ${res.exitCode}. Details: ${res}`
            )
        }
        core.debug('PVS-Studio successfuly installed');
    }

    public async getCppAnalyzerFilePath() : Promise<string> {
        return '';
    }

    public async getCppAnalyzerCoreFilePath() : Promise<string> {
        return '';
    }

    public async getPlogConverterFilePath() : Promise<string> {
        return ''
    }
};

export class MacOSBackend extends LinuxBackend {

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