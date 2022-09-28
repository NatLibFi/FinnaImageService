import express from 'express';
import MD5 from "crypto-js/md5.js";
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import {fileURLToPath, URL} from 'url';
import {PDFImage} from 'pdf-image';
import winston from 'winston';
import childProcess from 'child_process';

const { combine, timestamp, printf } = winston.format;

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `{"${timestamp}" "${level}": "${message}"}`;
});

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

let port = 80;
process.argv.forEach((arg) => {
  const splitted = arg.split('=');
  if (splitted.length === 2) {
    const cmd = splitted[0].toString().replace(/-/g, '');
    switch (cmd) {
      case 'port':
        port = parseInt(splitted[1]);
        break;
    }
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imagesDir = path.join(__dirname, 'images');
const tmpDir = path.join(__dirname, 'tmp');
const blockedFile = path.join(__dirname, 'blocked');

const logger = winston.createLogger({
  level: 'info',
  format: combine(
    timestamp(),
    myFormat
  ),
  defaultMeta: {service: 'pdf-to-image'},
  transports: [
    new winston.transports.File({filename: 'error.log', level: 'error'}),
    new winston.transports.File({filename: 'info.log', level: 'info'})
  ]
});

// If the process is not started as production, then log into console also.
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
    'timestamp': true
  }));
}

// Be sure images directory exists
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir);
}
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir);
}
if (!fs.existsSync(blockedFile)) {
  fs.mkdirSync(blockedFile);
}
const app = express();

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
            resolve(true);
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
              reject('Loaded file is not a pdf');
            });
            res.body.pipe(fileStream);
          }
      });
  });
}

/**
 * Send the file back to client
 *
 * @param {object} res 
 * @param {string} file 
 */
function sendResult(res, file) {
  res.download(file);
  logger.info(`Image sent: ${file}`);
}

/**
 * Remove file from the given path.
 *
 * @param {string} file 
 */
function removeFile(file) {
  fs.unlink(file, err => {
    if (err) {
      logger.error(`Error removing file: ${file}. Reason: ${err.message}`);
    }
  });
}

/**
 * If the given url is valid.
 * 
 * @param {string} s 
 * 
 * @returns {boolean} is the url valid or not.
 */
const stringIsAValidUrl = (s) => {
  try {
    new URL(s);
    return true;
  } catch (err) {
    logger.error(`URL is not valid: ${s}`);
    return false;
  }
};

/**
 * Convert pdf to jpg and send status
 *
 * @param {string} source 
 * @param {string} destination 
 * @param {object} res 
 */
function convertPDFtoJpg(source, destination, res) {
  const pdf = new safePDFImage(source, {
    convertOptions: {
      "-define": "PDF:use-cropbox=true",
      "-strip": '',
      "-compress": 'JPEG',
      "-write": destination
    }
  });
  pdf.convertPage(0).then((savedFile) => {
    sendResult(res, destination);
    removeFile(savedFile);
    removeFile(source);
  }, (reason) => {
    res.sendStatus(404);
    logger.error(`Failed to convert PDF into a jpg file. Reason: ${reason.message} / ${reason.error}`);
  });
}

app.get('/convert', (req, res) => {
  if (typeof req.query.url !== 'undefined' && stringIsAValidUrl(req.query.url)) {
    const url = req.query.url;
    const fileName = MD5(url);
    // If blocked, return proper header
    const imagePath = `${imagesDir}/${fileName}.jpg`;
    const blockPath = `${blockedFile}/${fileName}`;
    if (fs.existsSync(blockPath)) {
      res.sendStatus(400);
      return;
    }
    logger.info(`Convert request: ${url},${fileName},${imagePath}`);
    if (!fs.existsSync(imagePath)) {
      const tmpPath = `${tmpDir}/${fileName}.pdf`;
      const response = downloadFile(url, tmpPath).then((reason, error) => {
        convertPDFtoJpg(tmpPath, imagePath, res);
      });
      response.catch((error) => {
        logger.error(error);
        // Lets block this url for the future and remove it also.
        removeFile(tmpPath);
        fs.writeFile(blockPath, '1', { flag: 'wx' }, function (err) {
          if (err) {
            logger.error(`Error creating block file: ${blockPath}. Reason: ${err.message}`);
          }
        });
        res.sendStatus(400);
      });
    } else {
      sendResult(res, imagePath);
    }
  } else {
    res.sendStatus(400);
  }
});

/**
 * Clear given directory path of files
 *
 * @param {string} dirpath 
 * 
 * @returns {number} amount of files deleted
 */
function clearDirectory(dirpath) {
  let delCount = 0;
  const files = fs.readdirSync(dirpath);
  files.forEach(file => {
    const tar = path.join(dirpath, file);
    removeFile(tar);
    delCount++;
  });
  return delCount;
}

app.get('/clearimg', (req, res) => {
  const result = clearDirectory(imagesDir);
  logger.info(`Deleted ${result} images.`);
  res.sendStatus(200);
});

app.get('/clearpdf', (req, res) => {
  const result = clearDirectory(tmpDir);
  logger.info(`Deleted ${result} pdfs.`);
  res.sendStatus(200);
});

app.get('/clearblocks', (req, res) => {
  const result = clearDirectory(blockedFile);
  logger.info(`Deleted ${result} blocked entries.`);
  res.sendStatus(200);
});

app.get('/clearall', (req, res) => {
  let result = 0;
  [blockedFile, imagesDir, tmpDir].forEach((dir) => {
    result += clearDirectory(dir);
  });
  logger.info(`Deleted ${result} from all the folders.`);
  res.sendStatus(200);
});

app.get('/status', (req, res) => {
  res.sendStatus(200);
});

app.get('/infolog', (req, res) => {
  res.download('./info.log');
});

app.get('/errorlog', (req, res) => {
  res.download('./error.log');
});

app.get('/kill', (req, res) => {
  res.send(':( Goodbye...');
  process.exit();
});

app.listen(port, () => {
  console.log(`Image service now listening to port: ${port}`);
});
