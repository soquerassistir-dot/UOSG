const net = require('net');

const PORT = process.env.PORT || 10000;
const rooms = {};

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

const server = net.createServer((socket) => {
    console.log('Cliente conectado');
    let buffer = '';

    socket.on('data', (data) => {
        buffer += data.toString();
        const messages = buffer.split('\0');
        buffer = messages.pop();

        for (const msg of messages) {
            const trimmed = msg.trim();
            if (!trimmed) continue;
            console.log('Recebido:', trimmed);
            handleMessage(socket, trimmed);
        }
    });

    socket.on('end', () => {
        console.log('Cliente desconectado');
        // Limpar rooms
        for (const code in rooms) {
            const room = rooms[code];
            if (room.host === socket) {
                if (room.guest) {
                    room.guest.write('OPPONENT_LEFT\0');
                }
                delete rooms[code];
            } else if (room.guest === socket) {
                room.host.write('OPPONENT_LEFT\0');
                room.guest = null;
            }
        }
    });

    socket.on('error', (err) => {
        console.log('Erro:', err.message);
    });
});

function handleMessage(socket, msg) {
    // CREATE_ROOM:PlayerName
    if (msg.startsWith('CREATE_ROOM:')) {
        const playerName = msg.split(':')[1];
        let code = generateRoomCode();
        
        // Garantir código único
        while (rooms[code]) {
            code = generateRoomCode();
        }

        rooms[code] = {
            host: socket,
            hostName: playerName,
            guest: null,
            guestName: null
        };

        socket.roomCode = code;
        socket.isHost = true;
        socket.write(`ROOM_CREATED:${code}\0`);
        console.log(`Sala criada: ${code} por ${playerName}`);
    }

    // JOIN_ROOM:CODE:PlayerName
    else if (msg.startsWith('JOIN_ROOM:')) {
        const parts = msg.split(':');
        const code = parts[1];
        const playerName = parts[2];

        const room = rooms[code];

        if (!room) {
            socket.write('JOIN_ERROR:ROOM_NOT_FOUND\0');
        } else if (room.guest) {
            socket.write('JOIN_ERROR:ROOM_FULL\0');
        } else {
            room.guest = socket;
            room.guestName = playerName;
            socket.roomCode = code;
            socket.isHost = false;

            socket.write(`JOIN_OK:${code}:${room.hostName}\0`);
            room.host.write(`OPPONENT_JOINED:${playerName}\0`);
            console.log(`${playerName} entrou na sala ${code}`);
        }
    }

    // LOBBY_READY
    else if (msg === 'LOBBY_READY') {
        const room = findRoomBySocket(socket);
        if (!room) return;

        if (socket === room.host) {
            room.hostReady = true;
            if (room.guest) {
                room.guest.write('OPPONENT_LOBBY_READY\0');
            }
        } else if (socket === room.guest) {
            room.guestReady = true;
            room.host.write('OPPONENT_LOBBY_READY\0');
        }

        if (room.hostReady && room.guestReady) {
            room.host.write('BOTH_LOBBY_READY\0');
            room.guest.write('BOTH_LOBBY_READY\0');
        }
    }

    // TEAM_SELECT:CODE
    else if (msg.startsWith('TEAM_SELECT:')) {
        const room = findRoomBySocket(socket);
        if (!room) return;

        const target = socket === room.host ? room.guest : room.host;
        if (target) {
            target.write(msg + '\0');
        }
    }

    // TEAM_READY:CODE:TEAMNAME
    else if (msg.startsWith('TEAM_READY:')) {
        const room = findRoomBySocket(socket);
        if (!room) return;

        if (socket === room.host) {
            room.hostTeamReady = true;
            if (room.guest) {
                room.guest.write('OPPONENT_TEAM_READY\0');
            }
        } else if (socket === room.guest) {
            room.guestTeamReady = true;
            room.host.write('OPPONENT_TEAM_READY\0');
        }

        if (room.hostTeamReady && room.guestTeamReady) {
            room.host.write('BOTH_TEAMS_READY\0');
            room.guest.write('BOTH_TEAMS_READY\0');
        }
    }

    // LEAVE_ROOM
    else if (msg === 'LEAVE_ROOM') {
        const room = findRoomBySocket(socket);
        if (!room) return;

        if (socket === room.host) {
            if (room.guest) {
                room.guest.write('OPPONENT_LEFT\0');
            }
            delete rooms[room.code];
        } else if (socket === room.guest) {
            room.host.write('OPPONENT_LEFT\0');
            room.guest = null;
        }
    }
}

function findRoomBySocket(socket) {
    for (const code in rooms) {
        const room = rooms[code];
        if (room.host === socket || room.guest === socket) {
            room.code = code;
            return room;
        }
    }
    return null;
}

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});