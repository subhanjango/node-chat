var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var axios = require('axios');
var bodyParser = require('body-parser');
var mysql = require('mysql');
var moment = require('moment');
app.use(bodyParser.json());
app.use(
    bodyParser.urlencoded({
        extended: true
    })
);
var users = {};
var con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "findnspot"
});

con.connect(function(err) {
    if (err) throw err;
    console.log("Connected!");
});
//connection established
io.on('connection', function (socket) {
//new chat msg
    socket.on('chatadd', function (obj) {

        var sql = "INSERT INTO chats (sender, receiver, message, room_id, created_at ) " +
            "VALUES ('"+obj.sender+"','"+obj.receiver+"','"+sanitizeForMySQL(obj.msg)+"','"+obj.room_id+"','"+moment.utc(new Date()).format('YYYY-MM-DD HH:mm:ss')+"')";

        con.query(sql, function (err, result) {
            if (err) throw err;
            console.log("1 record inserted");
        });
    console.log('Sent msg on room: ',obj.room_id);
    io.sockets.in(obj.room_id).emit('updateChat', obj);

    });
    //new user added
    socket.on('userAddToRoom', function (roomID , user_id) {

        //subscribe to room
        socket.user = user_id;
        socket.join(roomID);

        console.log('joining room', roomID);
    });

    socket.on('postMsgSent',function (room_id , msgObj) {
        io.sockets.in(room_id).emit('updateChat', msgObj);
    });

    socket.on('userActive' , function (id) {
        users[socket.id] = id;
        //subscribe to room
        socket.user = id;
        socket.join(id);
        console.log('Active user id',users[socket.id]);
    });


    socket.on('disconnect', function () {
        console.log('user ' + users[socket.id] + ' disconnected');
        delete users[socket.id];
    });

    socket.on('checkActive',function (userID) {
        return Object.values(users).indexOf(userID);
    });

});

//port 
http.listen(3000, function () {
    console.log('listening');
});


function sanitizeForMySQL (str) {
    return str.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, function (char) {
        switch (char) {
            case "\0":
                return "\\0";
            case "\x08":
                return "\\b";
            case "\x09":
                return "\\t";
            case "\x1a":
                return "\\z";
            case "\n":
                return "\\n";
            case "\r":
                return "\\r";
            case "\"":
            case "'":
            case "\\":
            case "%":
                return "\\"+char; // prepends a backslash to backslash, percent,
                                  // and double/single quotes
        }
    });
}

function inArray(needle, haystack) {
    var length = haystack.length;
    for(var i = 0; i < length; i++) {
        if(haystack[i] == needle)
            return true;
    }
    return false;
}