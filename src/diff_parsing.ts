import { RepositoryStatus } from './extension';

export interface DiffChange {
    srcRange: { start: number, lines: number | null };
    dstRange: { start: number, lines: number | null };
    lines: string[];
}

export interface DiffResult {
    diff: string;
    fromCommit: string | null;
    toCommit : string | null;
    fromFileName: string | null;
    toFileName: string | null;
    changes: DiffChange[];
    properties: string[];
}

export function parseDiffOutput(diff: string) : DiffResult[] {
    let result: DiffResult[] = [];

    let current: DiffResult = result[0];

    for (const line of diff.split(/\n/)) {
        if (line.startsWith("diff")) {
            result.push({
                diff: line,
                fromCommit: null,
                toCommit: null,
                fromFileName: null,
                toFileName: null,
                changes: [],
                properties: []
            });
            current = result[result.length - 1];
        } else if (line.startsWith("index")) {
            const parts = line.split(" ");
            const commits = parts[1].split("..");
            current.fromCommit = commits[0];
            current.toCommit = commits[1];
        } else if (line.startsWith("---")) {
            current.fromFileName = line.substr(4);
        } else if (line.startsWith("+++")) {
            current.toFileName = line.substr(4);
        } else if (line.startsWith("@@")) {
            const parts = line.split(" ");
            const srcRange = parts[1].split(",");
            const dstRange = parts[2].split(",");
            current.changes.push({
                srcRange: {
                    start: Number(srcRange[0].substr(1)),
                    lines: srcRange.length === 2 ? Number(srcRange[1]) : null
                },
                dstRange: {
                    start: Number(dstRange[0].substr(1)),
                    lines: dstRange.length === 2 ? Number(dstRange[1]) : null
                },
                lines: []
            });
        } else if (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-")) {
            current.changes[current.changes.length - 1].lines.push(line);
        }
    }

    return result;
}

function createFilesList(diffs: DiffResult[]) : string {
    let files = "";
    for (const diff of diffs) {
        let changes = "";

        for (const change of diff.changes) {
            let lines = "";

            for (const line of change.lines) {
                let cl = "regular";
                if (line.startsWith("+")) {
                    cl = "addition";
                } else if (line.startsWith("-")) {
                    cl = "removal";
                }
                lines += `
                <code class="${cl}">${line}</code><br>`;
            }

            changes += `
            <li class="changes">
                <span>${change.srcRange.start};${change.srcRange.lines}  ${change.dstRange.start};${change.dstRange.lines}</span>
                <div class="code">
                    ${lines}
                </div>
            </li>`;
        }
        
        files += `
        <li class="files">
            <div class="file">
                <span>Comparing ${diff.fromFileName} to ${diff.toFileName}</span>
                <div class="change">
                    <ul>
                        ${changes}
                    </ul>
                </div>
            </div>
        </li>`;
    }

    return `<ul>${files}</ul>`;
}

export function diffResultToHtml(diffOutput: string, status: RepositoryStatus) : string {
    let diffs = parseDiffOutput(diffOutput);

    let files = "";
    if (diffs.length === 0) {
        switch (status) {
        case RepositoryStatus.UpToDate:
            files = "<h1>Your repository is up to date.</h1>";
            break;
        }
    } else {
        files = createFilesList(diffs);
    }

    return files;
}
