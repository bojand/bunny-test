//var amqp = require('amqplib');
var config = require('../config');
var AMQP = require('../server/lib/amqp');

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

// DON'T DO THIS LOL
function sleep(callback, time) {
  var stop = new Date().getTime();
  while (new Date().getTime() < stop + time) {
    ;
  }
  callback();
}

var amqp = new AMQP(config.amqp_url);
amqp.init(function (err) {
  if (err) {
    console.log(err);
  }
  else {
    amqp.onWorker('work_queue', function (err, msg) {
      if (err) { console.dir(err); }
      else {
        console.log(" [x] Received '%s'", msg.message);
      }
    });

    amqp.onRpc('fib_queue', function (err, msg, replyFn) {
      if (err) {
        console.dir(err);
        replyFn({error: err.toString()})
      }
      else {
        var n = msg;
        var response = fib(n);

        replyFn(response);
      }
    });

    amqp.onRpc('cap_queue', function (err, msg, replyFn) {
      if (err) {
        console.dir(err);
        replyFn({error: err.toString()})
      }
      else {
        replyFn(msg.toUpperCase());
      }
    });

    amqp.onRpc('prog_queue', function (err, msg, replyFn) {
      if (err) {
        console.dir(err);
        replyFn({error: err.toString()})
      }
      else {
        var total = 10;
        var i = 0;
        while (i < total) {
          sleep(function () {
            var n = Math.round(((i + 1) / total) * 100);
            console.log(n);
            i = i + 1;
            replyFn(n);
          }, 200);
        }
      }
    });
  }
});