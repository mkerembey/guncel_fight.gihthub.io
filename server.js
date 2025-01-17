const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));

const games = new Map();
const waitingPlayers = new Set();

io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı');

    socket.on('findGame', () => {
        if (waitingPlayers.size > 0) {
            const opponent = Array.from(waitingPlayers)[0];
            waitingPlayers.delete(opponent);
            
            const gameId = Math.random().toString(36).substring(7);
            games.set(gameId, {
                players: [opponent, socket.id],
                currentRound: 1,
                scores: {[opponent]: 0, [socket.id]: 0},
                selections: {},
                lastCards: {[opponent]: null, [socket.id]: null},
                cards: {
                    [opponent]: [1, 2, 3, 4, 5, 6, 7],
                    [socket.id]: [1, 2, 3, 4, 5, 6, 7]
                }
            });

            io.to(opponent).emit('gameStart', { gameId, isPlayer1: true });
            socket.emit('gameStart', { gameId, isPlayer1: false });
        } else {
            waitingPlayers.add(socket.id);
            socket.emit('waiting');
        }
    });

    socket.on('selectCard', ({ gameId, card }) => {
        const game = games.get(gameId);
        if (!game) return;

        game.selections[socket.id] = card;
        game.cards[socket.id] = game.cards[socket.id].filter(c => c !== card);

        if (Object.keys(game.selections).length === 2) {
            const [player1, player2] = game.players;
            const card1 = game.selections[player1];
            const card2 = game.selections[player2];

            if (card1 > card2) {
                game.scores[player1]++;
            } else if (card2 > card1) {
                game.scores[player2]++;
            }

            game.lastCards[player1] = card1;
            game.lastCards[player2] = card2;

            io.to(player1).emit('roundResult', {
                myCard: card1,
                opponentCard: card2,
                myScore: game.scores[player1],
                opponentScore: game.scores[player2],
                round: game.currentRound
            });

            io.to(player2).emit('roundResult', {
                myCard: card2,
                opponentCard: card1,
                myScore: game.scores[player2],
                opponentScore: game.scores[player1],
                round: game.currentRound
            });

            game.selections = {};
            game.currentRound++;

            if (game.currentRound > 7) {
                const winner = game.scores[player1] > game.scores[player2] ? player1 : 
                             game.scores[player2] > game.scores[player1] ? player2 : null;
                
                io.to(player1).emit('gameEnd', { 
                    winner: winner === player1 ? 'you' : winner === player2 ? 'opponent' : 'draw'
                });
                io.to(player2).emit('gameEnd', { 
                    winner: winner === player2 ? 'you' : winner === player1 ? 'opponent' : 'draw'
                });
                
                games.delete(gameId);
            } else {
                io.to(gameId).emit('newRound', { round: game.currentRound });
            }
        }
    });

    socket.on('disconnect', () => {
        waitingPlayers.delete(socket.id);
        
        for (const [gameId, game] of games.entries()) {
            if (game.players.includes(socket.id)) {
                const opponent = game.players.find(id => id !== socket.id);
                if (opponent) {
                    io.to(opponent).emit('opponentLeft');
                }
                games.delete(gameId);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
http.listen(PORT, HOST, () => {
    console.log(`Server ${PORT} portunda çalışıyor (${HOST})`);
}); 