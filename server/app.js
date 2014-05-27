var http = require('http');
var express = require('express');
var bodyParser = require('body-parser');
var morgan = require('morgan');
var methodOverride = require('method-override');
var BunnyDo = require('bunnydo');

var config = require('../config');
var routes = require('./routes');
//var AMQP = require('./lib/amqp');

var ServerApp = function () {
  var self = this;
  this.amqp = new BunnyDo(config.amqp_url);
  this.amqp.init(self.setup.bind(self));
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