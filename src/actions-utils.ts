import * as core from "@actions/core";

export function splitStringValues(text: string): Array<string> {
    if (!text || text.length === 0) {
        return [];
    }

    const regex = /[;\n]/
    const parts = text.split(regex)
    const filteredParts = parts.filter(part => part.trim() !== '')
    return filteredParts;
}

export function appendArgs(container: Array<string>, values: Array<string>, flag?: string): void {
    for (let value of values) {
        if (flag) {
            container.push(flag)
        }
        container.push(value)
    }
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