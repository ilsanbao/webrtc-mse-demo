//socket.io
var _ = require('ramda');
var http = require('http');
var socketIO = require('socket.io')();
var nodeStatic = require('node-static');
var fileServer = new (nodeStatic.Server)();

var ss = require('socket.io-stream');
var fs = require('fs');
var path = require('path');

var app = http.createServer(function (req, res) {
    fileServer.serve(req, res);
}).listen(process.env.PORT || '3000');

var io = socketIO.listen(app);

io.origins('*:*');
io.of('/video').on('connection', function (socket) {
    console.log('video peer connected');
    //connected
    socket.emit('connected', {socketId: socket.id});

    // when the user disconnects..
    socket.on('disconnect', function () {
        console.log('disconnected');
    });

    // get video stream
    ss(socket).on('video', function (stream, data) {
        console.log('start video streaming');
        var filename = path.basename(data.name);
        fs.createReadStream(filename).pipe(stream);
    });
});


//p2p connection all to all
io.of('/p2p').on('connection', function (socket) {
    console.log('p2p peer connected');
    //connected
    socket.emit('connected', {socketId: socket.id});

    //relay message
    socket.on('message', function (data) {
        console.log('got message');
        socket.broadcast.emit('message', data);
    });

    // when the user disconnects..
    socket.on('disconnect', function () {
        console.log('disconnected');
    });
});


var EE = require('events').EventEmitter;
var common = require('./lib/common');
var debug = require('debug')('kiwi-web-server');

const SUB_GROUP_CAPACITY = 10;
var g_root_group = {};
var g_client_info_map = {};
var g_socket_id_client_map = {};

function newGroup(level) {
    var group = {sub_group_num: 0, sub_groups: []};
    g_root_group[level] = group;
    return group;
}

function sendGenOffer(clientId, num) {
    if(num <= 0) {
        return;
    }
    var info = g_client_info_map[clientId];
    info && info.socket.emit('message', {type: 'gen_offer', numwant: num});
}

function doGroup(clientId) {
    var clientInfo = g_client_info_map[clientId];
    debug(`group for ${clientId}`);

    if (!clientInfo) {
        debug('no client info');
        return;
    }
    var group = g_root_group[clientInfo.level1] || newGroup(clientInfo.level1);

    if (group.sub_group_num > 0) {
        for (var i = 0; i < group.sub_group_num; i++) {
            var sg = group.sub_groups[i];
            if (sg.size < SUB_GROUP_CAPACITY) {
                sendGenOffer(clientId, sg.size);
                sg.add(clientId);
                clientInfo.sub_group_index = i;
                debug('after group, this group:', sg, 'g_root_group: ', g_root_group);
                return;
            }
        }
    }
    var sg = new Set();
    sg.add(clientId);
    group.sub_groups.push(sg);
    clientInfo.sub_group_index = group.sub_group_num;
    group.sub_group_num++;
}

function onDisconnect(socket) {
    var cid = g_socket_id_client_map[socket.id];
    var clientInfo = g_client_info_map[cid];
    if (clientInfo) {
        var group = g_root_group[clientInfo.level1] && g_root_group[clientInfo.level1].sub_groups[clientInfo.sub_group_index];
        group && group.delete(cid);
        delete g_client_info_map[cid];
    }
    delete g_socket_id_client_map[socket.id];
    debug(`${cid} disconnected, current group:`, group);
}

function handleMessage(socket, data) {
    debug('received message:', JSON.stringify(data));
    if (!data.type) {
        socket.emit('error', {code: '-1', msg: 'miss type parameter'});
        return;
    }
    switch (data.type) {
        case 'register':
            //group
            var geoHash = common.clientGeoHash(socket);
            g_client_info_map[data.client_id] = _.merge({socket: socket}, geoHash);
            debug(`g_client_info_map: `, g_client_info_map);
            g_socket_id_client_map[socket.id] = data.client_id;
            debug(`socket_id -> clinet_id: ${JSON.stringify(g_socket_id_client_map)}`);
            doGroup(data.client_id);
            break;
        case 'offers':
            var clientInfo = g_client_info_map[data.client_id];
            if (!clientInfo) {
                debug('no client info');
                return;
            }
            var group = g_root_group[clientInfo.level1] && g_root_group[clientInfo.level1].sub_groups[g_client_info_map[data.client_id].sub_group_index];
            if (!group) {
                debug(`no group for ${data.client_id}`);
                return;
            }
            var i = 0;
            for (var cid of group.values()) {
                if (cid !== data.client_id) {
                    var clientInfo = g_client_info_map[cid];
                    if (clientInfo) {
                        clientInfo.socket.emit('message', _.merge(data.offers[i], {
                            type: 'sdp',
                            client_id: data.client_id
                        }));
                    }
                    i++;
                }
            }
            break;
        case 'sdp':
            g_client_info_map[data.to_client_id].socket.emit('message', data);
            break;
        case 'status':

            break;
    }
}

//tracker
io.of('/tracker').on('connection', function (socket) {
    debug('peer connected to tracker, client ip: ', common.getClientIp(socket));

    socket.emit('connected', {socket_id: socket.id});
    // when the user disconnects..
    socket.on('disconnect', function () {
        onDisconnect(socket);
    });

    socket.on('message', function (data) {
        handleMessage(socket, data);
    });
});
