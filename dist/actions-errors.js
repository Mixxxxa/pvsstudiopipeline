"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnsuppotedPlatform = exports.AnalyzerNotFound = exports.Unimplemented = exports.PVSError = void 0;
class PVSError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PVSError';
    }
}
exports.PVSError = PVSError;
class Unimplemented extends PVSError {
    constructor() {
        super('Unimplemented');
        this.name = 'Unimplemented';
    }
}
exports.Unimplemented = Unimplemented;
class AnalyzerNotFound extends PVSError {
    constructor(message) {
        super(message);
        this.name = 'AnalyzerNotFound';
    }
}
exports.AnalyzerNotFound = AnalyzerNotFound;
class UnsuppotedPlatform extends PVSError {
    constructor() {
        super('Unsupported platfrom');
        this.name = 'UnsuppotedPlatform';
    }
}
exports.UnsuppotedPlatform = UnsuppotedPlatform;
//# sourceMappingURL=actions-errors.js.map