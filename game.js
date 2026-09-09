/* ============================================================
   Rhythm de Ghost - Long Note Full Version (2026/09/09)
============================================================ */

/* ------------------------------
   iPhone / iPad 対策
------------------------------ */
const isiPhone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
if (isiPhone) {
    document.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
    document.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
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

        const isPortrait = window.innerHeight > window.innerWidth;

        if (isPortrait) {
            /* ★縦向き：vh を使う（vw は小さすぎる） */
            canvas.style.width  = "95vw";   // 画面いっぱい
            canvas.style.height = "70vh";   // 高さを大きく
        } else {
            /* ★横向き：もっと大きくしてOK */
            canvas.style.width  = "95vw";   // ほぼ全幅
            canvas.style.height = "55vw";   // 今より大きい
        }

    } else {
        /* PC */
        canvas.style.width = "1200px";
        canvas.style.height = "600px";
    }
}

applyDisplaySize();
window.addEventListener("resize", applyDisplaySize);

/* ------------------------------
   音楽
------------------------------ */
const bgm = document.getElementById("bgm");

/* ------------------------------
   ゲーム状態
------------------------------ */
let gameState = "title";
let selectedSongIndex = 0;
let selectSongCursor = 0;
let selectDifficultyCursor = 0;

/* ------------------------------
   ノーツ画像
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
    easy: 1.0,
    hard: 0.5
};

/* ------------------------------
   曲データ
------------------------------ */
const songs = [
    { title: "Ghost Waltz", file: "music1.mp3", bpm: 152, length: 108 },
    { title: "Haunted Beat", file: "music2.mp3", bpm: 77, length: 90 }
];

/* ------------------------------
   ゲーム変数
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
   BPM → ノーツ自動生成（long ノーツ含む）
============================================================ */
function generateChartFromBPM(bpm, songLength, difficulty) {
    const beatSec = 60 / bpm;
    const interval = beatSec * difficultySettings[difficulty];
    const chart = [];

    let t = 0;
    let holdUntil = -1;   // ★長押し中の時間を記録（この間はノーツ禁止）

    while (t < songLength) {

        // ★長押し中は単ノーツを生成しない
        if (t < holdUntil) {
            t += interval;
            continue;
        }

        const r = Math.random();

        /* ------------------------------------------------------------
           ★長押しは「たまにしか来ない」ように確率を下げる
           r < 0.10 → 10% の確率で長押し
        ------------------------------------------------------------ */
        if (r < 0.10) {
            const lane = Math.random() < 0.5 ? "left" : "right";
            const holdLen = beatSec * 2;   // 2拍ぶんの長押し

            chart.push({
                type: "long",
                lane,
                start: t,
                end: t + holdLen
            });

            holdUntil = t + holdLen;   // ★この時間までは単ノーツ禁止
        }

        /* ------------------------------------------------------------
           ★長押し中でなければ通常ノーツを生成
        ------------------------------------------------------------ */
        else {
            const lane = Math.random() < 0.5 ? "left" : "right";
            chart.push({
                type: "tap",
                lane,
                time: t
            });
        }

        t += interval;
    }

    return chart;
}

/* ============================================================
   long ノーツを 3 つに分解
============================================================ */
function convertChartToNotes(chart) {
    notes = [];

    chart.forEach(c => {

        if (c.type === "tap") {
            notes.push({
                type: "tap",
                lane: c.lane,
                time: c.time,
                y: -50,
                active: false,
                judged: false
            });
        }

        if (c.type === "long") {

            notes.push({
                type: "longStart",
                lane: c.lane,
                time: c.start,
                y: -50,
                active: false,
                judged: false
            });

            notes.push({
                type: "longBar",
                lane: c.lane,
                start: c.start,
                end: c.end,
                y: -50,
                active: false
            });

            notes.push({
                type: "longEnd",
                lane: c.lane,
                time: c.end,
                y: -50,
                active: false,
                judged: false
            });
        }
    });
}

/* ============================================================
   判定処理（longStart / tap）
============================================================ */
function handleInput(lane) {
    if (gameState !== "play") return;

    let target = notes.find(n =>
        (n.type === "tap" || n.type === "longStart") &&
        n.lane === lane &&
        n.active &&
        !n.judged &&
        Math.abs(n.y - judgeLineY) < 120
    );

    if (!target) return;

    const diff = Math.abs(target.y - judgeLineY);

    let judge = "Miss!";
    let addScore = 0;

    for (const w of judgeWindows) {
        if (diff <= w.limit) {
            judge = w.name;
            addScore = w.score;
            break;
        }
    }

    target.judged = true;
    target.y = judgeLineY + 200;

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
   keyup → longEnd 判定
============================================================ */
document.addEventListener("keyup", e => {

    if (gameState !== "play") return;

    let lane = null;
    if (e.code === "Space") lane = "left";
    if (e.code === "Enter") lane = "right";
    if (!lane) return;

    /* ------------------------------------------------------------
       ★ longEnd 判定（巻き込み防止版）
    ------------------------------------------------------------ */
    let endNotes = notes.filter(n =>
        n.type === "longEnd" &&
        n.lane === lane &&
        n.active &&
        !n.judged
    );

    if (endNotes.length === 0) return;

    // ★最も近い longEnd を選ぶ（tap を巻き込まない）
    let bestNote = null;
    let bestDiff = Infinity;

    endNotes.forEach(n => {
        const diff = Math.abs(n.y - judgeLineY);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestNote = n;
        }
    });

    // ★判定範囲を狭める（巻き込み防止）
    if (bestDiff > 60) return;

    /* 判定処理 */
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
});


/* ============================================================
   キー入力（画面遷移）
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
        return;
    }

    if (gameState === "result") {
        lastJudgeColorLeft = "white";
        lastJudgeColorRight = "white";
        lastJudgeText = "";
        lastJudgeTimer = 0;
        judgeTextScale = 0;
        gameState = "title";
        return;
    }
});

/* ============================================================
   pointer入力
============================================================ */
canvas.addEventListener("pointerdown", e => {
    const pos = getPointerPos(e);

    if (gameState === "title") {
        gameState = "selectSong";
        return;
    }

    if (gameState === "selectSong") {
        const index = Math.floor((pos.y - 220) / 60);
        if (index >= 0 && index < songs.length) {
            selectedSongIndex = index;
            gameState = "selectDifficulty";
        }
        return;
    }

    if (gameState === "selectDifficulty") {
        const index = Math.floor((pos.y - 220) / 60);
        if (index >= 0 && index < 2) {
            const diff = ["easy", "hard"][index];
            startGame(diff);
        }
        return;
    }

    if (gameState === "play") {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left);
        if (x < rect.width / 2) handleInput("left");
        else handleInput("right");
        return;
    }

    if (gameState === "result") {
        gameState = "title";
        return;
    }
});

/* ============================================================
   ゲーム開始
============================================================ */
function startGame(difficulty) {
    const song = songs[selectedSongIndex];

    bgm.src = song.file;
    bgm.currentTime = 0;
    bgm.play();

    const chart = generateChartFromBPM(song.bpm, song.length, difficulty);
    convertChartToNotes(chart);

    score = 0;
    combo = 0;
    maxCombo = 0;

    life = 100;
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
   更新処理
============================================================ */
function update() {
    if (gameState !== "play") return;

    gameTime = bgm.currentTime;

    if (bgm.ended) {
        gameState = "result";
        return;
    }

    notes.forEach(note => {

        /* ★active 化（longBar の start / end も対応） */
        if (!note.active) {
            if (note.time !== undefined && gameTime >= note.time - 1.0) {
                note.active = true;
                note.y = -50;
            }
            if (note.start !== undefined && gameTime >= note.start - 1.0) {
                note.active = true;
                note.y = -50;
            }
            if (note.end !== undefined && gameTime >= note.end - 1.0) {
                note.active = true;
                note.y = -50;
            }
        }

        if (note.active) {
            note.y += 4;
        }

        if (!note.judged && note.type !== "longBar" && note.y > judgeLineY + 120) {

            note.judged = true;

            lastJudgeText = "Miss!";
            lastJudgeTimer = 60;
            lastJudgeLane = note.lane;
            judgeTextScale = 10;

            if (note.lane === "left") {
                lastJudgeColorLeft = judgeColors["Miss!"];
                judgeFlashLeft = judgeScaleLeft = judgeWaveLeft = 10;
            } else {
                lastJudgeColorRight = judgeColors["Miss!"];
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
    });

    if (lastJudgeTimer > 0) lastJudgeTimer--;

    judgeFlashLeft = Math.max(0, judgeFlashLeft - 1);
    judgeFlashRight = Math.max(0, judgeFlashRight - 1);
    judgeScaleLeft = Math.max(0, judgeScaleLeft - 1);
    judgeScaleRight = Math.max(0, judgeScaleRight - 1);
    judgeWaveLeft = Math.max(0, judgeWaveLeft - 1);
    judgeWaveRight = Math.max(0, judgeWaveRight - 1);

    noteBursts.forEach(b => b.timer--);
    noteBursts = noteBursts.filter(b => b.timer > 0);

    judgeTextScale = Math.max(0, judgeTextScale - 1);
    /* ------------------------------------------------------------
   ★ longBar 中の押しっぱなし判定
------------------------------------------------------------ */
notes.forEach(note => {

    if (note.type === "longBar" && note.active && !note.judged) {

        // longStart を探す
        const startNote = notes.find(n =>
            n.type === "longStart" &&
            n.lane === note.lane &&
            n.start === note.start
        );

        // longEnd を探す
        const endNote = notes.find(n =>
            n.type === "longEnd" &&
            n.lane === note.lane &&
            n.end === note.end
        );

        if (!startNote || !endNote) return;

        // longBar が判定円付近に来たら押しっぱなし判定
        const diff = Math.abs(note.y - judgeLineY);

        if (diff < 40) {  // ← 判定範囲は狭くする（巻き込み防止）

            const isPressed =
                (note.lane === "left"  && leftPressed) ||
                (note.lane === "right" && rightPressed);

            if (!isPressed) {
                // 押していない → Bad
                lastJudgeText = "Bad!";
                lastJudgeTimer = 60;
                lastJudgeLane = note.lane;
                judgeTextScale = 10;

                if (note.lane === "left") {
                    lastJudgeColorLeft = judgeColors["Bad!"];
                    judgeFlashLeft = judgeScaleLeft = judgeWaveLeft = 10;
                } else {
                    lastJudgeColorRight = judgeColors["Bad!"];
                    judgeFlashRight = judgeScaleRight = judgeWaveRight = 10;
                }

                life -= 20;
                if (life <= 0) {
                    life = 0;
                    gameOver = true;
                    bgm.pause();
                    bgm.currentTime = 0;
                    gameState = "result";
                }
            }

            // longBar は判定済みにしない（通過中ずっとチェックする）
        }
    }
});

}

/* ============================================================
   描画処理（return を使わない）
============================================================ */
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameState === "title") {
        drawTitle();
    } else if (gameState === "selectSong") {
        drawSongSelect();
    } else if (gameState === "selectDifficulty") {
        drawDifficultySelect();
    } else if (gameState === "play") {
        drawPlay();
    } else if (gameState === "result") {
        drawResult();
    }
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
   難易度選択画面
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
   判定円描画
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
   長押し棒描画
============================================================ */
function drawLongBar(note) {

    // longStart を探す
    const startNote = notes.find(n =>
        n.type === "longStart" &&
        n.lane === note.lane &&
        n.time === note.start
    );

    // longEnd を探す
    const endNote = notes.find(n =>
        n.type === "longEnd" &&
        n.lane === note.lane &&
        n.time === note.end
    );

    if (!startNote || !endNote) return;

    const startY = startNote.y;
    const endY = endNote.y;

    const grad = ctx.createLinearGradient(
        laneX[note.lane], startY,
        laneX[note.lane], endY
    );

    grad.addColorStop(0.00, "rgba(0,255,255,0.8)");
    grad.addColorStop(0.50, "rgba(0,180,255,0.6)");
    grad.addColorStop(1.00, "rgba(0,120,255,0.4)");

    ctx.strokeStyle = grad;
    ctx.lineWidth = 14;

    ctx.beginPath();
    ctx.moveTo(laneX[note.lane], startY);
    ctx.lineTo(laneX[note.lane], endY);
    ctx.stroke();
}


/* ------------------------------
   プレイ画面
------------------------------ */
function drawPlay() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(laneX.left, 0);
    ctx.lineTo(laneX.left, judgeLineY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(laneX.right, 0);
    ctx.lineTo(laneX.right, judgeLineY);
    ctx.stroke();

    drawJudgeCircle(
        laneX.left,
        judgeLineY,
        judgeFlashLeft,
        judgeScaleLeft,
        judgeWaveLeft,
        lastJudgeColorLeft
    );

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

        if (note.type === "longBar") {
            drawLongBar(note);
            return;
        }

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

    /* 爆発エフェクト */
    noteBursts.forEach(b => {
        const r = (10 - b.timer) * 4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${b.timer / 10})`;
        ctx.lineWidth = 3;
        ctx.stroke();
    });

    ctx.fillStyle = "white";
    ctx.font = "24px sans-serif";
    ctx.fillText(`Score: ${score}`, 20, 40);

    ctx.fillText(`Combo: ${combo}`, 20, 80);

    ctx.fillStyle = "white";
    ctx.font = "20px sans-serif";
    ctx.fillText(`LIFE`, 20, 150);

    ctx.fillStyle = "red";
    ctx.fillRect(20, 170, 200, 20);

    ctx.fillStyle = "lime";
    ctx.fillRect(20, 170, 200 * (life / 100), 20);

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

    ctx.fillStyle = "gray";
    ctx.font = "16px sans-serif";
    ctx.fillText(`Time: ${gameTime.toFixed(2)}s`, 20, 110);
}

/* ------------------------------
   リザルト画面
------------------------------ */
function drawResult() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = gameOver ? "red" : "white";
    ctx.font = "64px sans-serif";
    ctx.fillText(gameOver ? "GAME OVER" : "RESULT", canvas.width/2 - 200, 150);

    ctx.font = "32px sans-serif";
    ctx.fillStyle = "white";
    ctx.fillText(`Score: ${score}`, canvas.width/2 - 150, 260);
    ctx.fillText(`Max Combo: ${maxCombo}`, canvas.width/2 - 150, 320);

    ctx.fillText("Tap / Press Space to return to Title", canvas.width/2 - 300, 420);
}

/* ============================================================
   メインループ（画面遷移バグ修正済）
============================================================ */
function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}
loop();
