export class PVSError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PVSError";
    }
}

export class Unimplemented extends PVSError {
    constructor() {
        super('Unimplemented');
        this.name = "Unimplemented";
    }
}

export class AnalyzerNotFound extends PVSError {
    constructor(message: string) {
        super(message);
        this.name = "AnalyzerNotFound";
    }
}

export class UnsuppotedPlatform extends PVSError {
    constructor() {
        super('Unsupported platfrom');
        this.name = "UnsuppotedPlatform";
    }
}