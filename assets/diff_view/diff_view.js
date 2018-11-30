let bCheckAgain = document.getElementById("bCheckAgain");
let bUpload = document.getElementById("bUpload");
let bDownload = document.getElementById("bDownload");
let bRevert = document.getElementById("bRevert");
let sTest = document.getElementById("test");

const vscode = acquireVsCodeApi();

function click(callback) {
    return event => {
        if (event.detail === 0) { // key pressed by enter key
            return;
        }
        callback(event);
    };
}

bCheckAgain.addEventListener('click', click(event => {
    vscode.postMessage({
        command: 'check_again'
    });
}));

bDownload.addEventListener('click', click(event => {
    vscode.postMessage({
        command: 'download'
    });
}));

bUpload.addEventListener('click', click(event => {
    vscode.postMessage({
        command: 'upload'
    });
}));

bRevert.addEventListener('click', click(event => {
    vscode.postMessage({
        command: 'revert'
    });
}));