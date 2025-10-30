import fs from 'fs';
import childProcess from 'child_process';
import {PDFImage} from 'pdf-image';
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


/**
 * Override PDFImage constructor to avoid vulnerability.
 * @param {string} pdfFilePath PDF file path.
 * @param {object} options Options for PDFImage conversion.
 */
function safePDFImage(pdfFilePath, options) {
  const filter_chars = /[!";|`$()&<>]/;
  if (filter_chars.test(pdfFilePath)) {
    return;
  }
  PDFImage.call(this, pdfFilePath, options);
}
safePDFImage.prototype = Object.create(PDFImage.prototype);
safePDFImage.prototype.constructor = safePDFImage;

/**
 * Download a file.
 * @param {string} fileUrl Url to download file from.
 * @param {string} destPath Path where the downloaded file will be saved.
 * @returns {Promise} Fetch promise.
 */
async function downloadFile(fileUrl, destPath) {
  if (!fileUrl) return Promise.reject(new Error('Invalid fileUrl'));
  if (!destPath) return Promise.reject(new Error('Invalid destPath'));
  if (fs.existsSync(destPath)) return Promise.resolve(true);
  let mediaType = '';
  return await fetch(fileUrl, {signal: AbortSignal.timeout(30000), method: 'GET'}).then((response) => {
      if (response.ok || response.redirected) {
        // Save plausible media type from response.
        mediaType = response.headers.get('content-type') || '';
        return response.arrayBuffer();
      } else {
        throw new Error('Failed to load file');
      }
    }).then(buffer => {
        fs.writeFileSync(destPath, Buffer.from(buffer));
        // If media type was not found from response headers, check the saved file for media type
        if (!mediaType) {
          mediaType = childProcess.execSync('file --mime-type -b "' + destPath + '"').toString();
        }
        if (!mediaType.toLowerCase().trim().includes('application/pdf')) {
          throw new Error('Loaded file not a PDF ' + mediaType + ' ' + destPath);
        }
        return true;
    });
}

/**
 * Convert PDF file into a jpg.
 * @param {string} source PDF file path.
 * @param {string} destination Converted jpg file save path.
 * @param {string} url From which URL the conversion was done. For debugging purposes.
 */
function convertPDFtoJpg(source, destination, url) {
  // Check that the file is not corrupted
  const file = fs.readFileSync(source);
  if (!isPDFValid(file)) {
    const error = new Error(`Error validating PDF`);
    error.message = `${url} was not a proper pdf.`;
    error.code = 1;
    throw error;
  }

  const pdf = new safePDFImage(source, {
    convertOptions: {
      "-define": "PDF:use-cropbox=true",
      "-strip": '',
      "-compress": 'JPEG',
      "-alpha": 'remove',
      "-write": destination,
    }
  });
  pdf.convertPage(0).then((savedFile) => {
    // This should signal that everything went fine.
    formatMessageToParent(true, `${url} image conversion success.`, 0, savedFile);
  }, (reason) => {
    formatMessageToParent(false, `Failed to convert PDF into a jpg file. Reason: ${reason.message} / ${reason.error}`, 1);
  });
}

const url = process.argv[2];
const fileName = process.argv[3];
const imagePath = process.argv[4];
const tmpDir = process.argv[5];

const tmpPath = `${tmpDir}/${fileName}.pdf`;
downloadFile(url, tmpPath).then(() => {
  convertPDFtoJpg(tmpPath, imagePath, url);
}).catch((error) => {
  formatMessageToParent(false, error.message || 'Unknown error', 1);
});
