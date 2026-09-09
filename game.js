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

canvas.width = 800;
canvas.height = 400;

// iPhoneでは表示サイズだけ縮小（内部座標はそのまま）
function applyDisplaySize() {
    if (isiPhone) {
        canvas.style.width = "100vw";

        if (window.innerHeight > window.innerWidth) {
            canvas.style.height = "50vw";  // 縦向き
        } else {
            canvas.style.height = "50vw";  // 横向き（妥協点）
        }

    } else {
        canvas.style.width = "800px";
        canvas.style.height = "400px";
    }
}

applyDisplaySize();
window.addEventListener("resize", applyDisplaySize);

// ===============================
//  リズムゲーム用ノーツ
// ===============================

// ノーツの配列（仮の4つ）
let notes = [
    { lane: "left",  y: -50,  speed: 4 },
    { lane: "right", y: -150, speed: 4 },
    { lane: "left",  y: -300, speed: 4 },
    { lane: "right", y: -450, speed: 4 }
];

// レーンのX座標
const laneX = {
    left: 200,
    right: 600
};

// 判定ライン
const judgeLineY = 300;

// ===============================
//  更新処理（落下処理）
// ===============================
function update() {

    // ノーツ落下
    notes.forEach(note => {
        note.y += note.speed;

        // 画面外に出たら上に戻す（仮）
        if (note.y > canvas.height + 50) {
            note.y = -200;
        }
    });
}

// ===============================
//  描画処理
// ===============================
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 判定ライン
    ctx.beginPath();
    ctx.arc(400, judgeLineY, 30, 0, Math.PI * 2);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.stroke();

    // ノーツ描画
    notes.forEach(note => {
        ctx.beginPath();
        ctx.arc(laneX[note.lane], note.y, 25, 0, Math.PI * 2);
        ctx.fillStyle = (note.lane === "left") ? "cyan" : "red";
        ctx.fill();
    });
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
