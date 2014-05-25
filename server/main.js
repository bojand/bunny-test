'use strict';

var ServerApp = require('./app');

var app = new ServerApp();
global.App = app;

var shutdown = function () {
  if (global.App) {
    global.App.server.close();
    global.App.amqp.close();
  }
  process.exit();
};

process.on('SIGINT', shutdown);

process.on('SIGTERM', shutdown);