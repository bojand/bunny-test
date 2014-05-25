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

amqp.connect(config.amqp_rul).then(function (conn) {
  process.once('SIGINT', function () { conn.close(); });

  return conn.createChannel().then(function (ch) {
    var ok = ch.assertQueue('work_queue', {durable: true});

    //ok = ok.then(function() { ch.prefetch(1); });
    ok = ok.then(function () {
      ch.consume('work_queue', doWork, {noAck: true});
      console.log(" [*] Waiting for messages. To exit press CTRL+C");
    });
    return ok;
  });
}).then(null, console.warn);