const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const gameOverUI = document.getElementById('gameOverUI');
const winnerText = document.getElementById('winnerText');
const restartBtn = document.getElementById('restartBtn');

// =============================================================
// 🎨 [이미지 교체 영역] — 나중에 캐릭터/배경 이미지를 받으면
//    아래 ASSETS 객체의 src 경로만 채우면 자동으로 적용됩니다.
//    이미지를 비워두면(빈 문자열) 기본 도형 그래픽으로 동작합니다.
// =============================================================
const ASSETS = {
    background: '',     // 예: 'images/background.png'  (배경 전체)
    player1:    '',     // 예: 'images/player1.png'    (왼쪽 캐릭터)
    player2:    '',     // 예: 'images/player2.png'    (오른쪽 캐릭터)
    ball:       '',     // 예: 'images/ball.png'       (배구공)
};

const images = {};
for (const key of Object.keys(ASSETS)) {
    if (ASSETS[key]) {
        const img = new Image();
        img.src = ASSETS[key];
        images[key] = img;
    }
}
function imgReady(key) {
    return images[key] && images[key].complete && images[key].naturalWidth > 0;
}
// =============================================================

const MAX_SCORE = 10; // 본부대항전: 짧고 굵게 (10점제)
const GROUND_Y = canvas.height - 10;

let score1 = 0;
let score2 = 0;
let gameState = 'playing';

// 본부대항전용 — 조작이 쉽고 공이 천천히 움직이도록 튜닝
const GRAVITY = 0.35;
const PLAYER_SPEED = 5;
const PLAYER_JUMP = -12;
const BALL_MAX_SPEED = 13;

function makePlayer(x, color, side, name) {
    return {
        x, y: GROUND_Y - 40,
        vx: 0, vy: 0,
        radius: 34,
        color,
        side,
        name,
        isGrounded: true,
    };
}

const player1 = makePlayer(150, '#ffe338', 'left',  '본부 1팀');
const player2 = makePlayer(canvas.width - 150, '#ff8c1a', 'right', '본부 2팀');

const net = { x: canvas.width / 2 - 4, y: canvas.height - 130, width: 8, height: 130 };

const ball = {
    x: 200, y: 100,
    vx: 0, vy: 0,
    radius: 32, // 본부대항전용 — 크게 키워서 받기 쉽게
    rotation: 0,
};

const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys[e.code] = false);

function initGame() {
    score1 = 0;
    score2 = 0;
    gameOverUI.classList.add('hidden');
    resetRound(1);
}
restartBtn.addEventListener('click', initGame);

function resetRound(server) {
    if (score1 >= MAX_SCORE || score2 >= MAX_SCORE) {
        gameState = 'gameover';
        const winner = score1 >= MAX_SCORE ? player1.name : player2.name;
        winnerText.innerText = `Game Set!\n🎉 ${winner} 승리! 🎉`;
        gameOverUI.classList.remove('hidden');
        return;
    }

    gameState = 'ready';
    player1.x = 150; player1.y = GROUND_Y - 40; player1.vy = 0; player1.isGrounded = true;
    player2.x = canvas.width - 150; player2.y = GROUND_Y - 40; player2.vy = 0; player2.isGrounded = true;

    ball.x = server === 1 ? 200 : canvas.width - 200;
    ball.y = 80;
    ball.vx = 0; ball.vy = 0; ball.rotation = 0;

    setTimeout(() => {
        if (gameState !== 'gameover') gameState = 'playing';
    }, 900);
}

function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

// 단순하고 관대한 충돌 — 공이 머리에 닿으면 자연스럽게 위로 튐
function handlePlayerBallCollision(player) {
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const dist = Math.hypot(dx, dy);
    const minDist = ball.radius + player.radius;

    if (dist === 0 || dist > minDist) return;

    const nx = dx / dist;
    const ny = dy / dist;

    // 겹친 부분 밀어내기
    ball.x = player.x + nx * (minDist + 1);
    ball.y = player.y + ny * (minDist + 1);

    // 기본 반사 — 위쪽으로 잘 튀게
    ball.vy = -9 + Math.min(0, player.vy * 0.5);

    // 맞은 위치에 따라 좌우로 — 부드러운 컨트롤감
    ball.vx = nx * 7 + player.vx * 0.4;

    // 속도 제한 (너무 빨라지지 않게)
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > BALL_MAX_SPEED) {
        ball.vx = (ball.vx / speed) * BALL_MAX_SPEED;
        ball.vy = (ball.vy / speed) * BALL_MAX_SPEED;
    }
}

function updatePlayer(player, input) {
    player.vx = 0;
    if (keys[input.left])  player.vx = -PLAYER_SPEED;
    if (keys[input.right]) player.vx =  PLAYER_SPEED;
    if (keys[input.up] && player.isGrounded) {
        player.vy = PLAYER_JUMP;
        player.isGrounded = false;
    }

    player.x += player.vx;
    player.vy += GRAVITY;
    player.y += player.vy;

    if (player.side === 'left') {
        player.x = clamp(player.x, player.radius, net.x - player.radius);
    } else {
        player.x = clamp(player.x, net.x + net.width + player.radius, canvas.width - player.radius);
    }

    if (player.y + player.radius >= GROUND_Y) {
        player.y = GROUND_Y - player.radius;
        player.vy = 0;
        player.isGrounded = true;
    }
}

function handleNetCollision() {
    const netLeft = net.x;
    const netRight = net.x + net.width;
    const netTop = net.y;

    if (ball.x + ball.radius < netLeft || ball.x - ball.radius > netRight) return;

    // 네트 위 모서리 — 둥글게 튕기게
    if (ball.y < netTop) {
        const nearestX = clamp(ball.x, netLeft, netRight);
        const ddx = ball.x - nearestX;
        const ddy = ball.y - netTop;
        const d = Math.hypot(ddx, ddy);
        if (d < ball.radius) {
            const nx = ddx / (d || 1);
            const ny = ddy / (d || 1);
            ball.x = nearestX + nx * (ball.radius + 1);
            ball.y = netTop + ny * (ball.radius + 1);
            const vDotN = ball.vx * nx + ball.vy * ny;
            ball.vx -= 1.6 * vDotN * nx;
            ball.vy -= 1.6 * vDotN * ny;
        }
        return;
    }

    // 네트 옆면
    if (ball.x < netLeft + net.width / 2) {
        ball.x = netLeft - ball.radius;
        ball.vx = -Math.abs(ball.vx);
    } else {
        ball.x = netRight + ball.radius;
        ball.vx = Math.abs(ball.vx);
    }
}

function update() {
    if (gameState === 'gameover') return;

    updatePlayer(player1, { left: 'KeyA', right: 'KeyD', up: 'KeyW' });
    updatePlayer(player2, { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp' });

    if (gameState !== 'playing') return;

    ball.vy += GRAVITY * 0.7; // 공이 천천히 떨어지도록
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.rotation += ball.vx * 0.04;

    if (ball.x - ball.radius < 0) {
        ball.x = ball.radius;
        ball.vx = Math.abs(ball.vx);
    } else if (ball.x + ball.radius > canvas.width) {
        ball.x = canvas.width - ball.radius;
        ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y - ball.radius < 0) {
        ball.y = ball.radius;
        ball.vy = Math.abs(ball.vy);
    }

    handleNetCollision();
    handlePlayerBallCollision(player1);
    handlePlayerBallCollision(player2);

    if (ball.y + ball.radius >= GROUND_Y) {
        if (ball.x < net.x + net.width / 2) { score2++; resetRound(2); }
        else { score1++; resetRound(1); }
    }
}

// ----- 그리기 -----

function drawBackground() {
    if (imgReady('background')) {
        ctx.drawImage(images.background, 0, 0, canvas.width, canvas.height);
        return;
    }
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, '#87CEEB');
    sky.addColorStop(1, '#bde4f5');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#c98a3a';
    ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
    ctx.strokeStyle = '#8a5a1a';
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(canvas.width, GROUND_Y);
    ctx.stroke();
}

function drawNet() {
    ctx.fillStyle = '#555';
    ctx.fillRect(net.x, net.y, net.width, net.height);
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.arc(net.x + net.width / 2, net.y, net.width * 0.9, 0, Math.PI * 2);
    ctx.fill();
}

function drawPlayer(p, imgKey) {
    if (imgReady(imgKey)) {
        const size = p.radius * 2.2;
        ctx.save();
        if (p.side === 'right') {
            ctx.translate(p.x + size / 2, p.y - size / 2);
            ctx.scale(-1, 1);
            ctx.drawImage(images[imgKey], 0, 0, size, size);
        } else {
            ctx.drawImage(images[imgKey], p.x - size / 2, p.y - size / 2, size, size);
        }
        ctx.restore();
        return;
    }
    // 기본 그래픽 (이미지 없을 때) — 동그란 캐릭터
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.radius + 4, p.radius * 0.7, p.radius * 0.15, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = '#3a2a00';
    ctx.lineWidth = 2;
    ctx.stroke();

    const facing = p.side === 'left' ? 1 : -1;
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(p.x - p.radius * 0.3 * facing, p.y - p.radius * 0.2, p.radius * 0.1, 0, Math.PI * 2);
    ctx.arc(p.x + p.radius * 0.3 * facing, p.y - p.radius * 0.2, p.radius * 0.1, 0, Math.PI * 2);
    ctx.fill();
}

function drawBall() {
    if (imgReady('ball')) {
        const size = ball.radius * 2;
        ctx.save();
        ctx.translate(ball.x, ball.y);
        ctx.rotate(ball.rotation);
        ctx.drawImage(images.ball, -size / 2, -size / 2, size, size);
        ctx.restore();
        return;
    }
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.rotation);
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(-ball.radius * 0.3, -ball.radius * 0.3, ball.radius * 0.2, 0, 0, ball.radius);
    grad.addColorStop(0, '#fff5b0');
    grad.addColorStop(1, '#e8a90a');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#6b4500';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-ball.radius, 0); ctx.lineTo(ball.radius, 0);
    ctx.moveTo(0, -ball.radius); ctx.lineTo(0, ball.radius);
    ctx.stroke();
    ctx.restore();
}

function drawHUD() {
    ctx.fillStyle = '#333';
    ctx.font = 'bold 50px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${score1} : ${score2}`, canvas.width / 2, 70);

    ctx.font = 'bold 14px "Malgun Gothic", Arial';
    ctx.fillStyle = '#444';
    ctx.fillText(player1.name, canvas.width * 0.25, 95);
    ctx.fillText(player2.name, canvas.width * 0.75, 95);

    if (gameState === 'ready') {
        ctx.fillStyle = '#d33';
        ctx.font = 'bold 30px Arial';
        ctx.fillText('Ready...', canvas.width / 2, 130);
    }

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = '12px "Malgun Gothic", Arial';
    ctx.textAlign = 'left';
    ctx.fillText('1팀: A / D 이동, W 점프', 12, canvas.height - 22);
    ctx.textAlign = 'right';
    ctx.fillText('2팀: ← / → 이동, ↑ 점프', canvas.width - 12, canvas.height - 22);
}

function draw() {
    drawBackground();
    drawNet();
    drawHUD();
    drawPlayer(player1, 'player1');
    drawPlayer(player2, 'player2');
    drawBall();
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
