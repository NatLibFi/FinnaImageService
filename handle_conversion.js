import fs from 'fs';
import fetch from 'node-fetch';
import childProcess from 'child_process';
import {PDFImage} from 'pdf-image';

/**
 * Try to check that if the given buffer is a valid pdf. Does not work 100% of the time but is good.
 *
 * @param {any} buf 
 * @returns 
 */
function isPDFValid(buf) {
  return Buffer.isBuffer(buf) && buf.lastIndexOf("%PDF-") === 0 && buf.lastIndexOf("%%EOF") > -1;
}

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

// Override PDFImage constructor, to prevent any remote attacks
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
 * 
 * @param {string} fileUrl 
 * @param {string} destPath 
 */
function downloadFile(fileUrl, destPath) {
  if (!fileUrl) return Promise.reject(new Error('Invalid fileUrl'));
  if (!destPath) return Promise.reject(new Error('Invalid destPath'));

  return new Promise((resolve, reject) => {
    fetch(fileUrl).then((res) => {
      if (fs.existsSync(destPath)) {
        return resolve(true);
      } else {
        const fileStream = fs.createWriteStream(destPath);
        const altered = Object.fromEntries(Array.from(res.headers));
        res.body.on('error', reject);
        fileStream.on('finish', () => {
          let contentType = altered['content-type'] || '';
          contentType = contentType.toLowerCase();
          if (contentType.includes('application/pdf') ) {
            return resolve(true);
          } else if (contentType.length === 0) {
            contentType = childProcess.execSync('file --mime-type -b "' + destPath + '"').toString();
            if (contentType.trim() === 'application/pdf') {
              return resolve(true);
            }
          }
          return reject({message: 'Loaded file is not a pdf'});
        });
        res.body.pipe(fileStream);
      }
    }).catch((error) => {
      return reject(error)
    });
  });
}

/**
 * Convert pdf to jpg and send status
 *
 * @param {string} source 
 * @param {string} destination 
 * @param {string} url
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
downloadFile(url, tmpPath).then((reason, error) => {
  convertPDFtoJpg(tmpPath, imagePath, url);
}).catch((error) => {
  formatMessageToParent(false, error.message || 'Unknown error', 1);
});
