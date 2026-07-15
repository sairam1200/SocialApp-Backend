const Module = require('module');
const path = require('path');
const fs = require('fs');

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  if (
    !request.startsWith('.') &&
    !request.startsWith('/') &&
    !request.startsWith('node:') &&
    parent?.filename?.startsWith(__dirname + '\\dist')
  ) {
    const resolved = path.resolve(__dirname, 'dist', request);
    try {
      if (fs.existsSync(resolved)) {
        const stat = fs.statSync(resolved);
        if (stat.isFile()) return origResolve.call(this, resolved, parent, ...args);
        const asDirIndex = path.join(resolved, 'index.js');
        if (fs.existsSync(asDirIndex)) return origResolve.call(this, asDirIndex, parent, ...args);
      }
      const withJs = resolved + '.js';
      if (fs.existsSync(withJs)) return origResolve.call(this, withJs, parent, ...args);
    } catch (e) {}
  }
  return origResolve.call(this, request, parent, ...args);
};

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.LOG_DIR = process.env.LOG_DIR || './logs/';

require('./dist/main.js');
