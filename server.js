require.paths.unshift(__dirname + '/npm/policyfile');
require.paths.unshift(__dirname + '/npm/socket_node/lib');
require.paths.unshift(__dirname + '/npm/socket_node_client/lib');

var http = require('http')
  , url = require('url')
  , fs = require('fs')
  , static = require('./lib/node-static')
  , sys = require('sys')
  , server;
    
var file = new(static.Server)('./public');

// since socket.io 0.7 consumes one socket we need another socket to transmit all static files from ./public dir
server = http.createServer(function(req, res){
  // all static files are served with https://github.com/cloudhead/node-static
  req.addListener('end', function () {
    file.serve(req, res);
  });
}).listen(8081);

// TODO make port configurable
// if you going to change this you also will need to change port in the connection line in ./public/pong.js
var io = require('socket.io').listen(8080);

var buffer = []
  , number_of_rooms = 10
  , rooms = []
  ;

for(var i = 0; i < number_of_rooms; i++) {
  rooms[i] = {count: 0, player_id_having_the_ball: 1}; //, round_started: false};
}

function get_list_of_rooms() {
  var list_of_rooms = {number_of_rooms: number_of_rooms, rooms: []}
  for(var i = 0; i < number_of_rooms; i++) {
    var player1_country = rooms[i].player1_country || {};
    var player2_country = rooms[i].player2_country || {};
    list_of_rooms['rooms'].push({number_of_connected_players: rooms[i].count, player1_country: player1_country, player2_country: player2_country })
  }
  return list_of_rooms;
}

io.sockets.on('connection', function (socket) {
  socket.emit('list_of_rooms', get_list_of_rooms());  
  
  socket.on('disconnect', function () {
    if(socket.room_id) {
      rooms[socket.room_id].count -= 1;
      socket.leave('room#'+socket.room_id);
    }
    io.sockets.json.emit('list_of_rooms', get_list_of_rooms());
  });
  
  socket.on('round_started', function(msg) {
    io.sockets.in('room#'+msg.room_id).json.emit('round_started', msg);
  });
  
  socket.on('sync', function(msg) {
    io.sockets.in('room#'+msg.room_id).emit('sync', msg);
  });
  
  socket.on('end_of_the_round', function(msg) {
    //selected_room.set_round_started(false);
    rooms[msg.room_id].player_id_having_the_ball = (msg.player_won == 1 ? 2 : 1); // player that lost now has the ball
    io.sockets.in('room#'+msg.room_id).json.emit("end_of_the_round", {player_won: msg.player_won, player_id_having_the_ball: rooms[msg.room_id].player_id_having_the_ball, room_id: msg.room_id});
  });
        
  socket.on('connect', function(msg) {
    socket.join('room#' + msg.room_id);
    socket.room_id = msg.room_id;
    rooms[msg.room_id].count += 1;
    
    if(rooms[msg.room_id].count == 1) {
      rooms[msg.room_id].player1_country = {};
      rooms[msg.room_id].player1_country['code'] = msg.country_code;
      rooms[msg.room_id].player1_country['name'] = msg.country_name;
    } else {
      rooms[msg.room_id].player2_country = {};
      rooms[msg.room_id].player2_country['code'] = msg.country_code;
      rooms[msg.room_id].player2_country['name'] = msg.country_name;
    }
    
    // check whether this connected user was not connected to the other room on the same server
    if(rooms[msg.room_id].count == 1) {
      socket.json.emit('player_connected', {player_id: 1, player1_country: rooms[msg.room_id].player1_country});
    } else if(rooms[msg.room_id].count == 2){
      // when second player has connected, 1st player could had moved up or down his default position, so show him right cordinates in buffer variable
      io.sockets.in('room#'+msg.room_id).json.emit('player_connected', {player_id: 2, player1_country: rooms[msg.room_id].player1_country, player2_country: rooms[msg.room_id].player2_country});// buffer: buffer 
      io.sockets.in('room#'+msg.room_id).json.emit('round_could_be_started', {room_id: socket.room_id});
    }
    
    io.sockets.json.emit('list_of_rooms', get_list_of_rooms());
  })
});
