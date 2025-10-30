import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import {spawn} from 'child_process';
import process from 'node:process';
import path from 'path';
import {fileURLToPath, URL} from 'url';
import winston from 'winston';
import 'winston-daily-rotate-file';
import { response } from 'express';

const { combine, timestamp, printf } = winston.format;

const myFormat = printf(({ level, message, /*label*/ timestamp }) => {
  return `{"${timestamp}" "${level}": "${message}"}`;
});

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
const __dirname = path.dirname(__filename) + '/../';

const imagesDir = path.join(__dirname, 'images');
const logs = path.join(__dirname, 'logs');
const tmpDir = path.join(__dirname, 'tmp');
const blockedFile = path.join(__dirname, 'blocked');
const handleConversionFile = path.join(path.dirname(__filename), 'handle_conversion.js');

const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename: "logs/log-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxFiles: "4d"
});

const logger = winston.createLogger({
  level: 'info',
  format: combine(
    timestamp(),
    myFormat
  ),
  defaultMeta: {service: 'pdf-to-image'},
  transports: [
    fileRotateTransport
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
if (!fs.existsSync(logs)) {
  fs.mkdirSync(logs);
}
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
 * Send the file back to client.
 * @param {response} res Response object.
 * @param {string} file File path to send to client.
 */
function sendResult(res, file) {
  res.download(file);
}

/**
 * Remove file.
 * @param {string} file File to remove.
 */
function removeFile(file) {
  if (!fs.existsSync(file)) {
    return;
  }
  fs.unlink(file, err => {
    if (err) {
      logger.error(`Error removing file: ${file}. Reason: ${err.message}`);
    }
  });
}

/**
 * Is the given string a valid URL.
 * @param {string} s
 * @returns {boolean} True if the string is a valid URL.
 */
const stringIsAValidUrl = (s) => {
  try {
    new URL(s);
    return true;
  } catch (err) {
    logger.error(`Not a valid URL: ${s}. Blocking. Reason: ${err.message}`);
    return false;
  }
};

/**
 * Create a child process to handle conversion of an URL.
 * @param {string} url URL for the child process to handle.
 * @param {string} fileName Filename for the url.
 * @param {string} imagePath Final path for resulting image.
 * @returns {object} Result containing data.
 */
async function spawnChild(url, fileName, imagePath) {
  // We got everything, lets fork
  var worker = spawn(
    'node',
    [handleConversionFile,url,fileName,imagePath,tmpDir],
    {
      stdio: [null, null, null, 'ipc']
    }
  );
  let result = {};
  worker.on('message', function(data) {
    if (!data.success) {
      logger.error(`${data.message}`);
    }
    logger.info(data.message);
    result = Object.assign({}, data);
  });

  let exitCode = 'still_running';
  const to = setTimeout(() => {
      console.log(exitCode);
      if (exitCode === 'still_running') {
        worker.kill();
      }
    },
    10000
  );
  exitCode = await new Promise((resolve) => {
    worker.on('close', resolve);
  });

  clearTimeout(to);

  if (exitCode) {
    throw new Error(`Error: Subprocess exit: ${exitCode}, ${result.message}`);
  }
  return result;
}

/**
 * Create a block file for given file.
 * @param {string} blockPath Block path.
 */
function createBlockFile(blockPath) {
  fs.writeFile(blockPath, '1', { flag: 'wx' }, function (err) {
    if (err) {
      logger.error(`Error creating block file: ${blockPath}. Reason: ${err.message}`);
    }
  });
}

app.get('/convert', (req, res) => {
  if (typeof req.query.url === 'undefined') {
    res.sendStatus(400);
    return;
  }
  const url = req.query.url;
  const fileName = crypto.createHash('sha256', 'file').update(url).digest('hex');
  const blockPath = `${blockedFile}/${fileName}`;
  logger.info(`Image request: ${url}`);
  if (fs.existsSync(blockPath)) {
    logger.info(`Requested URL is blocked: ${url}`);
    res.sendStatus(400);
    return;
  }
  if (!stringIsAValidUrl(url)) {
    createBlockFile(blockPath);
    res.sendStatus(400);
    return;
  }

  const imagePath = `${imagesDir}/${fileName}.jpg`;
  if (fs.existsSync(imagePath)) {
    logger.info(`1 Image sent: ${url}`);
    sendResult(res, imagePath);
    return;
  }
  const pdfPath = `${tmpDir}/${fileName}.pdf`;
  spawnChild(url, fileName, imagePath).then(
    data => {
      if (data.success) {
        logger.info(`2 Image sent: ${url}`);
        sendResult(res, imagePath);
      } else {
        logger.error(`Blocking ${url} due to a failure: ${data.message}`);
        createBlockFile(blockPath);
        res.sendStatus(400);
      }
      removeFile(pdfPath);
    },
    error => {
      logger.error(error);
      removeFile(pdfPath);
    }
  );
});

/**
 * Clear directory.
 * @param {string} dirpath Directory path to clear.
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

app.get('/log', (req, res) => {
  if (typeof req.query.file !== 'undefined') {
    const logFile = `${logs}/${req.query.file}`;
    if (fs.existsSync(logFile)) {
      res.download(logFile);
    } else {
      res.sendStatus(404);
    }
  }
});

app.get('/kill', (req, res) => {
  res.send(':( Goodbye...');
  process.exit();
});

app.listen(port, () => {
  console.log(`Image service now listening to port: ${port}`);
});
