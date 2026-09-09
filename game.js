/* ============================================================
   Rhythm de Ghost - BPM Auto Chart Version + Life Gauge
   難易度：Easy / Hard（旧 Normal の密度を Hard に）
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
        canvas.style.width = "80vw";
        canvas.style.height = "40vw";
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
   難易度設定（2種類）
   Hard = 旧 Normal の密度（0.5）
------------------------------ */
const difficultySettings = {
    easy:   1.0,
    hard:   0.5
};

/* ------------------------------
   曲データ
------------------------------ */
const songs = [
    {
        title: "Ghost Waltz",
        file: "music1.mp3",
        bpm: 152,
        length: 108
    },
    {
        title: "Haunted Beat",
        file: "music2.mp3",
        bpm: 77,
        length: 90
    }
];

/* ------------------------------
   ノーツ・ゲーム変数
------------------------------ */
let notes = [];
let gameTime = 0;
let score = 0;
let combo = 0;
let maxCombo = 0;

let life = 100;        // ★体力ゲージ
let gameOver = false;  // ★ゲームオーバー判定

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
   BPM → ノーツ自動生成（Easy / Hard）
============================================================ */
function generateChartFromBPM(bpm, songLength, difficulty) {
    const beatSec = 60 / bpm;
    const interval = beatSec * difficultySettings[difficulty];  
    const chart = [];

    let t = 0;
    while (t < songLength) {
        const lane = Math.random() < 0.5 ? "left" : "right";
        chart.push({ time: t, lane });
        t += interval;
    }
    return chart;
}

/* ============================================================
   判定処理（ライフ増減を含む）
============================================================ */
function handleInput(lane) {
    if (gameState !== "play") return;

    let bestNote = null;
    let bestDiff = Infinity;

    // 最も近いノーツを探す
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

    /* 判定判定 */
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

    /* 判定円の色を保存（判定文字の色に使う） */
    if (lane === "left") {
        lastJudgeColorLeft = judgeColors[judge];
        judgeFlashLeft = 10;
        judgeScaleLeft = 10;
        judgeWaveLeft = 10;
    } else {
        lastJudgeColorRight = judgeColors[judge];
        judgeFlashRight = 10;
        judgeScaleRight = 10;
        judgeWaveRight = 10;
    }

    /* 爆発エフェクト */
    noteBursts.push({
        x: laneX[lane],
        y: judgeLineY,
        timer: 10
    });

    /* ============================================================
       ★ ライフゲージ増減
    ============================================================ */
    if (judge === "Perfect!") {
        life += 2;
    } else if (judge === "Great!") {
        // ±0
    } else if (judge === "Good!") {
        life -= 10;
    } else if (judge === "Bad!") {
        life -= 20;
    } else if (judge === "Miss!") {
        life -= 30;
    }

    /* コンボ継続ボーナス（Perfect / Great のときのみ） */
    if (judge === "Perfect!" || judge === "Great!") {
        combo++;
        life += 1;  // コンボボーナス
        if (combo > maxCombo) maxCombo = combo;
    } else {
        combo = 0;
    }

    /* ライフ上限 */
    if (life > 100) life = 100;

/* ★ ライフが0以下ならゲームオーバー */
    if (life <= 0) {
        life = 0;
        gameOver = true;

        /* ★ 曲を止める（重要） */
        bgm.pause();
        bgm.currentTime = 0;

        gameState = "result";
    }

}
/* ============================================================
   入力処理（キーボード）
============================================================ */
document.addEventListener("keydown", e => {

    /* タイトル → 曲選択 */
    if (gameState === "title") {
        gameState = "selectSong";
        return;
    }

    /* 曲選択 */
    if (gameState === "selectSong") {
        if (e.code === "ArrowUp") selectSongCursor = Math.max(0, selectSongCursor - 1);
        if (e.code === "ArrowDown") selectSongCursor = Math.min(songs.length - 1, selectSongCursor + 1);

        if (e.code === "Enter" || e.code === "Space") {
            selectedSongIndex = selectSongCursor;
            gameState = "selectDifficulty";
        }
        return;
    }

    /* 難易度選択（Easy / Hard） */
    if (gameState === "selectDifficulty") {
        if (e.code === "ArrowUp") selectDifficultyCursor = Math.max(0, selectDifficultyCursor - 1);
        if (e.code === "ArrowDown") selectDifficultyCursor = Math.min(1, selectDifficultyCursor + 1);

        if (e.code === "Enter" || e.code === "Space") {
            const diff = ["easy", "hard"][selectDifficultyCursor];
            startGame(diff);
        }
        return;
    }

    /* プレイ中の判定入力 */
    if (gameState === "play") {
        if (e.code === "Space") handleInput("left");
        if (e.code === "Enter") handleInput("right");
    }

    /* リザルト → タイトルへ */
    if (gameState === "result") {

        /* ★ 判定色リセット */
        lastJudgeColorLeft = "white";
        lastJudgeColorRight = "white";

        /* ★ 判定文字リセット */
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

    /* ★ 判定円の色を白にリセット */
    lastJudgeColorLeft = "white";
    lastJudgeColorRight = "white";

    /* ★ 判定文字もリセット */
    lastJudgeText = "";
    lastJudgeTimer = 0;
    judgeTextScale = 0;

    gameState = "play";
}


/* ============================================================
   更新処理
============================================================ */
function update() {
    if (gameState === "play") {

        gameTime = bgm.currentTime;

        /* 曲終了 → リザルトへ */
        if (bgm.ended) {
            gameState = "result";
            return;
        }

        /* ノーツ落下処理 */
        notes.forEach(note => {

            /* 判定ラインに近づいたら active にする */
            if (!note.active && gameTime >= note.time - 1.0) {
                note.active = true;
                note.y = -50;
            }

            /* 落下 */
            if (note.active && !note.judged) {
                note.y += 4;

                /* 判定ラインを過ぎたら Miss 扱い */
                if (note.y > judgeLineY + 120) {
                    note.judged = true;

                        /* ★ MISS 判定文字を出す */
                        lastJudgeText = "Miss!";
                        lastJudgeTimer = 60;
                        lastJudgeLane = note.lane;  // 左右どちらのレーンでMISSしたか
                        judgeTextScale = 10;

                        /* ★ 判定円の色もMiss色にする */
                        if (note.lane === "left") {
                            lastJudgeColorLeft = judgeColors["Miss!"];
                            judgeFlashLeft = 10;
                            judgeScaleLeft = 10;
                            judgeWaveLeft = 10;
                        } else {
                            lastJudgeColorRight = judgeColors["Miss!"];
                            judgeFlashRight = 10;
                            judgeScaleRight = 10;
                            judgeWaveRight = 10;
                        }

                        /* ★ MISSダメージ */
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

    const diffNames = ["Easy", "Hard"];  // ★2種類に変更
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

/* ------------------------------
   プレイ画面
------------------------------ */
function drawPlay() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;

    // 左レーン線
    ctx.beginPath();
    ctx.moveTo(laneX.left, 0);
    ctx.lineTo(laneX.left, judgeLineY);
    ctx.stroke();

    // 右レーン線
    ctx.beginPath();
    ctx.moveTo(laneX.right, 0);
    ctx.lineTo(laneX.right, judgeLineY);
    ctx.stroke();

    // 判定円（左）
    drawJudgeCircle(
        laneX.left,
        judgeLineY,
        judgeFlashLeft,
        judgeScaleLeft,
        judgeWaveLeft,
        lastJudgeColorLeft
    );

    // 判定円（右）
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

    /* ★ライフゲージ */
    ctx.fillStyle = "white";
    ctx.font = "20px sans-serif";
    ctx.fillText(`LIFE`, 20, 150);

    ctx.fillStyle = "red";
    ctx.fillRect(20, 170, 200, 20);

    ctx.fillStyle = "lime";
    ctx.fillRect(20, 170, 200 * (life / 100), 20);

    /* ★判定文字（判定円と同じ色） */
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

/* ------------------------------
   リザルト画面（GAME OVER 対応）
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
   メインループ
============================================================ */
function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}
loop();
