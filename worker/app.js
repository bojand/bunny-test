var amqp = require('amqplib');
var config = require('../config');

function doWork(msg) {
  try {
    var content = msg.content.toString();
    var obj = JSON.parse(content);
    console.dir(obj);
    console.log(" [x] Received '%s'", obj.message);
  }
  catch (e) {
    console.log(e);
  }
}

function fib(n) {
  // Do it the ridiculous, but not most ridiculous, way. For better,
  // see http://nayuki.eigenstate.org/page/fast-fibonacci-algorithms
  var a = 0, b = 1;
  for (var i = 0; i < n; i++) {
    var c = a + b;
    a = b;
    b = c;
  }
  return a;
}

amqp.connect(config.amqp_rul).then(function (conn) {
  process.once('SIGINT', function () { conn.close(); });

  return conn.createChannel().then(function (ch) {
    var ok = ch.assertQueue('work_queue', {durable: true});
    ok = ch.assertQueue('fib_queue', {durable: true});

    function reply(msg) {
      var n = parseInt(msg.content.toString());
      console.log(' [.] fib(%d)', n);
      var response = fib(n);
      var replyQ = msg.properties.replyTo;
      var corrId = msg.properties.correlationId;
      if (replyQ && corrId) {
        ch.sendToQueue(msg.properties.replyTo,
          new Buffer(response.toString()),
          {correlationId: corrId});
      }
      ch.ack(msg);
    }

    ok = ok.then(function () {
      ch.prefetch(1);
      ch.consume('work_queue', doWork, {noAck: true});
      ch.consume('fib_queue', reply);
      console.log(" [*] Waiting for messages. To exit press CTRL+C");
    });

    return ok;
  });
}).then(null, console.warn);