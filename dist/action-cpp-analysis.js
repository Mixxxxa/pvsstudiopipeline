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
exports.run = run;
const core = __importStar(require("@actions/core"));
const backends_1 = require("./backends");
const cpp = __importStar(require("./cpp-analyzer"));
async function run() {
    try {
        const analyzer = new cpp.CppAnalyzer((0, backends_1.getBackend)());
        if (!(await analyzer.available())) {
            core.debug('Analyzer not found. Installing...');
            await analyzer.install();
        }
        const analysisResult = await analyzer.run(cpp.CppAnalyzerMode.Analyze);
        core.setOutput('raw-report', analysisResult);
    }
    catch (error) {
        core.setFailed(error.message);
    }
}
run();
//# sourceMappingURL=action-cpp-analysis.js.map