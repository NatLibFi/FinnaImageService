import fs from 'fs';
import {pdf} from 'pdf-to-img';
import process from 'node:process';
import {Buffer} from 'node:buffer';

/**
 * Try to check that if the given buffer is a valid pdf. Does not work 100% of the time but is good.
 * @param {any} buf Buffer from PDF file.
 * @returns {boolean} If the pdf file is valid.
 */
function isPDFValid(buf) {
  return Buffer.isBuffer(buf) && buf.lastIndexOf("%PDF-") === 0 && buf.lastIndexOf("%%EOF") > -1;
}

/**
 * Send message from child process to parent process.
 * @param {boolean} success If message indicates a success.
 * @param {string} message Message string.
 * @param {number} code Process number.
 * @param {string|undefined} savedFile If a file was saved to a path from child process.
 */
function formatMessageToParent(success, message, code, savedFile = undefined) {
  if (process && process.send) {
    process.send(
      {
        success,
        message,
        code,
        savedFile
      }
    );
  };
}

const url = process.argv[2];
const fileName = process.argv[3];
const imagePath = process.argv[4];
const tmpDir = process.argv[5];

const tmpPath = `${tmpDir}/${fileName}.pdf`;
let loadedBuffer = '';
await fetch(url, {signal: AbortSignal.timeout(30000), method: 'GET'}).then((response) => {
  if (response.ok || response.redirected) {
    return response.arrayBuffer();
  } else {
    formatMessageToParent(false, response.status, 1);
  }
}).then(buffer => {
  loadedBuffer = buffer;
}).catch((reason) => {
  formatMessageToParent(false, reason.message, 1);
});
try {
  const bufferFromBuffer = Buffer.from(loadedBuffer);
  if (loadedBuffer && isPDFValid(bufferFromBuffer)) {
    fs.writeFileSync(tmpPath, bufferFromBuffer);
    // If media type was not found from response headers, check the saved file for media type
    const document = await pdf(bufferFromBuffer, { scale: 3 });
    const page = await document.getPage(1);
    fs.writeFileSync(imagePath, Buffer.from(page));
    formatMessageToParent(true, `${url} image conversion success.`, 0, imagePath);
  } else {
    formatMessageToParent(false, `Loaded file was not a PDF`, 1);
  }
} catch (err) {
  formatMessageToParent(false, `${err.message}`, 1);
}


