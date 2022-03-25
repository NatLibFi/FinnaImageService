import express from 'express';
import MD5 from "crypto-js/md5.js";
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import {fileURLToPath, URL} from 'url';
import {PDFImage} from 'pdf-image';
import winston from 'winston';

const { combine, timestamp, printf } = winston.format;

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `{"${timestamp}" "${level}": "${message}"}`;
});

const port = 80;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imagesDir = path.join(__dirname, 'images');
const tmpDir = path.join(__dirname, 'tmp');

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
          const fileStream = fs.createWriteStream(destPath);
          res.body.on('error', reject);
          fileStream.on('finish', () => {
            resolve(true);
          });
          res.body.pipe(fileStream);
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
  const pdf = new PDFImage(source, {
    convertOptions: {
      "-define": "PDF:use-cropbox=true",
      "-strip": '',
      "-format": 'jpeg'
    }
  });
  pdf.convertPage(0).then((savedFile) => {
    if (fs.existsSync(savedFile)) {
      fs.rename(savedFile, destination, (err) => {
        removeFile(source);
        if (err) {
          logger.error(`Error moving file: ${savedFile} > ${destination}. Reason: ${err.message}`);
          res.sendStatus(500);
        } else {
          sendResult(res, destination);
        }
      });
    }
  }, (reason) => {
    logger.error(`Failed to convert PDF into a jpg file. Reason: ${reason.message} / ${reason.error}`);
  });
}

app.get('/convert', (req, res) => {
  if (typeof req.query.url !== 'undefined' && stringIsAValidUrl(req.query.url)) {
    const url = req.query.url;
    const fileName = MD5(url);
    const imagePath = `${imagesDir}/${fileName}.jpeg`;
    logger.info(`Convert request: ${url},${fileName},${imagePath}`);
    if (!fs.existsSync(imagePath)) {
      const tmpPath = `${tmpDir}/${fileName}.pdf`;
      if (fs.existsSync(tmpPath)) {
        logger.info(`PDF exists: ${url}`);
        convertPDFtoJpg(tmpPath, imagePath, res);
      } else {
        const response = downloadFile(url, tmpPath).then(() => {
          logger.info(`PDF download: ${url}`);
          convertPDFtoJpg(tmpPath, imagePath, res);
        });
      }
    } else {
      sendResult(res, imagePath);
    }
  } else {
    res.sendStatus(400);
  }
});

app.get('/clear', (req, res) => {
  [tmpDir, imagesDir].forEach((dir) => {
    fs.readdir(dir, (err, files) => {
      if (err) {
        logger.error(`Error reading directory: ${dir}. Reason: ${err.message}`);
        throw err;
      }
      files.forEach((file) => {
        const tar = path.join(dir, file);
        removeFile(tar);
      });
    });
  });
  res.sendStatus(200);
});

app.get('/status', (req, res) => {
  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`Image service now listening to port: ${port}`);
});
