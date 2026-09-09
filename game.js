/* ============================================================
   Rhythm de Ghost - BPM Auto Chart Version + Life Gauge
   ★長押しなし・安定版（勝手にMISSが出る問題修正）
   ★同時押しライン対応
============================================================ */

/* ------------------------------
   iPhone / iPad 対策
------------------------------ */
const isiPhone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
if (isiPhone) {
    document.body.style.overflow = "hidden";
}

/* ------------------------------
   Canvas 初期化
------------------------------ */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = 1200;
canvas.height = 600;

function applyDisplaySize() {
    if (isiPhone) {
        canvas.style.width = "100vw";
        canvas.style.height = "100vh";   // ★ 50vw → 100vh に変更
    } else {
        canvas.style.width = "1200px";
        canvas.style.height = "600px";
    }
}

applyDisplaySize();
window.addEventListener("resize", applyDisplaySize);

function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
}

/* ------------------------------
   音楽
------------------------------ */
const bgm = document.getElementById("bgm");

/* ------------------------------
   ゲーム状態
------------------------------ */
let gameState = "title"; 
let selectedSongIndex = null;
let selectSongCursor = 0;
let selectDifficultyCursor = 0;

/* ------------------------------
   ノーツ画像（左右別）
------------------------------ */
const ghostLeftImg = new Image();
ghostLeftImg.src = "ghost_left.png";

const ghostRightImg = new Image();
ghostRightImg.src = "ghost_right.png";

/* ------------------------------
   判定円位置
------------------------------ */
const laneX = { left: 400, right: 800 };
const judgeLineY = 500;

/* ------------------------------
   判定ウィンドウ
------------------------------ */
const judgeWindows = [
    { name: "Perfect!", limit: 20, score: 1000 },
    { name: "Great!",   limit: 45, score: 700 },
    { name: "Good!",    limit: 75, score: 400 },
    { name: "Bad!",     limit: 110, score: 100 },
];

/* ------------------------------
   判定色
------------------------------ */
const judgeColors = {
    "Perfect!": "#00ffea",
    "Great!":   "#00ff00",
    "Good!":    "#ffff00",
    "Bad!":     "#ff8800",
    "Miss!":    "#ff0000"
};

/* ------------------------------
   難易度設定
------------------------------ */
const difficultySettings = {
    easy:   1.0,
    hard:   0.5
};

/* ------------------------------
   曲データ
------------------------------ */
const songs = [
    { title: "Ghost Waltz", file: "music1.mp3", bpm: 152, length: 110 },
    { title: "Haunted Beat", file: "music2.mp3", bpm: 77, length: 90 }
];

/* ------------------------------
   ノーツ・ゲーム変数
------------------------------ */
let notes = [];
let gameTime = 0;
let score = 0;
let combo = 0;
let maxCombo = 0;

let life = 100;
let gameOver = false;

let lastJudgeText = "";
let lastJudgeTimer = 0;
let lastJudgeLane = "left";
let lastJudgeColorLeft = "white";
let lastJudgeColorRight = "white";

let judgeFlashLeft = 0;
let judgeFlashRight = 0;
let judgeScaleLeft = 0;
let judgeScaleRight = 0;
let judgeWaveLeft = 0;
let judgeWaveRight = 0;

let judgeTextScale = 0;

let noteBursts = [];

/* ============================================================
   BPM → ノーツ自動生成（同時押し・階段・2連打対応）
============================================================ */
function generateChartFromBPM(bpm, songLength, difficulty) {
    const beatSec = 60 / bpm;
    const interval = beatSec * difficultySettings[difficulty];
    const chart = [];

    let t = 0;
    while (t < songLength) {

        const r = Math.random();

        /* ★ 10%：同時押し */
        if (r < 0.10) {
            chart.push({ time: t, lane: "left" });
            chart.push({ time: t, lane: "right" });
        }

        /* ★ 10%：階段（左→右→左→右） */
        else if (r < 0.20) {
            chart.push({ time: t,       lane: "left" });
            chart.push({ time: t + 0.1, lane: "right" });
            chart.push({ time: t + 0.2, lane: "left" });
            chart.push({ time: t + 0.3, lane: "right" });
        }

        /* ★ 10%：2連打 */
        else if (r < 0.30) {
            const lane = Math.random() < 0.5 ? "left" : "right";
            chart.push({ time: t,       lane });
            chart.push({ time: t + 0.12, lane });
        }

        /* ★ 通常ノーツ */
        else {
            const lane = Math.random() < 0.5 ? "left" : "right";
            chart.push({ time: t, lane });
        }

        t += interval;
    }

    return chart;
}

/* ============================================================
   判定処理（ライフ増減）
============================================================ */
function handleInput(lane) {
    if (gameState !== "play") return;

    let bestNote = null;
    let bestDiff = Infinity;

    notes.forEach(note => {
        if (note.lane !== lane) return;
        if (!note.active) return;
        if (note.judged) return;

        const dx = laneX[lane] - laneX[note.lane];
        const dy = judgeLineY - note.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 60) return;

        if (distance < bestDiff) {
            bestDiff = distance;
            bestNote = note;
        }
    });

    if (!bestNote) return;

    let judge = "Miss!";
    let addScore = 0;

    for (const w of judgeWindows) {
        if (bestDiff <= w.limit) {
            judge = w.name;
            addScore = w.score;
            break;
        }
    }

    bestNote.judged = true;
    bestNote.y = judgeLineY + 200;

    score += addScore;
    lastJudgeText = judge;
    lastJudgeTimer = 60;
    lastJudgeLane = lane;
    judgeTextScale = 10;

    if (lane === "left") {
        lastJudgeColorLeft = judgeColors[judge];
        judgeFlashLeft = judgeScaleLeft = judgeWaveLeft = 10;
    } else {
        lastJudgeColorRight = judgeColors[judge];
        judgeFlashRight = judgeScaleRight = judgeWaveRight = 10;
    }

    noteBursts.push({ x: laneX[lane], y: judgeLineY, timer: 10 });

    if (judge === "Perfect!") life += 2;
    else if (judge === "Good!") life -= 10;
    else if (judge === "Bad!") life -= 20;
    else if (judge === "Miss!") life -= 30;

    if (judge === "Perfect!" || judge === "Great!") {
        combo++;
        life += 1;
        maxCombo = Math.max(maxCombo, combo);
    } else {
        combo = 0;
    }

    if (life > 100) life = 100;

    if (life <= 0) {
        life = 0;
        gameOver = true;
        bgm.pause();
        bgm.currentTime = 0;
        gameState = "result";
    }
}

/* ============================================================
   入力処理（キーボード）
============================================================ */
document.addEventListener("keydown", e => {

    if (gameState === "title") {
        gameState = "selectSong";
        return;
    }

    if (gameState === "selectSong") {
        if (e.code === "ArrowUp") selectSongCursor = Math.max(0, selectSongCursor - 1);
        if (e.code === "ArrowDown") selectSongCursor = Math.min(songs.length - 1, selectSongCursor + 1);

        if (e.code === "Enter" || e.code === "Space") {
            selectedSongIndex = selectSongCursor;
            gameState = "selectDifficulty";
        }
        return;
    }

    if (gameState === "selectDifficulty") {
        if (e.code === "ArrowUp") selectDifficultyCursor = Math.max(0, selectDifficultyCursor - 1);
        if (e.code === "ArrowDown") selectDifficultyCursor = Math.min(1, selectDifficultyCursor + 1);

        if (e.code === "Enter" || e.code === "Space") {
            const diff = ["easy", "hard"][selectDifficultyCursor];
            startGame(diff);
        }
        return;
    }

    if (gameState === "play") {
        if (e.code === "Space") handleInput("left");
        if (e.code === "Enter") handleInput("right");
    }

    if (gameState === "result") {
        lastJudgeColorLeft = "white";
        lastJudgeColorRight = "white";
        lastJudgeText = "";
        lastJudgeTimer = 0;
        judgeTextScale = 0;
        gameState = "title";
    }
});
/* ============================================================
   pointer入力（スマホ／PCクリック）
============================================================ */
canvas.addEventListener("pointerdown", e => {
    const pos = getPointerPos(e);

    /* タイトル → 曲選択 */
    if (gameState === "title") {
        gameState = "selectSong";
        return;
    }

    /* 曲選択 */
    if (gameState === "selectSong") {
        const index = Math.floor((pos.y - 220) / 60);
        if (index >= 0 && index < songs.length) {
            selectedSongIndex = index;
            gameState = "selectDifficulty";
        }
        return;
    }

    /* 難易度選択（Easy / Hard） */
    if (gameState === "selectDifficulty") {
        const index = Math.floor((pos.y - 220) / 60);
        if (index >= 0 && index < 2) {
            const diff = ["easy", "hard"][index];
            startGame(diff);
        }
        return;
    }

    /* プレイ中の判定入力（左右タップ） */
    if (gameState === "play") {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left);
        if (x < rect.width / 2) handleInput("left");
        else handleInput("right");
    }

    /* リザルト → タイトルへ */
    if (gameState === "result") {
        gameState = "title";
    }
});

/* ============================================================
   ゲーム開始（Easy / Hard）
============================================================ */
function startGame(difficulty) {
    const song = songs[selectedSongIndex];

    bgm.src = song.file;
    bgm.currentTime = 0;
    bgm.play();

    const chart = generateChartFromBPM(song.bpm, song.length, difficulty);

    notes = chart.map(c => ({
        lane: c.lane,
        time: c.time,
        y: -50,
        active: false,
        judged: false
    }));

    score = 0;
    combo = 0;
    maxCombo = 0;

    life = 60;
    gameOver = false;

    gameTime = 0;

    lastJudgeColorLeft = "white";
    lastJudgeColorRight = "white";

    lastJudgeText = "";
    lastJudgeTimer = 0;
    judgeTextScale = 0;

    gameState = "play";
}

/* ============================================================
   更新処理（★勝手にMISSが出る問題の修正含む）
============================================================ */
function update() {
    if (gameState !== "play") return;

    gameTime = bgm.currentTime;

    /* 曲終了 → リザルトへ */
    if (bgm.ended) {
        gameState = "result";
        return;
    }

    notes.forEach(note => {

        /* ★出現タイミングを 1.0秒 → 0.5秒前 に修正 */
        if (!note.active && gameTime >= note.time - 0.5) {
            note.active = true;
            note.y = -50;
        }

        if (note.active && !note.judged) {

            /* ★落下速度を 4px → 3px に修正 */
            note.y += 3;

            /* 判定ラインを過ぎたら Miss */
            if (note.y > judgeLineY + 120) {
                note.judged = true;

                lastJudgeText = "Miss!";
                lastJudgeTimer = 60;
                lastJudgeLane = note.lane;
                judgeTextScale = 10;

                /* ★ 左判定円が消える問題の修正：Missでも白に戻す */
                if (note.lane === "left") {
                    lastJudgeColorLeft = "white";
                    judgeFlashLeft = judgeScaleLeft = judgeWaveLeft = 10;
                } else {
                    lastJudgeColorRight = "white";
                    judgeFlashRight = judgeScaleRight = judgeWaveRight = 10;
                }

                life -= 15;

                if (life <= 0) {
                    life = 0;
                    gameOver = true;

                    bgm.pause();
                    bgm.currentTime = 0;

                    gameState = "result";
                }
            }
        }
    });

    /* 判定エフェクトの減衰 */
    if (lastJudgeTimer > 0) lastJudgeTimer--;

    judgeFlashLeft = Math.max(0, judgeFlashLeft - 1);
    judgeFlashRight = Math.max(0, judgeFlashRight - 1);
    judgeScaleLeft = Math.max(0, judgeScaleLeft - 1);
    judgeScaleRight = Math.max(0, judgeScaleRight - 1);
    judgeWaveLeft = Math.max(0, judgeWaveLeft - 1);
    judgeWaveRight = Math.max(0, judgeWaveRight - 1);

    /* 爆発エフェクト */
    noteBursts.forEach(b => b.timer--);
    noteBursts = noteBursts.filter(b => b.timer > 0);

    /* 判定文字の縮小 */
    judgeTextScale = Math.max(0, judgeTextScale - 1);
}

/* ============================================================
   描画処理
============================================================ */
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameState === "title") return drawTitle();
    if (gameState === "selectSong") return drawSongSelect();
    if (gameState === "selectDifficulty") return drawDifficultySelect();
    if (gameState === "play") return drawPlay();
    if (gameState === "result") return drawResult();
}

/* ------------------------------
   タイトル画面
------------------------------ */
function drawTitle() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "white";
    ctx.font = "64px sans-serif";
    ctx.fillText("Rhythm de Ghost", canvas.width/2 - 260, 220);

    ctx.font = "32px sans-serif";
    ctx.fillText("Tap / Press Space to Start", canvas.width/2 - 220, 320);
}

/* ------------------------------
   曲選択画面
------------------------------ */
function drawSongSelect() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "white";
    ctx.font = "48px sans-serif";
    ctx.fillText("Select Music", canvas.width/2 - 150, 120);

    ctx.font = "32px sans-serif";

    songs.forEach((song, i) => {
        ctx.fillStyle = (i === selectSongCursor) ? "yellow" : "white";
        ctx.fillText(`${i+1}. ${song.title}`, canvas.width/2 - 150, 220 + i*60);
    });
}

/* ------------------------------
   難易度選択（Easy / Hard）
------------------------------ */
function drawDifficultySelect() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "white";
    ctx.font = "48px sans-serif";
    ctx.fillText("Select Difficulty", canvas.width/2 - 180, 120);

    const diffNames = ["Easy", "Hard"];
    ctx.font = "32px sans-serif";

    diffNames.forEach((name, i) => {
        ctx.fillStyle = (i === selectDifficultyCursor) ? "yellow" : "white";
        ctx.fillText(`${i+1}. ${name}`, canvas.width/2 - 150, 220 + i*60);
    });
}
/* ============================================================
   判定円描画（光・拡大・波紋・色）
============================================================ */
function drawJudgeCircle(x, y, flash, scale, wave, color) {
    const baseRadius = 35;
    const radius = baseRadius + scale;

    const grad = ctx.createRadialGradient(x, y, 5, x, y, radius + 40);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(255,255,255,0)");

    if (flash > 0) {
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, radius + 20, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    if (wave > 0) {
        const waveRadius = radius + (10 - wave) * 4;
        ctx.beginPath();
        ctx.arc(x, y, waveRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${wave / 10})`;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

/* ============================================================
   プレイ画面
============================================================ */
function drawPlay() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;

    /* 左レーン線 */
    ctx.beginPath();
    ctx.moveTo(laneX.left, 0);
    ctx.lineTo(laneX.left, judgeLineY);
    ctx.stroke();

    /* 右レーン線 */
    ctx.beginPath();
    ctx.moveTo(laneX.right, 0);
    ctx.lineTo(laneX.right, judgeLineY);
    ctx.stroke();

    /* 判定円（左） */
    drawJudgeCircle(
        laneX.left,
        judgeLineY,
        judgeFlashLeft,
        judgeScaleLeft,
        judgeWaveLeft,
        lastJudgeColorLeft
    );

    /* 判定円（右） */
    drawJudgeCircle(
        laneX.right,
        judgeLineY,
        judgeFlashRight,
        judgeScaleRight,
        judgeWaveRight,
        lastJudgeColorRight
    );

    /* ノーツ描画 */
    notes.forEach(note => {
        if (!note.active) return;
        if (note.judged && note.y > judgeLineY + 120) return;

        const size = 60;
        const img = (note.lane === "left") ? ghostLeftImg : ghostRightImg;

        ctx.drawImage(
            img,
            laneX[note.lane] - size/2,
            note.y - size/2,
            size,
            size
        );
    });

    /* ★ 同時押しノーツを光るラインで結ぶ */
for (let i = 0; i < notes.length; i++) {
    const n1 = notes[i];
    if (!n1.active || n1.judged) continue;

    for (let j = i + 1; j < notes.length; j++) {
        const n2 = notes[j];
        if (!n2.active || n2.judged) continue;

        // ★ 同時押し判定：time が同じ & 左右
        if (n1.time === n2.time && n1.lane !== n2.lane) {

            const x1 = laneX[n1.lane];
            const y1 = n1.y;
            const x2 = laneX[n2.lane];
            const y2 = n2.y;

            /* ★ 発光グラデーション */
            const grad = ctx.createLinearGradient(x1, y1, x2, y2);
            grad.addColorStop(0, "rgba(255,255,255,0.9)");
            grad.addColorStop(0.5, "rgba(0,200,255,1.0)");   // 中央を光らせる
            grad.addColorStop(1, "rgba(255,255,255,0.9)");

            /* ★ 外側の光（ぼかし） */
            ctx.strokeStyle = grad;
            ctx.lineWidth = 10;  // 光の太さ
            ctx.globalAlpha = 0.4;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            /* ★ 内側の本線（シャープな線） */
            ctx.strokeStyle = "rgba(255,255,255,1.0)";
            ctx.lineWidth = 4;
            ctx.globalAlpha = 1.0;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
    }
}


    /* 爆発エフェクト */
    noteBursts.forEach(b => {
        const r = (10 - b.timer) * 4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${b.timer / 10})`;
        ctx.lineWidth = 3;
        ctx.stroke();
    });

    /* スコア */
    ctx.fillStyle = "white";
    ctx.font = "24px sans-serif";
    ctx.fillText(`Score: ${score}`, 20, 40);

    /* コンボ */
    ctx.fillStyle = "white";
    ctx.font = "24px sans-serif";
    ctx.fillText(`Combo: ${combo}`, 20, 80);

    /* ライフゲージ */
    ctx.fillStyle = "white";
    ctx.font = "20px sans-serif";
    ctx.fillText(`LIFE`, 20, 150);

    ctx.fillStyle = "red";
    ctx.fillRect(20, 170, 200, 20);

    ctx.fillStyle = "lime";
    ctx.fillRect(20, 170, 200 * (life / 100), 20);

    /* 判定文字 */
    if (lastJudgeTimer > 0) {
        const scale = 1 + judgeTextScale * 0.1;

        ctx.save();
        ctx.translate(laneX[lastJudgeLane], judgeLineY + 80);
        ctx.scale(scale, scale);

        const color = (lastJudgeLane === "left")
            ? lastJudgeColorLeft
            : lastJudgeColorRight;

        ctx.fillStyle = color;
        ctx.font = "32px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(lastJudgeText, 0, 0);

        ctx.restore();
    }

    /* 時間表示 */
    ctx.fillStyle = "gray";
    ctx.font = "16px sans-serif";
    ctx.fillText(`Time: ${gameTime.toFixed(2)}s`, 20, 110);
}

/* ============================================================
   リザルト画面
============================================================ */
function drawResult() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = gameOver ? "red" : "white";
    ctx.font = "64px sans-serif";
    ctx.fillText(
        gameOver ? "GAME OVER" : "RESULT",
        canvas.width/2 - 200,
        150
    );

    ctx.font = "32px sans-serif";
    ctx.fillStyle = "white";
    ctx.fillText(`Score: ${score}`, canvas.width/2 - 150, 260);
    ctx.fillText(`Max Combo: ${maxCombo}`, canvas.width/2 - 150, 320);

    ctx.fillText(
        "Tap / Press Space to return to Title",
        canvas.width/2 - 300,
        420
    );
}

/* ============================================================
   メインループ
============================================================ */
function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}
loop();
