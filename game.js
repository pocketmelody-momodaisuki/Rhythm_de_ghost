// ===============================
//  iPhone判定（Safari専用対策）
// ===============================
const isiPhone = /iPhone|iPad|iPod/i.test(navigator.userAgent);

// iPhoneだけスクロール禁止
if (isiPhone) {
document.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
document.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
document.body.style.overflow = "hidden";
}

// ===============================
//  Canvas 初期化（内部座標は固定）
// ===============================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// 内部座標は固定（800×400）
canvas.width = 800;
canvas.height = 400;

// iPhoneでは表示サイズだけ縮小（内部座標はそのまま）
function applyDisplaySize() {
if (isiPhone) {
canvas.style.width = "100vw";

// iPhoneの向きを判定
if (window.innerHeight > window.innerWidth) {
// ★ 縦向き（今まで通り）
canvas.style.height = "50vw";
} else {
// ★ 横向き（高さを増やす）
            canvas.style.height = "100vw";
            canvas.style.height = "50vw";
}

} else {
canvas.style.width = "800px";
canvas.style.height = "400px";
}
}

applyDisplaySize();
window.addEventListener("resize", applyDisplaySize);

// ===============================
//  ゲーム画像
// ===============================
let ghost1 = new Image();
ghost1.src = "ghost_walk1.png";
let ghost2 = new Image();
ghost2.src = "ghost_walk2.png";

let blockImg = new Image();
blockImg.src = "block.png";

let targetImg = new Image();
targetImg.src = "target.png";

// ===============================
//  効果音
// ===============================
let stretchSound = new Audio("stretch.wav");
let hitBlockSound = new Audio("hit_block.wav");
let hitTargetSound = new Audio("hit_target.wav");
let hitGroundSound = new Audio("hit_ground.wav");
let launchSound = new Audio("launch.wav");
let clearSound = new Audio("clear.wav");
let gameoverSound = new Audio("gameover.wav");

// ===============================
//  ゲーム状態
// ===============================
let ghost = {
x: 100,
y: 200,   // ★ PCでさらに引っ張りやすいように上げた（250→200）
vx: 0,
vy: 0,
radius: 25,
dragging: false,
waiting: true,
frozen: false
};

let lives = 3;
let cleared = false;
let wasOnGround = false;

let tryText = "";
let tryTextTimer = 0;

const gravity = 0.4;
const bounce = 0.6;

const slingX = 100;
const slingY = 200;

let target = { x: 700, y: 350, radius: 30 };

// ===============================
//  障害物（3段）
// ===============================
let blocks = [
{ x: 500, y: 300, w: 60, h: 60, alive: true },
{ x: 560, y: 300, w: 60, h: 60, alive: true },
{ x: 620, y: 300, w: 60, h: 60, alive: true },
{ x: 530, y: 240, w: 60, h: 60, alive: true },
{ x: 590, y: 240, w: 60, h: 60, alive: true },
{ x: 560, y: 180, w: 60, h: 60, alive: true }
];

// ===============================
//  Try 表示
// ===============================
function showTryText() {
if (lives === 3) tryText = "1st Try";
else if (lives === 2) tryText = "2nd Try";
else if (lives === 1) tryText = "Last Try";

tryTextTimer = 60;
}

// ===============================
//  pointer イベント（iPhoneだけ座標変換）
// ===============================
function getPointerPos(e) {
let rect = canvas.getBoundingClientRect();
return {
x: (e.clientX - rect.left) * (canvas.width / rect.width),
y: (e.clientY - rect.top) * (canvas.height / rect.height)
};
}

canvas.addEventListener("pointerdown", (e) => {
if (isiPhone) e.preventDefault();

if (ghost.frozen) return;

let pos = getPointerPos(e);

let dx = pos.x - ghost.x;
let dy = pos.y - ghost.y;

if (dx * dx + dy * dy < ghost.radius * ghost.radius) {
ghost.dragging = true;
ghost.waiting = false;
stretchSound.currentTime = 0;
stretchSound.play();
}
}, { passive: false });

canvas.addEventListener("pointermove", (e) => {
if (isiPhone) e.preventDefault();

if (ghost.dragging && !ghost.frozen) {
let pos = getPointerPos(e);
ghost.x = pos.x;
ghost.y = pos.y;
}
}, { passive: false });

canvas.addEventListener("pointerup", (e) => {
if (isiPhone) e.preventDefault();

if (ghost.dragging && !ghost.frozen) {
ghost.dragging = false;

ghost.vx = (slingX - ghost.x) * 0.15;
ghost.vy = (slingY - ghost.y) * 0.15;

stretchSound.pause();
launchSound.play();
}
}, { passive: false });

// ===============================
//  ゲーム更新
// ===============================
let ghostFrame = 0;
let ghostAnimTimer = 0;

function update() {

if (ghost.frozen) return;

// 重力（引っ張り中は無効）
if (!ghost.dragging && !ghost.waiting) {
ghost.vy += gravity;
ghost.x += ghost.vx;
ghost.y += ghost.vy;
}

// 壁判定（★音を鳴らさないように修正）
if (ghost.x < ghost.radius) {
ghost.x = ghost.radius;
ghost.vx *= -bounce;
}
if (ghost.x > canvas.width - ghost.radius) {
ghost.x = canvas.width - ghost.radius;
ghost.vx *= -bounce;
}
if (ghost.y < ghost.radius) {
ghost.y = ghost.radius;
ghost.vy *= -bounce;
}

// 地面落下判定
if (!ghost.waiting && !ghost.dragging) {
let onGround = ghost.y >= canvas.height - ghost.radius;

if (onGround) {
ghost.y = canvas.height - ghost.radius;

if (!wasOnGround) {
hitGroundSound.currentTime = 0;
hitGroundSound.play();
reset();
}
}
wasOnGround = onGround;
}

// アニメーション
ghostAnimTimer++;
if (ghostAnimTimer % 10 === 0) {
ghostFrame = (ghostFrame + 1) % 2;
}

if (tryTextTimer > 0) tryTextTimer--;

// ★ 引っ張り中は障害物判定を無効化
if (!ghost.dragging && !ghost.waiting && !ghost.frozen) {
blocks.forEach(block => {
if (!block.alive) return;

let hit =
ghost.x + ghost.radius > block.x &&
ghost.x - ghost.radius < block.x + block.w &&
ghost.y + ghost.radius > block.y &&
ghost.y - ghost.radius < block.y + block.h;

if (!hit) return;

block.alive = false;
hitBlockSound.play();

ghost.vx *= -0.5;
ghost.vy = -2;
});
}

// ★ クリア判定
let dx = ghost.x - target.x;
let dy = ghost.y - target.y;

if (!cleared && dx * dx + dy * dy < (ghost.radius + target.radius) ** 2) {

cleared = true;
ghost.frozen = true;
ghost.vx = 0;
ghost.vy = 0;

clearSound.currentTime = 0;
clearSound.play();

setTimeout(() => {
alert("クリア！");
fullReset();
}, 600);
}
}

// ===============================
//  リセット処理
// ===============================
function fullReset() {
lives = 3;

ghost.x = slingX;
ghost.y = slingY;
ghost.vx = 0;
ghost.vy = 0;
ghost.waiting = true;
ghost.frozen = false;

blocks.forEach(b => b.alive = true);

cleared = false;

showTryText();
}

function reset() {
lives--;

if (lives <= 0) {

ghost.frozen = true;

gameoverSound.currentTime = 0;
gameoverSound.play();

setTimeout(() => {
alert("ゲームオーバー！");
fullReset();
}, 600);

return;
}

ghost.x = slingX;
ghost.y = slingY;
ghost.vx = 0;
ghost.vy = 0;
ghost.waiting = true;

showTryText();
}

// ===============================
//  描画
// ===============================
function draw() {
ctx.clearRect(0, 0, canvas.width, canvas.height);

if (tryTextTimer > 0) {
ctx.fillStyle = "yellow";
ctx.font = "30px sans-serif";
ctx.fillText(tryText, 20, 70);
}

ctx.fillStyle = "white";
ctx.font = "20px sans-serif";
ctx.fillText("Ghost: " + lives, 20, 30);

if (ghost.dragging) {
ctx.strokeStyle = "yellow";
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(slingX, slingY);
ctx.lineTo(ghost.x, ghost.y);
ctx.stroke();
}

blocks.forEach(block => {
if (block.alive) {
ctx.drawImage(blockImg, block.x, block.y, block.w, block.h);
}
});

let img = ghostFrame === 0 ? ghost1 : ghost2;
ctx.drawImage(img, ghost.x - ghost.radius, ghost.y - ghost.radius, ghost.radius * 2, ghost.radius * 2);

ctx.drawImage(
targetImg,
target.x - target.radius,
target.y - target.radius,
target.radius * 2,
target.radius * 2
);
}

// ===============================
//  メインループ
// ===============================
function loop() {
update();
draw();
requestAnimationFrame(loop);
}

loop();