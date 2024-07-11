import * as backend from './backends'

export abstract class AbstractAnalyzer {
    protected backend: backend.AbstractPlatformBackend;

    constructor(backend: backend.AbstractPlatformBackend) {
        this.backend = backend;
    }

    //public abstract run(): Promise<string>;
};