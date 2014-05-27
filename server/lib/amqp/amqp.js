var amqp = require('amqplib');
var _ = require('underscore');
var uuid = require('node-uuid');
var debug = require('debug')('bunny');

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
  debug('connecting amqp');

  var onError = getErrorHandler(fn);
  var onDone = getDoneHandler(fn);

  amqp.connect(this.connOpt).then(function (conn) {
    debug('connected amqp');
    self.conn = conn;
    return conn.createChannel().then(function (ch) {
      debug('channel created');
      ch.prefetch(1);
      self.ch = ch;
    });
  }).then(onDone, onError);
};

AMQP.prototype.assertQueue = function (queue, options, fn) {
  if (typeof options === 'function') {
    fn = options;
    options = undefined;
  }

  if (!fn) fn = noop;

  var onError = getErrorHandler(fn);
  var onDone = getDoneHandler(fn);

  if (queue && this.queues[queue]) {
    console.warn('adding queue that already exists');
  }

  this.ch.assertQueue(queue, options).then(function (q) {
    return q;
  }).then(onDone, onError);
};

AMQP.prototype.addQueue = function (queue, options, fn) {
  var self = this;

  this.assertQueue(queue, options, function (err, q) {
    if (queue && q) {
      debug('added generic queue %s', q.queue);
      self.queues[queue] = new Queue('generic', q);
    }
    return fn(err, q);
  });
};

/**
 * Add worker queue with options. Defaults options are `durable:true`
 * @param queue
 * @param options
 * @param fn
 */
AMQP.prototype.addWorkerQueue = function (queue, options, fn) {
  var self = this;

  if (typeof options === 'function') {
    fn = options;
    options = undefined;
  }

  if (!fn) fn = noop;

  if (!options) {
    options = {durable: true};
  }

  return this.assertQueue(queue, options, function (err, q) {
    if (queue && q) {
      debug('added worker queue %s', q.queue);
      self.queues[queue] = new Queue('work', q);
    }

    fn(err, q);
  });
};

/**
 * Adds RPC queue with options. Defaults options are `exclusive: true`
 * @param queue the name of queue to be added
 * @param options
 * @param fn
 */
AMQP.prototype.addRpcQueue = function (queue, options, fn) {
  var self = this;

  if (typeof options === 'function') {
    fn = options;
    options = undefined;
  }

  if (!fn) fn = noop;

  if (!options) {
    options = {exclusive: true};
  }

  return this.assertQueue('', options, function (err, q) {
    if (queue && q) {
      var qname = q.queue;
      self.queues[queue] = new Queue('rpc', q);

      return self.ch.consume(qname, self.rpcHandler.bind(self), {noAck: true})
        .then(function () {
          debug('added rpc queue %s', queue);
          fn(null, q);
        }, function (err) {
          fn(err);
        });
    }
  });
};

AMQP.prototype.close = function () {
  if (this.ch) {
    this.ch.close();
  }

  if (this.conn) {
    this.conn.close();
  }
};

AMQP.prototype.toAMQPMessage = function (message) {
  var c = _.clone(message);

  if (typeof c === 'object' && !Buffer.isBuffer(c)) {
    c = JSON.stringify(c);
  }

  if (typeof c !== 'string') {
    c = c.toString();
  }

  if (typeof c === 'string') {
    c = new Buffer(c);
  }

  return c;
};

AMQP.prototype.fromAMQPMessage = function (message) {
  var obj = _.clone(message);
  if ((message && message.content) || Buffer.isBuffer(message)) {
    var content = message.content.toString();
    obj = JSON.parse(content);
  }

  return obj;
};

AMQP.prototype.rpcHandler = function (msg) {
  var corrId = msg.properties ? msg.properties.correlationId : '';
  if (corrId && this.rpcCB[corrId]) {
    var cb = this.rpcCB[corrId];
    var reply, err;
    try {
      reply = this.fromAMQPMessage(msg);
      debug('got rpc reply. corr id: %s', corrId);
    } catch (e) {
      err = e;
    }

    cb(err, reply);

    delete this.rpcCB[msg.properties.correlationId];
  }
  else if (corrId && !this.rpcCB[corrId]) {
    debug('got rpc reply but to unknown correlation id: %s', corrId);
  }
  else {
    debug('got rpc reply but no correlation id');
  }
};

AMQP.prototype.send = function (queue, message, options, fn) {
  if (typeof options === 'function') {
    fn = options;
    options = undefined;
  }

  if (!fn) fn = noop;

  try {
    var data = this.toAMQPMessage(message);
    this.ch.sendToQueue(queue, data, options);
  } catch (e) {
    return fn(e);
  }

  debug('Sent message to %s', queue);
  return fn();
};

AMQP.prototype.worker = function (queue, message, options, fn) {
  var self = this;
  if (typeof options === 'function') {
    fn = options;
    options = {};
  }

  if (!fn) fn = noop;

  var opts = Object.create(options);
  if (opts.deliveryMode === undefined) { opts.deliveryMode = true; }

  var q = this.queues[queue];
  if (q) {
    this.send(queue, message, opts, fn);
  }
  else {
    self.addWorkerQueue(queue, function (err, q) {
      if (err) {
        return fn(err);
      }
      else {
        self.send(queue, message, opts, fn);
      }
    });
  }
};

AMQP.prototype.rpc = function (queue, message, options, fn) {
  var self = this;

  if (typeof options === 'function') {
    fn = options;
    options = {};
  }

  if (!fn) fn = noop;

  var dorpc = function (replyTo) {
    var opts = Object.create(options);
    var corrId = uuid();
    opts.correlationId = corrId;
    opts.replyTo = replyTo;

    self.rpcCB[corrId] = fn;

    self.send(queue, message, opts, function (err) {
      if (err) {
        fn(err);
        delete self.rpcCB[opts.correlationId];
      }
    });
  };

  var q = this.queues[queue];

  if (q) {
    dorpc(q.queue.queue);
  }
  else {
    self.addRpcQueue(queue, function (err, rpcq) {
      if (err) {
        return fn(err);
      }
      else {
        dorpc(rpcq.queue);
      }
    });
  }
};

AMQP.prototype.onWorker = function (queue, fn) {
  var self = this;
  if (!fn) fn = noop;

  var ok = this.ch.assertQueue(queue, {durable: true});

  ok.then(function () {
    self.ch.consume(queue, function (msg) {
      debug('got data on worker queue');
      var err, data;

      try {
        data = self.fromAMQPMessage(msg);
      } catch (e) {
        err = e;
      }

      return fn(err, data);
    }, {noAck: true});
  }).then(null, console.warn);
};

AMQP.prototype.onRpc = function (queue, fn) {
  var self = this;
  if (!fn) fn = noop;

  var ok = this.ch.assertQueue(queue, {durable: true});

  ok.then(function () {
    self.ch.consume(queue, function (msg) {
      var err, inData;
      var replyQ = msg.properties.replyTo;
      var corrId = msg.properties.correlationId;

      debug('got data on rpc queue. corr id: %s', corrId);

      var replyFn = function (response) {
        if (replyQ && corrId) {
          try {
            var outData = self.toAMQPMessage(response);
            self.ch.sendToQueue(msg.properties.replyTo,
              outData,
              {correlationId: corrId});

            self.ch.ack(msg);
          } catch (e) {
            console.log(e);
          }
        }
      };

      try {
        inData = self.fromAMQPMessage(msg);
      } catch (e) {
        err = e;
      }

      return fn(err, inData, replyFn);
    });
  }).then(null, console.warn);
};

module.exports = AMQP;