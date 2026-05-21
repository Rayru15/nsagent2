const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const gameOverUI = document.getElementById('gameOverUI');
const winnerText = document.getElementById('winnerText');
const restartBtn = document.getElementById('restartBtn');

// =============================================================
// [이미지 교체 영역] — 이미지 파일을 받으면 경로만 채우세요.
// 비워두면 캔버스 드로잉으로 동작합니다.
// =============================================================
const ASSETS = {
    background: '',   // 'images/background.png'
    player1:    '',   // 'images/player1.png'
    player2:    '',   // 'images/player2.png'
    ball:       '',   // 'images/ball.png'
};
const images = {};
for (const key of Object.keys(ASSETS)) {
    if (ASSETS[key]) { const img = new Image(); img.src = ASSETS[key]; images[key] = img; }
}
function imgReady(key) {
    return images[key] && images[key].complete && images[key].naturalWidth > 0;
}
// =============================================================

const MAX_SCORE  = 10;
const GROUND_Y   = canvas.height - 50;
const GRAVITY    = 0.35;
const PLAYER_SPD = 5;
const PLAYER_JMP = -12;
const BALL_MAX_V = 13;

let score1 = 0, score2 = 0;
let gameState   = 'playing';
let bounceLeft  = 1;
let bounceRight = 1;
let frameCount  = 0;

// 구름 (배경용 — 고정 위치, 천천히 흘러감)
const clouds = Array.from({ length: 5 }, (_, i) => ({
    x: 80 + i * 160, y: 30 + Math.random() * 60,
    w: 70 + Math.random() * 60, h: 28 + Math.random() * 18,
    speed: 0.15 + Math.random() * 0.2,
}));

function makePlayer(x, color, eyeColor, cheekColor, side, name) {
    return {
        x, y: GROUND_Y - 34,
        vx: 0, vy: 0,
        radius: 34,
        color, eyeColor, cheekColor,
        side, name,
        isGrounded: true,
        squashY: 1, squashX: 1,   // 찌그러짐 연출
        walkFrame: 0,
    };
}

const player1 = makePlayer(150,               '#FFE033', '#1a1a1a', '#FF6B6B', 'left',  '본부 1팀');
const player2 = makePlayer(canvas.width - 150,'#FF8C1A', '#1a1a1a', '#FF6B6B', 'right', '본부 2팀');

const net = { x: canvas.width / 2 - 4, y: GROUND_Y - 120, width: 8, height: 120 };

const ball = {
    x: 200, y: 100, vx: 0, vy: 0,
    radius: 32, rotation: 0,
    trail: [],   // 잔상용
};

// ── 파티클 ──────────────────────────────────────────────────
const particles = [];

function spawnParticles(x, y, opts) {
    const { count = 12, colors, speedMin = 2, speedMax = 6,
            sizeMin = 3, sizeMax = 6, decay = null,
            vyBias = 0, gravity = 0.2, shape = 'circle' } = opts;
    for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = speedMin + Math.random() * (speedMax - speedMin);
        particles.push({
            x, y,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s + vyBias,
            life: 1,
            decay: decay ?? (0.04 + Math.random() * 0.03),
            size: sizeMin + Math.random() * (sizeMax - sizeMin),
            color: colors[Math.floor(Math.random() * colors.length)],
            gravity,
            shape,
        });
    }
}

// 충격파 링 (히트 시)
const shockwaves = [];
function spawnShockwave(x, y, color) {
    shockwaves.push({ x, y, r: 8, maxR: ball.radius * 2.5, life: 1, color });
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.vy += p.gravity; p.vx *= 0.97;
        p.life -= p.decay;
        if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const s = shockwaves[i];
        s.r += (s.maxR - s.r) * 0.18;
        s.life -= 0.07;
        if (s.life <= 0) shockwaves.splice(i, 1);
    }
}

function drawParticles() {
    for (const p of particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        if (p.shape === 'star') {
            drawStar(p.x, p.y, 5, p.size, p.size * 0.45);
        } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    for (const s of shockwaves) {
        ctx.save();
        ctx.globalAlpha = s.life * 0.7;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
    ctx.globalAlpha = 1;
}

function drawStar(cx, cy, pts, outerR, innerR) {
    ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const a = (i * Math.PI) / pts - Math.PI / 2;
        i === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
                : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
    ctx.fill();
}
// ────────────────────────────────────────────────────────────

const keys = {};
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function initGame() {
    score1 = 0; score2 = 0;
    gameOverUI.classList.add('hidden');
    resetRound(1);
}
restartBtn.addEventListener('click', initGame);

function resetRound(server) {
    if (score1 >= MAX_SCORE || score2 >= MAX_SCORE) {
        gameState = 'gameover';
        winnerText.innerText = `Game Set!\n🎉 ${score1 >= MAX_SCORE ? player1.name : player2.name} 승리! 🎉`;
        gameOverUI.classList.remove('hidden');
        return;
    }
    gameState = 'ready';
    player1.x = 150;               player1.y = GROUND_Y - 34; player1.vy = 0; player1.isGrounded = true;
    player2.x = canvas.width - 150; player2.y = GROUND_Y - 34; player2.vy = 0; player2.isGrounded = true;
    ball.x = server === 1 ? 200 : canvas.width - 200;
    ball.y = 80; ball.vx = 0; ball.vy = 0; ball.rotation = 0; ball.trail = [];
    bounceLeft = 1; bounceRight = 1;
    setTimeout(() => { if (gameState !== 'gameover') gameState = 'playing'; }, 900);
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function handlePlayerBallCollision(player) {
    const dx = ball.x - player.x, dy = ball.y - player.y;
    const dist = Math.hypot(dx, dy);
    const minDist = ball.radius + player.radius;
    if (!dist || dist > minDist) return;

    const nx = dx / dist, ny = dy / dist;
    ball.x = player.x + nx * (minDist + 1);
    ball.y = player.y + ny * (minDist + 1);

    ball.vy = -9 + Math.min(0, player.vy * 0.5);
    ball.vx = nx * 7 + player.vx * 0.4;

    const spd = Math.hypot(ball.vx, ball.vy);
    if (spd > BALL_MAX_V) { ball.vx = ball.vx / spd * BALL_MAX_V; ball.vy = ball.vy / spd * BALL_MAX_V; }

    // 찌그러짐 연출
    player.squashY = 0.75; player.squashX = 1.3;

    // 이펙트
    spawnShockwave(ball.x, ball.y, player.color);
    spawnParticles(ball.x, ball.y, {
        count: 18,
        colors: [player.color, '#fff', '#ffe066'],
        speedMin: 2, speedMax: 7,
        sizeMin: 3, sizeMax: 7,
        shape: 'star',
        vyBias: -1,
        gravity: 0.25,
    });
    spawnParticles(ball.x, ball.y, {
        count: 10,
        colors: ['#fff', player.color],
        speedMin: 1, speedMax: 4,
        sizeMin: 2, sizeMax: 4,
        gravity: 0.15,
    });
}

function updatePlayer(player, input) {
    player.vx = 0;
    if (keys[input.left])  player.vx = -PLAYER_SPD;
    if (keys[input.right]) player.vx =  PLAYER_SPD;
    if (keys[input.up] && player.isGrounded) {
        player.vy = PLAYER_JMP;
        player.isGrounded = false;
        player.squashY = 1.3; player.squashX = 0.75;
        // 점프 먼지
        spawnParticles(player.x, player.y + player.radius, {
            count: 10,
            colors: ['#d4b483', '#c8a96e', '#e8d5aa'],
            speedMin: 1, speedMax: 3.5,
            sizeMin: 3, sizeMax: 7,
            vyBias: 0.5,
            gravity: 0.3,
            decay: 0.06,
        });
    }

    player.x += player.vx;
    player.vy += GRAVITY;
    player.y += player.vy;

    player.side === 'left'
        ? (player.x = clamp(player.x, player.radius, net.x - player.radius))
        : (player.x = clamp(player.x, net.x + net.width + player.radius, canvas.width - player.radius));

    if (player.y + player.radius >= GROUND_Y) {
        player.y = GROUND_Y - player.radius;
        player.vy = 0;
        player.isGrounded = true;
        player.squashY = 0.82; player.squashX = 1.2;
    }

    // 찌그러짐 복원 (스프링)
    player.squashY += (1 - player.squashY) * 0.22;
    player.squashX += (1 - player.squashX) * 0.22;

    // 걷기 프레임
    if (!player.isGrounded || Math.abs(player.vx) > 0.5) player.walkFrame += 0.25;
}

function handleNetCollision() {
    const nL = net.x, nR = net.x + net.width, nT = net.y;
    if (ball.x + ball.radius < nL || ball.x - ball.radius > nR) return;
    if (ball.y < nT) {
        const nearX = clamp(ball.x, nL, nR);
        const ddx = ball.x - nearX, ddy = ball.y - nT;
        const d = Math.hypot(ddx, ddy);
        if (d < ball.radius) {
            const nx = ddx / (d||1), ny = ddy / (d||1);
            ball.x = nearX + nx * (ball.radius + 1);
            ball.y = nT    + ny * (ball.radius + 1);
            const vn = ball.vx * nx + ball.vy * ny;
            ball.vx -= 1.6 * vn * nx;
            ball.vy -= 1.6 * vn * ny;
        }
        return;
    }
    if (ball.x < nL + net.width / 2) { ball.x = nL - ball.radius; ball.vx = -Math.abs(ball.vx); }
    else                              { ball.x = nR + ball.radius; ball.vx =  Math.abs(ball.vx); }
}

function update() {
    frameCount++;
    updateParticles();
    if (gameState === 'gameover') return;

    updatePlayer(player1, { left: 'KeyA',      right: 'KeyD',      up: 'KeyW' });
    updatePlayer(player2, { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp' });

    if (gameState !== 'playing') return;

    // 공 물리
    ball.vy += GRAVITY * 0.7;
    ball.x  += ball.vx;
    ball.y  += ball.vy;
    ball.rotation += ball.vx * 0.05;

    // 잔상 기록
    ball.trail.push({ x: ball.x, y: ball.y, spd: Math.hypot(ball.vx, ball.vy) });
    if (ball.trail.length > 10) ball.trail.shift();

    if (ball.x - ball.radius < 0)              { ball.x = ball.radius;              ball.vx =  Math.abs(ball.vx); }
    else if (ball.x + ball.radius > canvas.width) { ball.x = canvas.width - ball.radius; ball.vx = -Math.abs(ball.vx); }
    if (ball.y - ball.radius < 0)              { ball.y = ball.radius;              ball.vy =  Math.abs(ball.vy); }

    handleNetCollision();
    handlePlayerBallCollision(player1);
    handlePlayerBallCollision(player2);

    if (ball.y + ball.radius >= GROUND_Y) {
        const onLeft = ball.x < net.x + net.width / 2;
        if ((onLeft ? bounceLeft : bounceRight) > 0) {
            if (onLeft) bounceLeft--; else bounceRight--;
            ball.y = GROUND_Y - ball.radius;
            ball.vy = -Math.max(8, Math.abs(ball.vy) * 0.8);
            ball.vx *= 0.7;
            spawnParticles(ball.x, GROUND_Y, {
                count: 16,
                colors: ['#d4b483', '#c8a96e', '#fff9e6'],
                speedMin: 1.5, speedMax: 5,
                sizeMin: 3, sizeMax: 6,
                vyBias: -1.5,
                gravity: 0.35,
                decay: 0.055,
            });
        } else {
            onLeft ? (score2++, resetRound(2)) : (score1++, resetRound(1));
        }
    }

    // 구름 이동
    for (const c of clouds) {
        c.x += c.speed;
        if (c.x - c.w > canvas.width) c.x = -c.w;
    }
}

// ── 그리기 ──────────────────────────────────────────────────

function drawBackground() {
    if (imgReady('background')) {
        ctx.drawImage(images.background, 0, 0, canvas.width, canvas.height);
        return;
    }

    // 하늘 그라데이션
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0,   '#4ab8f5');
    sky.addColorStop(0.5, '#87CEEB');
    sky.addColorStop(1,   '#c8eaf8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 구름
    for (const c of clouds) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.shadowColor = 'rgba(180,220,255,0.6)';
        ctx.shadowBlur = 10;
        // 구름 = 여러 원을 겹친 모양
        const puffs = [
            { ox: 0,         oy: 0,     r: c.h * 0.55 },
            { ox: c.w * 0.25, oy: -c.h * 0.2, r: c.h * 0.65 },
            { ox: c.w * 0.5,  oy: -c.h * 0.1, r: c.h * 0.55 },
            { ox: c.w * 0.75, oy: 0,     r: c.h * 0.45 },
            { ox: c.w,       oy: 0.05,  r: c.h * 0.38 },
        ];
        ctx.beginPath();
        for (const pf of puffs) ctx.arc(c.x + pf.ox, c.y + pf.oy, pf.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 먼 산 실루엣 — canvas.width 비율 기반
    const W = canvas.width, GY = GROUND_Y;
    ctx.fillStyle = '#8ecfee';
    ctx.beginPath();
    ctx.moveTo(0, GY - 40);
    ctx.lineTo(W * 0.075, GY - 95);  ctx.lineTo(W * 0.175, GY - 60);
    ctx.lineTo(W * 0.275, GY - 115); ctx.lineTo(W * 0.388, GY - 70);
    ctx.lineTo(W * 0.525, GY - 130); ctx.lineTo(W * 0.638, GY - 80);
    ctx.lineTo(W * 0.775, GY - 110); ctx.lineTo(W * 0.9,   GY - 65);
    ctx.lineTo(W,         GY - 90);  ctx.lineTo(W, GY);
    ctx.lineTo(0, GY);
    ctx.closePath();
    ctx.fill();

    // 바다(코트 바닥)
    const sand = ctx.createLinearGradient(0, GROUND_Y, 0, canvas.height);
    sand.addColorStop(0, '#f5d68a');
    sand.addColorStop(1, '#e8b84b');
    ctx.fillStyle = sand;
    ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);

    // 모래 라인 장식
    ctx.strokeStyle = 'rgba(200,160,60,0.4)';
    ctx.lineWidth = 1.5;
    for (let lx = 0; lx < canvas.width; lx += 40) {
        ctx.beginPath();
        ctx.moveTo(lx, GROUND_Y + 4);
        ctx.lineTo(lx + 20, GROUND_Y + 10);
        ctx.stroke();
    }

    // 코트 중앙선(점선)
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, net.y);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawNet() {
    // 그물 선
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    for (let gy = net.y + 12; gy < GROUND_Y; gy += 16) {
        ctx.beginPath();
        ctx.moveTo(net.x - 1, gy); ctx.lineTo(net.x + net.width + 1, gy);
        ctx.stroke();
    }
    // 기둥
    const pillarGrad = ctx.createLinearGradient(net.x, 0, net.x + net.width, 0);
    pillarGrad.addColorStop(0, '#888');
    pillarGrad.addColorStop(0.5, '#ccc');
    pillarGrad.addColorStop(1, '#888');
    ctx.fillStyle = pillarGrad;
    ctx.fillRect(net.x, net.y, net.width, net.height);
    // 상단 흰 테이프
    ctx.fillStyle = '#fff';
    ctx.fillRect(net.x - 2, net.y - 5, net.width + 4, 8);
    // 꼭대기 구슬
    ctx.fillStyle = '#eee';
    ctx.beginPath();
    ctx.arc(net.x + net.width / 2, net.y - 5, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1.5;
    ctx.stroke();
}

function drawPlayer(p, imgKey) {
    if (imgReady(imgKey)) {
        const size = p.radius * 2.4;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(p.squashX * (p.side === 'right' ? -1 : 1), p.squashY);
        ctx.drawImage(images[imgKey], -size / 2, -size / 2, size, size);
        ctx.restore();
        return;
    }

    const r  = p.radius;
    const f  = p.side === 'left' ? 1 : -1;   // 바라보는 방향

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.squashX, p.squashY);

    // 그림자
    ctx.beginPath();
    ctx.ellipse(0, r + 5, r * 0.65, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fill();

    // ─ 귀 (몸통 뒤에 먼저) ─
    const earAngle = -0.9;
    for (const side of [-1, 1]) {
        const ex = side * r * 0.62;
        const ey = -r * 0.72;
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(side * earAngle * 0.3);
        // 귀 본체
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-r * 0.28 * side, -r * 0.62);
        ctx.lineTo( r * 0.28 * side, -r * 0.62);
        ctx.closePath();
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
        // 귀 속 (검은 끝부분)
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.1);
        ctx.lineTo(-r * 0.14 * side, -r * 0.56);
        ctx.lineTo( r * 0.14 * side, -r * 0.56);
        ctx.closePath();
        ctx.fillStyle = '#1a1a1a';
        ctx.fill();
        ctx.restore();
    }

    // ─ 몸통(원) ─
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    const bodyGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    bodyGrad.addColorStop(0, lighten(p.color, 40));
    bodyGrad.addColorStop(1, p.color);
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.stroke();

    // ─ 볼 터치 (빨간 동그라미) ─
    ctx.beginPath();
    ctx.arc(f * r * 0.52, r * 0.18, r * 0.21, 0, Math.PI * 2);
    ctx.fillStyle = p.cheekColor;
    ctx.globalAlpha = 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;

    // ─ 눈 ─
    const eyeOffX = f * r * 0.28;
    // 흰자
    ctx.beginPath();
    ctx.ellipse(eyeOffX, -r * 0.18, r * 0.14, r * 0.17, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    // 동공
    ctx.beginPath();
    ctx.arc(eyeOffX + f * r * 0.04, -r * 0.16, r * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = p.eyeColor;
    ctx.fill();
    // 눈 반짝임
    ctx.beginPath();
    ctx.arc(eyeOffX + f * r * 0.06, -r * 0.22, r * 0.03, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // ─ 입 ─
    ctx.beginPath();
    ctx.arc(f * r * 0.12, r * 0.12, r * 0.14, 0.1, Math.PI - 0.1);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
    ctx.stroke();

    // ─ 꼬리 (오른쪽 플레이어는 왼쪽에) ─
    const tx = -f * r * 0.85, ty = r * 0.1;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(-f * 0.4);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-f * r * 0.45, -r * 0.55);
    ctx.lineTo(-f * r * 0.55, -r * 0.25);
    ctx.lineTo(-f * r * 0.15, -r * 0.1);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
}

function drawBallTrail() {
    const spd = Math.hypot(ball.vx, ball.vy);
    if (spd < 2) return;
    const trailColor = spd > 9 ? '#ff6b35' : spd > 5 ? '#ffe066' : '#e8d090';
    for (let i = 0; i < ball.trail.length; i++) {
        const t = ball.trail[i];
        const prog = (i + 1) / ball.trail.length; // 0~1, 오래될수록 작고 흐림
        const alpha = prog * 0.5 * Math.min(1, spd / 5);
        const r = ball.radius * (0.3 + prog * 0.65);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(t.x, t.y);
        // 공 모양 그대로 — 원 + 배구공 선
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = trailColor;
        ctx.fill();
        if (prog > 0.5 && r > 10) {
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-r, 0); ctx.quadraticCurveTo(0, r * 0.35, r, 0);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-r, 0); ctx.quadraticCurveTo(0, -r * 0.35, r, 0);
            ctx.stroke();
        }
        ctx.restore();
    }
    ctx.globalAlpha = 1;
}

function drawBall() {
    drawBallTrail();

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

    const r = ball.radius;

    // 공 본체 — 배구공 느낌 (흰색 바탕)
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    const ballGrad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
    ballGrad.addColorStop(0, '#fffef0');
    ballGrad.addColorStop(0.6, '#f5e8b0');
    ballGrad.addColorStop(1, '#d4a820');
    ctx.fillStyle = ballGrad;
    ctx.fill();
    ctx.strokeStyle = '#a07010'; ctx.lineWidth = 2;
    ctx.stroke();

    // 배구공 선 (3방향 곡선)
    ctx.strokeStyle = '#8a6010';
    ctx.lineWidth = 1.8;
    // 수평선
    ctx.beginPath();
    ctx.moveTo(-r, 0); ctx.quadraticCurveTo(0, r * 0.35, r, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r, 0); ctx.quadraticCurveTo(0, -r * 0.35, r, 0);
    ctx.stroke();
    // 비스듬 선 1
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.87);
    ctx.quadraticCurveTo(r * 0.5, 0, -r * 0.5, r * 0.87);
    ctx.stroke();
    // 비스듬 선 2
    ctx.beginPath();
    ctx.moveTo(r * 0.5, -r * 0.87);
    ctx.quadraticCurveTo(-r * 0.5, 0, r * 0.5, r * 0.87);
    ctx.stroke();

    // 하이라이트
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.3, r * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();

    ctx.restore();
}

function drawHUD() {
    // 점수판 배경
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.roundRect(canvas.width / 2 - 90, 10, 180, 60, 12);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.fillText(`${score1} : ${score2}`, canvas.width / 2, 58);
    ctx.shadowBlur = 0;

    // 팀명 + 찬스 — 각 팀 코너에 패널로
    const teamPanels = [
        { name: player1.name, color: player1.color, bounce: bounceLeft,  x: canvas.width * 0.15 },
        { name: player2.name, color: player2.color, bounce: bounceRight, x: canvas.width * 0.85 },
    ];
    for (const tp of teamPanels) {
        // 패널 배경
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.roundRect(tp.x - 75, 8, 150, 56, 10);
        ctx.fill();
        // 팀명
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 4;
        ctx.font = 'bold 20px "Malgun Gothic", Arial';
        ctx.fillStyle = tp.color;
        ctx.fillText(tp.name, tp.x, 32);
        // 찬스 하트
        ctx.font = '18px Arial';
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 0;
        ctx.fillText(tp.bounce > 0 ? '❤️ 찬스' : '🤍 없음', tp.x, 54);
    }

    if (gameState === 'ready') {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 36px "Malgun Gothic", Arial';
        ctx.fillText('Ready...', canvas.width / 2, canvas.height / 2);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '11px "Malgun Gothic", Arial';
    ctx.textAlign = 'left';
    ctx.fillText('1팀: A / D 이동  W 점프', 10, canvas.height - 12);
    ctx.textAlign = 'right';
    ctx.fillText('2팀: ← / → 이동  ↑ 점프', canvas.width - 10, canvas.height - 12);
    ctx.textAlign = 'center';
}

// 색상 밝게 (hex → lighten)
function lighten(hex, amount) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (n >> 16) + amount);
    const g = Math.min(255, ((n >> 8) & 0xff) + amount);
    const b = Math.min(255, (n & 0xff) + amount);
    return `rgb(${r},${g},${b})`;
}

function draw() {
    drawBackground();
    drawNet();
    drawHUD();
    drawPlayer(player1, 'player1');
    drawPlayer(player2, 'player2');
    drawBall();
    drawParticles();
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
