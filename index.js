import express from 'express';
import MD5 from "crypto-js/md5.js";
import fs from 'fs';
import {spawn} from 'child_process';
import path from 'path';
import {fileURLToPath, URL} from 'url';
import winston from 'winston';
import 'winston-daily-rotate-file';

const { combine, timestamp, printf } = winston.format;

const myFormat = printf(({ level, message, label, timestamp }) => {
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
const __dirname = path.dirname(__filename);

const imagesDir = path.join(__dirname, 'images');
const logs = path.join(__dirname, 'logs');
const tmpDir = path.join(__dirname, 'tmp');
const blockedFile = path.join(__dirname, 'blocked');

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
 * Send the file back to client
 *
 * @param {object} res 
 * @param {string} file 
 */
function sendResult(res, file) {
  res.download(file);
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
 * Create an asynchronous function to create a child process to handle the PDF conversion
 *
 * @param {*} url 
 * @param {*} fileName 
 * @param {*} imagePath
 * @returns 
 */
async function spawnChild(url, fileName, imagePath) {
  // We got everything, lets fork
  var worker = spawn(
    'node',
    ['handle_conversion.js',url,fileName,imagePath,tmpDir],
    {
      stdio: [null, null, null, 'ipc']
    }
  );
  let result = {};
  worker.on('message', function(data) {
    if (!data.success) {
      logger.error(`${data.message}`);
    }
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
  exitCode = await new Promise((resolve, reject) => {
    worker.on('close', resolve);
  });

  clearTimeout(to);

  if (exitCode) {
    throw new Error(`Error: Subprocess exit: ${exitCode}, ${error}`);
  }
  return result;
}

function createBlockFile(blockPath, message) {
  logger.error(message);
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
  const fileName = MD5(url);
  const blockPath = `${blockedFile}/${fileName}`;
  logger.info(`Image request: ${url}`);
  if (fs.existsSync(blockPath)) {
    res.sendStatus(400);
    return;
  }
  if (!stringIsAValidUrl(url)) {
    createBlockFile(blockPath, `${url} was not a proper url. Blocking.`);
    res.sendStatus(400);
    return;
  }

  const imagePath = `${imagesDir}/${fileName}.jpg`;
  if (fs.existsSync(imagePath)) {
    logger.info(`Image sent: ${url}`);
    sendResult(res, imagePath);
    return;
  }
  const pdfPath = `${tmpDir}/${fileName}.pdf`;
  spawnChild(url, fileName, imagePath).then(
    data => {
      if (data.success) {
        logger.info(`Image sent: ${url}`);
        sendResult(res, imagePath);
      } else {
        createBlockFile(blockPath, `Blocking entry due to a failure: ${data.message}`);
        res.sendStatus(400);
      }
      removeFile(pdfPath);
      if (data.savedFile) {
        removeFile(data.savedFile);
      }
    },
    error => {
      logger.error(error);
      removeFile(pdfPath);
    }
  );
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
