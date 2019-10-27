const PORT = 3000;

var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var request = require('request');
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(function(req,res,next){
    req.io = io;
    next();
});

const muqabla_baseurl = 'https://karmuqabladev.wpengine.com/wp-json/wp/v1' 

let queue = {} , gameProgress = {} , rooms = {};


app.get('/test', function(req, res) {
    res.sendFile(__dirname + "/test.html");
});

async function findGame(user_id , room_data , io) {
    
    return new Promise(function(resolve , reject){
        
        if(Object.keys(queue).length) {
            
            let i = 1;
            
            for(let key in queue) {

                if(key != user_id && room_data[0].exam_id == queue[key].exam_id) {
                    
                    let room_id = generateID(4);
                    
                    let gameProgressData = {'room_id' : room_id};
                    
                    gameProgress[user_id] = gameProgressData;
                    gameProgress[key] = gameProgressData;
                    
                    io.emit('game-rooms' , gameProgress);
                    
                    let roomData = {};
                    
                    roomData[user_id] = queue[user_id]['data'];
                    roomData[key] = queue[key]['data'];
                    roomData['user1'] = user_id;
                    roomData['user2'] = key;
                    roomData['room_data'] = room_data;
                    roomData['response-'+user_id] = [];
                    roomData['response-'+key] = [];
                    roomData['status'] = 'ongoing';
                    
                    rooms[room_id] = roomData;
                    
                    delete queue[user_id];
                    delete queue[key];
                    
                    io.emit('queue-update',queue);
                    
                    resolve();
                    return;
                }
                
                if(i == Object.keys(queue).length) {
                    resolve();
                }
                
                i++;
            }
            
        } else {
            resolve();
        }
        
    });
}

app.get('/add-to-queue/:id/:exam_id', async function(req, res) {
    
    try {
        
        let params = req.params;
        
        let url = `${muqabla_baseurl}/get_user_details?user_id=${params.id}`;
        
        let response = await externalCall(url);
        
        let user_data = response.data;
        
        if(user_data) {
            
            queue[user_data.ID] = {'data' : user_data ,  'exam_id' :  params.exam_id};
            
            req.io.emit('queue-update',queue);
            
            url = `${muqabla_baseurl}/get_exam_questions?exam_id=${params.exam_id}`;
            
            response = await externalCall(url);
            
            let exam_data = response.data;
            
            await findGame(user_data.ID , exam_data , req.io);
        }
        
        return makeClientHappy('Added' , user_data , res);
        
    } catch(e) {
        console.log(e);
    }
});

app.get('/remove-from-queue/:id', async function(req, res) {
    
    try {
        
        let params = req.params;
        
        let url = `${muqabla_baseurl}/get_user_details?user_id=${params.id}`;
        
        let response = await externalCall(url);
        
        let user_data = response.data;
        
        delete queue[user_data.ID]
        
        req.io.emit('queue-update',queue);
        
        return makeClientHappy('Removed' , user_data , res);
        
    } catch(e) {
        console.log(e);
    }
});


//connection established
io.on('connection', function(socket) {
    
    
    socket.on('join' , function(user_id , room_id) {
        
        socket.room_id = room_id;
        socket.user = user_id;
        socket.join(room_id);
        
        io.sockets.in(room_id).emit('room-update', rooms[room_id]);
        
        if(roomCount(room_id) == 2) {
            
            delete gameProgress[rooms[room_id]['user1']];
            delete gameProgress[rooms[room_id]['user2']];
            
            io.emit('game-rooms' , gameProgress);
        }
    });
    
    socket.on('submit-response' , async function(user_id ,room_id , exam_response){
        
        let roomData = rooms[room_id];
        
        roomData['response-'+user_id].push(exam_response);
        
        let user1complete = roomData['response-'+roomData['user1']].length == roomData['room_data'].length;
        let user2complete = roomData['response-'+roomData['user2']].length == roomData['room_data'].length;
        
        if(user1complete && user2complete) {
            
            roomData['winner'] = await selectWinner(roomData);
            roomData['status'] = 'complete';
            
            io.sockets.in(room_id).emit('room-update' , rooms[room_id]);
            
            delete rooms[room_id];
            return;
        }
        
        io.sockets.in(room_id).emit('room-update', rooms[room_id]);
        
    });
    
    
    //user inactive
    socket.on('disconnect', function() {
        
        console.log('disconnected socket' ,socket.room_id);
        
        if(!socket.room_id && !rooms[socket.room_id]) {
            return;
        }
        
        let roomData = rooms[socket.room_id];
        
        if(roomData.status == 'ongoing') {
            
            roomData['winner'] = roomData['user1'] == socket.user ? roomData['user2'] : roomData['user1'];
            roomData['status'] = 'complete';
            
            io.sockets.in(socket.room_id).emit('room-update' , rooms[socket.room_id]);
            
            delete rooms[socket.room_id];
            
        }
    });
    
});


io.on('disconnect', function() {
    console.log('disconnected');
});

//port 
http.listen(PORT, function() {
    console.log(`listening on : ${PORT}`);
});

function selectWinner(roomFinalData) {
    
    return new Promise(function(resolve , reject) {
        
        let user1correct = [] , user2correct = [];
        let user1Data = roomFinalData['response-'+roomFinalData['user1']];
        let user2Data = roomFinalData['response-'+roomFinalData['user2']];
        
        let user1iteration = 1, user2iteration = 1;
        
        for(let key1 in user1Data) {
            
            if(user1Data[key1].correct == 1) {
                user1correct.push('correct');
            }
            
            console.log(user1iteration , user1Data.length);
            
            if(user1iteration == user1Data.length) {
                
                for(let key2 in user2Data) {

                    if(user2Data[key2].correct == 1) {
                        user2correct.push('correct');
                    }
                    
                    if(user2iteration == user2Data.length) {
                        
                        let draw_condtion = user1correct.length == user2correct.length;

                        let condition = user1correct.length > user2correct.length;
                        
                        let winner = condition ? roomFinalData['user2'] : roomFinalData['user1']; 
                        
                        let result = draw_condtion ? 0 : winner;

                        resolve(result);
                    }
                    user2iteration++;
                }
            }
            
            user1iteration++;
            
        }
        
    });
    
}

function externalCall(url , data = {} , isPost = false) {
    
    return new Promise(function (resolve, reject) {
        
        var options = {
            method: isPost ? 'POST' : 'GET',
            url: url,
            json: data
        };
        
        request(options, function (error, response, body) {
            
            if (error) throw new Error(error);
            
            if (response.statusCode != 200 && response.statusCode != 201) {
                reject(body);
            }
            
            resolve(body);
            
        });
        
    });  
    
}

function generateID(length) {
    let text = ""
    const possible = "0123456789"
    
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    
    return text
}

function sendErrorToClient(msg , data , res) {
    
    res.status(400);
    
    let json = {
        'msg' : msg,
        'data' : data
    };
    
    return res.send(json);
    
}

function makeClientHappy(msg , data , res) {
    
    res.status(200);
    
    let json = {
        'msg' : msg,
        'data' : data
    };
    
    return res.send(json);
    
}

function roomCount(roomName) {
    var roomCount = io.nsps['/'].adapter.rooms[roomName];
    if (!roomCount) return null;
    return roomCount.length;
}