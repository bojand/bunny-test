var amqp = require('amqplib');
var _ = require('underscore');
var noop = function () {};

var AMQP = function (url, socketOptions) {
  this.url = url;
  this.connOpt = socketOptions;
  this.amqp = amqp;
  this.queues = [];
  this.ch = null;
};

var getErrorHandler = function (fn) {
  if (!fn) fn = noop;
  return function handleError(e) {
    return fn(e);
  };
};

var getDoneHandler = function (fn) {
  if (!fn) fn = noop;
  return function doneHandler(v) {
    return fn(null, v);
  };
};

AMQP.prototype.init = function (fn) {
  if (!fn) fn = noop;
  var self = this;
  console.log('connecting');

  var onError = getErrorHandler(fn);
  var onDone = getDoneHandler(fn);

  amqp.connect(this.connOpt).then(function (conn) {
    console.log('connected');
    self.conn = conn;
    return conn.createChannel().then(function (ch) {
      console.log('channel created');
      self.ch = ch;
    });
  }).then(onDone, onError);
};

AMQP.prototype.addWorkerQueue = function (queue, opts, fn) {
  if (typeof opts === 'function') {
    fn = opts;
    opts = { durable: true };
  }

  if (!fn) fn = noop;

  var self = this;

  var onError = getErrorHandler(fn);
  var onDone = getDoneHandler(fn);

  self.ch.assertQueue(queue, opts).then(function (q) {
    console.dir(q);
    self.queues[queue] = q;
  }).then(onDone, onError);
};

AMQP.prototype.close = function () {
  if (this.ch) {
    this.ch.close();
  }

  if (this.conn) {
    this.conn.close();
  }
};

AMQP.prototype.send = function (queue, msg, opts, fn) {
  var self = this;
  if (typeof opts === 'function') {
    fn = opts;
    opts = undefined;
  }

  if (!fn) fn = noop;

  if (!this.queues[queue]) {
    this.addWorkerQueue(queue, function (err) {
      console.log('worker queue done');
      if (err) { return fn(err); }
      console.log('about to send to queue');
      self.sendToQueue(queue, msg, opts, fn);
    });
  }
  else {
    self.sendToQueue(queue, msg, opts, fn);
  }
};

AMQP.prototype.prepareMessage = function (message) {
  var c = _.clone(message);

  if (typeof c === 'object') {
    c = JSON.stringify(c);
  }

  if (!Buffer.isBuffer(c)) {
    c = new Buffer(c);
  }

  return c;
};

AMQP.prototype.sendToQueue = function (queue, message, options, fn) {
  if (typeof options === 'function') {
    fn = options;
    options = {deliveryMode: true};
  }

  if (!fn) fn = noop;

  try {
    var data = this.prepareMessage(message);
    this.ch.sendToQueue(queue, data, options);
  } catch (e) {
    return fn(e);
  }

  console.log(" [x] Sent message");
  return fn();
};

module.exports = AMQP;