"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MacOSBackend = exports.LinuxBackend = exports.WindowsBackend = exports.AbstractPlatformBackend = void 0;
exports.getBackend = getBackend;
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const io = __importStar(require("@actions/io"));
const tc = __importStar(require("@actions/tool-cache"));
const fsp = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
const regedit = __importStar(require("regedit"));
const PVSErrors = __importStar(require("./errors"));
const Utils = __importStar(require("./actions-utils"));
class AbstractPlatformBackend {
    async createFile(filepath, content) {
        return fsp.writeFile(filepath, content);
    }
    async createTempFile(content, fileExt) {
        let tmpFileName = 'pvs-';
        if (fileExt) {
            tmpFileName += fileExt;
        }
        const tmpFilePath = path.join(os.tmpdir(), tmpFileName);
        await this.createFile(tmpFilePath, content);
        return tmpFilePath;
    }
    async exportLicenseFromEnvVars() {
        const name = process.env.PVS_STUDIO_LICENSE_NAME;
        const key = process.env.PVS_STUDIO_LICENSE_KEY;
        let tempLicenseFilePath = '';
        if (name && key) {
            const licenseFileContent = `${name}\n${key}`;
            tempLicenseFilePath = await this.createTempFile(licenseFileContent);
        }
        return tempLicenseFilePath;
    }
}
exports.AbstractPlatformBackend = AbstractPlatformBackend;
class WindowsBackend extends AbstractPlatformBackend {
    async getInstallPath() {
        const getRegistryPath = () => {
            return Utils.is64Bit()
                ? 'HKLM\\SOFTWARE\\Wow6432Node\\ProgramVerificationSystems\\PVS-Studio'
                : 'HKLM\\SOFTWARE\\ProgramVerificationSystems\\PVS-Studio';
        };
        const getRegistryUninstallPath = () => {
            return Utils.is64Bit()
                ? 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PVS-Studio_is1'
                : 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PVS-Studio_is1';
        };
        const getRegistryValue = async (basePath, valueName) => {
            const values = await regedit.promisified.list([basePath]);
            return values[basePath]?.values[valueName]?.value;
        };
        try {
            const pvsRegEntry = await getRegistryValue(getRegistryPath(), 'InstallDir');
            if (await Utils.checkPathExist(pvsRegEntry)) {
                console.log('From main registry entry');
                return pvsRegEntry;
            }
            const pvsRegUninstallEntry = await getRegistryValue(getRegistryUninstallPath(), 'InstallLocation');
            if (await Utils.checkPathExist(pvsRegUninstallEntry)) {
                console.log('From uninstall registry entry');
                return pvsRegUninstallEntry;
            }
        }
        catch (err) {
            if (err instanceof Error && err.message.includes('cscript.exe')) {
                console.log('Unable to find PVS-Studio via registry because WSC (Windows Script Host) unavailable');
            }
            else {
                throw err;
            }
        }
        const programFilesPath = process.env['ProgramFiles(x86)'];
        if (programFilesPath) {
            const pathWithEnv = path.join(programFilesPath, 'PVS-Studio');
            if (await Utils.checkPathExist(pathWithEnv)) {
                console.log('From env');
                return pathWithEnv;
            }
        }
        const fallbackPath = 'C:\\Program Files (x86)\\PVS-Studio';
        if (await Utils.checkPathExist(fallbackPath)) {
            console.log('Fallback');
            return fallbackPath;
        }
        return undefined;
    }
    async install(_) {
        core.info('Installing PVS-Studio analyzer on Windows via choco');
        const res = await exec.exec('choco', ['install', 'pvs-studio']);
        if (res !== 0) {
            throw new PVSErrors.PVSError(`Unable to install analyzer. Details: ${res}`);
        }
        core.debug('PVS-Studio successfuly installed');
    }
    async getCppAnalyzerFilePath() {
        const installPath = await this.getInstallPath();
        if (installPath) {
            return path.join(installPath, 'CompilerCommandsAnalyzer.exe');
        }
        return undefined;
    }
    async getCppAnalyzerCoreFilePath() {
        const installPath = await this.getInstallPath();
        if (installPath) {
            return path.join(installPath, 'x64', 'PVS-Studio.exe');
        }
        return undefined;
    }
    async getPlogConverterFilePath() {
        const installPath = await this.getInstallPath();
        if (installPath) {
            return path.join(installPath, 'HtmlGenerator.exe');
        }
        return undefined;
    }
}
exports.WindowsBackend = WindowsBackend;
class LinuxBackend extends AbstractPlatformBackend {
    async install(analyzer) {
        core.info(`Installing PVS-Studio (${analyzer}) on Linux via direct download`);
        if (analyzer !== 'cpp') {
            throw new PVSErrors.Unimplemented();
        }
        let downloadLink = 'https://cdn.pvs-studio.com/pvs-studio-latest.deb';
        const distFilePath = await tc.downloadTool(downloadLink);
        const newDistFilePath = `${distFilePath}.deb`;
        await io.mv(distFilePath, newDistFilePath);
        const res = await exec.getExecOutput('sudo', [
            'apt-get',
            'install',
            `${core.toPlatformPath(newDistFilePath)}`
        ]);
        if (res.exitCode !== 0) {
            throw new Error(`Unable to install ${analyzer}. Installer exit code is: ${res.exitCode}. Details: ${res}`);
        }
        core.debug('PVS-Studio successfuly installed');
    }
    async findTool(tool) {
        const basicSearch = await io.which(tool);
        if (basicSearch) {
            return basicSearch;
        }
        // So, lets manually search in PATH
        let forcedPaths = [];
        if (Utils.isLinux()) {
            forcedPaths.push('/usr/bin', '/usr/sbin');
        }
        else if (Utils.isMacOS()) {
            forcedPaths.push('/usr/local/bin', '/usr/local/sbin');
        }
        const pathsFromEnv = process.env['PATH']?.split(':');
        const pathsToSearch = [
            ...forcedPaths,
            ...(pathsFromEnv ?? [])
        ];
        for (const pathEntry of pathsToSearch) {
            const utilFilePath = path.join(pathEntry, tool);
            if (await Utils.checkPathExist(utilFilePath)) {
                return utilFilePath;
            }
        }
        return undefined;
    }
    async getCppAnalyzerFilePath() {
        return this.findTool('pvs-studio-analyzer');
    }
    async getCppAnalyzerCoreFilePath() {
        return this.findTool('pvs-studio');
    }
    async getPlogConverterFilePath() {
        return this.findTool('plog-converter');
    }
}
exports.LinuxBackend = LinuxBackend;
class MacOSBackend extends LinuxBackend {
    async install(analyzer) {
        core.info(`Installing PVS-Studio (${analyzer}) on macOS via brew`);
        await exec.exec('brew update');
        await exec.exec('brew', ['install', 'viva64/pvs-studio/pvs-studio']);
        if (analyzer === 'csharp') {
            await exec.exec('brew', [
                'install',
                'viva64/pvs-studio/pvs-studio-dotnet'
            ]);
        }
        else if (analyzer === 'java') {
            throw new PVSErrors.Unimplemented();
        }
        core.debug('PVS-Studio successfuly installed');
    }
}
exports.MacOSBackend = MacOSBackend;
function getBackend() {
    if (Utils.isWindows()) {
        core.debug('Detected Windows');
        return new WindowsBackend();
    }
    else if (Utils.isMacOS()) {
        core.debug('Detected macOS');
        throw new PVSErrors.Unimplemented();
    }
    else if (Utils.isLinux()) {
        core.debug('Detected Linux');
        return new LinuxBackend();
    }
    throw new PVSErrors.UnsuppotedPlatform();
}
//# sourceMappingURL=backends.js.map