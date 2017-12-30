var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var mongo = require('mongoose');
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
//users count
var users = 0;
//index route
app.get('/', function(req, res) {
    res.sendFile(__dirname + "/register.html");
});
//index route
app.get('/chat/:id', function(req, res) {
    res.sendFile(__dirname + "/index.html");
});
//friends route
app.get('/friends', function(req, res) {
    res.sendFile(__dirname + "/friends.html");
});
//mongo connection
mongo.connect('mongodb://localhost/chat', function(err) {
    if (err) {
        console.log(err);
    } else {
        console.log('Mongoose ready');
    }
});
//Creating schema 
var chatSchema = mongo.Schema({
    msg: String,
    to: String,
    from: String,
    from_name: String,
    time: { type: Date, default: Date.now }
});
//Creating collection in db
var Chat = mongo.model('Message', chatSchema);
//connection established
io.on('connection', function(socket) {

    function getOldMsgs(to, from, room) {

        //retrieve msg
        var query = Chat.find({
            $or: [
                { $and: [{ to: to }, { from: from }] },
                { $and: [{ to: from }, { from: to }] }
            ]
        });
        query.sort('time').exec(function(err, docs) {
            if (err) {
                throw err;
            } else {
                //send old msg to client
                console.log('Sending to room:', room);
                io.sockets.in(room).emit('oldMsgs', docs);
            }
        });
    }

    //new chat msg
    socket.on('chatadd', function(msg) {

        //get user data
        UserReg.findOne({ ID: msg.from }, function(err, user) {
            if (err) {
                throw err;
            } else {
                //send old msg to client
                var newMsg = new Chat({
                    msg: msg.msg,
                    to: msg.to,
                    from: msg.from,
                    from_name: user.Name
                });


                //saving msg in db
                newMsg.save(function(err, docs) {
                    if (err) {
                        console.log(err);
                        throw err;
                    } else {
                        //send old msg to client
                        if (parseInt(msg.to) > parseInt(msg.from)) {
                            room = msg.to + '-' + msg.from;
                        } else {
                            room = msg.from + '-' + msg.to;
                        }
                        getOldMsgs(msg.to, msg.from, room);
                    }
                });
            }
        });

    });
    //new user added
    socket.on('user', function(to, from) {


        if (parseInt(to) > parseInt(from)) {
            room = to + '-' + from;
        } else {
            room = from + '-' + to;
        }

        //subscribe to room
        socket.user = from;
        socket.join(room);


        console.log('joining room', room);

        data = {
            "users": roomCount(room),
            "room": room
        };
        getOldMsgs(to, from, room);
        //send user count
        io.emit('userUpdate', data);
    });
    //user inactive
    socket.on('bye', function() {
        if (users != 0 && users > 1) {
            //remove user
            users = users - 1;
            //send updated user count
            io.emit('userUpdate', users);
        }
        console.log('disconnected');
    });

});


io.on('disconnect', function() {
    if (users != 0 && users > 1) {
        //remove user
        users = users - 1;
        //send updated user count
        io.emit('userUpdate', users);
    }
    console.log('disconnected');
});
//port 
http.listen(3000, function() {
    console.log('listening');
});
//adding user

// Schema
var RegSchema = mongo.Schema({
    Name: String,
    reg_time: {
        type: Date,
        default: Date.now
    },
    ID: String
});

// Model
var UserReg = mongo.model('UserReg', RegSchema);
app.post("/register", function(req, res) {
    var data = { "msg": '' };

    var checkExists = UserReg.findOne({ Name: req.body.Name }, function(err, user) {
        if (err) {
            console.log(err);
        }
        if (user) {
            data.user = user.ID;
        } else {

            // Add in collection
            var UserAdd = new UserReg({
                Name: req.body.Name,
                ID: generateID(10)
            });

            // Save
            UserAdd.save(function(err, fluffy) {
                if (err) return console.error(err);
            });

            data.user = UserAdd.ID;
        }
        res.send(data);
    });

});

function generateID(length) {
    let text = ""
    const possible = "0123456789"

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }

    return text
}

//list people
app.get('/people/:user_id', function name(req, res) {

    //console.log(req);
    //retrieve msg
    var query = UserReg.find({ ID: { $ne: parseInt(req.params.user_id) } });
    query.sort('-reg_time').exec(function(err, docs) {
        if (err) {
            throw err;
        } else {
            //send old msg to client
            res.send(docs);
        }
    });
});

function roomCount(roomName) {
    var roomCount = io.nsps['/'].adapter.rooms[roomName];
    if (!roomCount) return null;
    return roomCount.length;
}