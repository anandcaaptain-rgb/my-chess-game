let board = null;
let game = new Chess();
let mode = 'bot';
let conn = null;
let peer = new Peer();
let engine = new Worker('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');

// --- P2P HANDSHAKE ---
peer.on('open', id => { 
    document.getElementById('my-id').innerText = id;
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.get('join')) {
        document.getElementById('friend-id').value = urlParams.get('join');
        setTimeout(connectToFriend, 1000);
    }
});

function copyInvite() {
    const id = document.getElementById('my-id').innerText;
    const link = window.location.origin + window.location.pathname + "?join=" + id;
    navigator.clipboard.writeText(link).then(() => alert("Invite link copied!"));
}

peer.on('connection', c => { 
    conn = c; 
    mode = 'p2p'; 
    setupP2P(); 
    alert("Friend Connected! You are White."); 
});

function connectToFriend() {
    const targetId = document.getElementById('friend-id').value;
    if(!targetId) return alert("Enter an ID first");
    conn = peer.connect(targetId);
    mode = 'p2p'; 
    board.orientation('black'); 
    setupP2P();
}

function setupP2P() {
    conn.on('data', data => { 
        game.move(data); 
        board.position(game.fen()); 
        updateStatus(); 
    });
}

// --- GAMEPLAY ---
function onDrop(source, target) {
    let move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';
    
    if (conn && conn.open) conn.send(move);
    updateStatus();
    if (mode === 'bot' && !game.game_over()) window.setTimeout(makeBotMove, 250);
}

function makeBotMove() {
    let skill = document.getElementById('elo-select').value;
    engine.postMessage(`setoption name Skill Level value ${skill}`);
    engine.postMessage(`position fen ${game.fen()}`);
    engine.postMessage(`go depth 12`);
    engine.onmessage = e => {
        if (e.data.startsWith('bestmove')) {
            game.move(e.data.split(' ')[1]);
            board.position(game.fen());
            updateStatus();
        }
    };
}

function updateStatus() {
    let status = game.turn() === 'w' ? "White's Turn" : "Black's Turn";
    if (game.in_checkmate()) status = "Checkmate!";
    if (game.in_draw()) status = "Draw!";
    
    document.getElementById('status').innerText = status;
    if (game.game_over()) document.getElementById('review-btn').style.display = 'block';
}

// --- REVIEW ENGINE ---
async function runReview() {
    const list = document.getElementById('review-list');
    document.getElementById('review-panel').style.display = 'block';
    list.innerHTML = "Analyzing moves...";
    
    let history = game.history();
    let tempGame = new Chess();
    let results = [];

    for (let i = 0; i < history.length; i++) {
        tempGame.move(history[i]);
        let eval = await getEval(tempGame.fen());
        results.push({ move: history[i], eval: eval });
    }
    
    list.innerHTML = results.map((r, i) => {
        let diff = i > 0 ? Math.abs(r.eval - results[i-1].eval) : 0;
        let remark = diff > 1.5 ? "<span class='blunder'>!! Blunder</span>" : (diff < 0.2 ? "<span class='great'>Best</span>" : "");
        return `<div class='move-eval'><span>${i+1}. ${r.move}</span> <span>${r.eval.toFixed(1)} ${remark}</span></div>`;
    }).join('');
}

function getEval(fen) {
    return new Promise(resolve => {
        engine.postMessage("position fen " + fen);
        engine.postMessage("go depth 10");
        engine.onmessage = e => {
            if (e.data.includes("score cp")) {
                resolve(parseInt(e.data.split("score cp ")[1]) / 100);
            } else if (e.data.includes("score mate")) {
                resolve(10.0);
            }
        };
    });
}

function newGame(m) { 
    mode = m; 
    game.reset(); 
    board.start(); 
    document.getElementById('review-btn').style.display='none'; 
    document.getElementById('review-panel').style.display='none';
}

board = Chessboard('board', { 
    draggable: true, 
    position: 'start', 
    onDrop: onDrop, 
    onSnapEnd: () => board.position(game.fen()) 
});

window.addEventListener('resize', board.resize);
