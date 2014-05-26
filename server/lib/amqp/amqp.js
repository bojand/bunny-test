var amqp = require('amqplib');
var _ = require('underscore');
var uuid = require('node-uuid');

var noop = function () {};

var Queue = function (type, qObj) {
  this.type = type;
  this.queue = qObj;
};

var AMQP = function (url, socketOptions) {
  this.url = url;
  this.connOpt = socketOptions;
  this.amqp = amqp;
  this.queues = {};
  this.ch = null;
  this.rpcCB = {};
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

/**
 * Call this to connect and create a channel.
 * @param fn
 */
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

AMQP.prototype.addQueue = function (queue, type, options, fn) {
  if (typeof options === 'function') {
    fn = options;
    options = undefined;
  }

  if (!fn) fn = noop;

  var self = this;

  var onError = getErrorHandler(fn);
  var onDone = getDoneHandler(fn);

  var queueName = queue;

  if (!options) {
    if (type === 'worker') {
      options = { durable: true };
    }
    else if (type === 'rpc') {
      // we're creating the reply queue in this case
      options = {exclusive: true};
      queueName = '';
    }
  }

  var ok = self.ch.assertQueue(queueName, options).then(function (q) {
    return q;
  });

  ok.then(function (q) {
    var qname = q.queue;
    self.queues[queue] = new Queue(type, q);

    if (type === 'rpc') {
      return self.ch.consume(qname, self.rpcHandler.bind(self), {noAck: true})
        .then(function () { return q; });
    }
  }).then(onDone, onError);
};

/**
 * Add worker queue with options. Defaults options are `durable:true`
 * @param queue
 * @param options
 * @param fn
 */
AMQP.prototype.addWorkerQueue = function (queue, options, fn) {
  return this.addQueue(queue, 'worker', options, fn);
};

/**
 * Adds RPC queue with options. Defaults options are `exclusive: true`
 * @param queue the name of queue to be added
 * @param options
 * @param fn
 */
AMQP.prototype.addRpcQueue = function (queue, options, fn) {
  return this.addQueue(queue, 'rpc', options, fn);
};

AMQP.prototype.close = function () {
  if (this.ch) {
    this.ch.close();
  }

  if (this.conn) {
    this.conn.close();
  }
};

AMQP.prototype.prepareMessage = function (message) {
  var c = _.clone(message);

  if (typeof c === 'object' && !Buffer.isBuffer(c)) {
    c = JSON.stringify(c);
  }

  if (typeof c === 'string') {
    c = new Buffer(c);
  }

  return c;
};

AMQP.prototype.convertReply = function (message) {
  var obj = _.clone(message);
  if ((message && message.content) || Buffer.isBuffer(message)) {
    var content = message.content.toString();
    obj = JSON.parse(content);
  }

  return obj;
};

AMQP.prototype.rpcHandler = function (msg) {
  if (msg.properties.correlationId && this.rpcCB[msg.properties.correlationId]) {
    var cb = this.rpcCB[msg.properties.correlationId];
    var reply, err;
    try {
      reply = this.convertReply(msg);
    } catch (e) {
      console.log(e);
      err = e;
    }

    cb(err, reply);

    delete this.rpcCB[msg.properties.correlationId];
  }
};

AMQP.prototype.send = function (queue, message, options, fn) {
  if (typeof options === 'function') {
    fn = options;
    options = {};
  }

  if (!fn) fn = noop;

  var opts = Object.create(options);

  var q = this.queues[queue];

  if (q) {
    if (q.type === 'worker') {
      if (opts.deliveryMode === undefined) { opts.deliveryMode = true; }
    }
    else if (q.type === 'rpc') {
      var corrId = uuid();
      opts.correlationId = corrId;
      opts.replyTo = q.queue.queue;
      this.rpcCB[corrId] = fn;
    }
  }

  try {
    var data = this.prepareMessage(message);
    this.ch.sendToQueue(queue, data, opts);
  } catch (e) {
    return fn(e);
  }

  console.log(" [x] Sent message to " + queue);
  if (q.type !== 'rpc') {
    return fn();
  }
};

module.exports = AMQP;