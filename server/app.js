var http = require('http');
var express = require('express');
var bodyParser = require('body-parser');
var morgan = require('morgan');
var methodOverride = require('method-override');

var config = require('../config');
var routes = require('./routes');
var AMQP = require('./lib/amqp');

var ServerApp = function () {

  this.amqp = new AMQP(config.amqp_url);
  this.amqp.init(this.setup.bind(this));
};

ServerApp.prototype.setup = function () {
  var app = this.app = express();

  app.use(morgan('dev'));
  app.use(bodyParser());
  app.use(methodOverride());

  routes(app);

  this.server = http.createServer(app);
  this.server.listen(config.port, function () {
    console.log('Server started on port ' + config.port + '.');
  });
};

module.exports = ServerApp;