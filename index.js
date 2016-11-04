var Client = require('./lib/client');
var debug = require('debug');

debug.enable('kiwi-web-client');

var client = new Client({addr: '192.168.1.243:3000/tracker'});

client.on('peer', test);

function test(peer) {
    console.log(`peer connected!!!`);
    peer.send('client says: ' + peer.owner_id);
    peer.on('data', function (data) {
        console.log('received data: ', String.fromCharCode.apply(null, data));
    });
    peer.on('error', function(e) {
        console.log(e);
    })
}
