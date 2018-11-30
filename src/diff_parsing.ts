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

export function diffResultToHtml(diffs: DiffResult[]) : string {
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



    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8" />
        <style>
            .addition {
                color: lightgreen;
            }
            .removal {
                color: red;
            }
            .regular {
                
            }

            .code {
                padding: 5px;
                border: 1px solid grey;
            }

            code {
                white-space: pre;
            }

            .file {
                
            }

            .change {

            }

            .files {
                margin: 30px 0;
            }

            .changes {
                margin: 10px 0;
            }

            ul {
                list-style: none;
            }

            * {
                font-family: monospace;
                font-size: 20px;
            }
        </style>
    </head>
    <body>
        <button id="bCheckAgain">Check Again</button>
        <button id="bUpload">Upload</button>
        <button id="bDownload">Download</button>
        <button id="bRevert">Revert</button>
        <ul>
            ${files}
        </ul>

        <script>
            let bCheckAgain = document.getElementById("bCheckAgain");
            let bUpload = document.getElementById("bUpload");
            let bDownload = document.getElementById("bDownload");
            let bRevert = document.getElementById("bRevert");

            const vscode = acquireVsCodeApi();

            bCheckAgain.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'check_again'
                });
            });

            bDownload.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'download'
                });
            });

            bUpload.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'upload'
                });
            });

            bRevert.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'revert'
                });
            });
        </script>
    </body>
    </html>`;
}
