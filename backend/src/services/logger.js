const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '../../logs');
const recentErrors = [];
const MAX_RECENT_ERRORS = 50;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function timestamp() {
  return new Date().toISOString();
}

function writeToFile(filename, line) {
  try {
    ensureLogDir();
    fs.appendFileSync(path.join(LOG_DIR, filename), line + '\n');
  } catch {
    // never crash the app because of logging
  }
}

function formatLine(level, category, data) {
  const entry = { ts: timestamp(), level, category, ...data };
  return JSON.stringify(entry);
}

function info(category, data) {
  const line = formatLine('info', category, data);
  console.log(line);
  writeToFile('app.log', line);
}

function warn(category, data) {
  const line = formatLine('warn', category, data);
  console.warn(line);
  writeToFile('app.log', line);
}

function error(category, data) {
  const line = formatLine('error', category, data);
  console.error(line);
  writeToFile('app.log', line);
  writeToFile('errors.log', line);

  recentErrors.push({ ts: timestamp(), category, ...data });
  if (recentErrors.length > MAX_RECENT_ERRORS) recentErrors.shift();
}

function getRecentErrors() {
  return [...recentErrors].reverse();
}

module.exports = { info, warn, error, getRecentErrors };
