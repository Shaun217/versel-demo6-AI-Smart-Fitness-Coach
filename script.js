let net;
const video = document.getElementById('video');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const countEl = document.getElementById('count');
const stateBadge = document.getElementById('state-badge');
const feedbackEl = document.getElementById('feedback');
const startBtn = document.getElementById('startBtn');
const loadingEl = document.getElementById('loading');

// 状态变量
let isRunning = false;
let squatCount = 0;
let currentStage = "UP"; // UP (站立) 或 DOWN (下蹲)
let lastFeedbackTime = 0;

// 语音合成
const synth = window.speechSynthesis;

// 1. 初始化摄像头
async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false
    });
    video.srcObject = stream;
    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            video.width = video.videoWidth;
            video.height = video.videoHeight;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            resolve(video);
        };
    });
}

// 2. 核心数学：计算三个点之间的夹角
function calculateAngle(a, b, c) {
    // a=髋, b=膝, c=踝
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    
    if (angle > 180.0) {
        angle = 360 - angle;
    }
    return angle;
}

// 3. 语音播报
function speak(text) {
    if (!document.getElementById('voiceToggle').checked) return;
    // 防止说话太频繁
    const now = Date.now();
    if (now - lastFeedbackTime < 1500) return; 
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.2;
    synth.speak(utterance);
    lastFeedbackTime = now;
}

// 4. 姿态分析循环
async function poseDetectionFrame() {
    if (!isRunning) return;

    const pose = await net.estimateSinglePose(video, {
        flipHorizontal: true
    });

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (pose.score > 0.5) {
        drawSkeleton(pose.keypoints);
        analyzeSquat(pose.keypoints);
    }

    ctx.restore();
    requestAnimationFrame(poseDetectionFrame);
}

// 5. 绘制骨骼
function drawSkeleton(keypoints) {
    // 简化的绘制，只画腿部
    const leftHip = keypoints.find(k => k.part === 'leftHip');
    const leftKnee = keypoints.find(k => k.part === 'leftKnee');
    const leftAnkle = keypoints.find(k => k.part === 'leftAnkle');

    if (leftHip.score > 0.5 && leftKnee.score > 0.5 && leftAnkle.score > 0.5) {
        ctx.beginPath();
        ctx.moveTo(leftHip.position.x, leftHip.position.y);
        ctx.lineTo(leftKnee.position.x, leftKnee.position.y);
        ctx.lineTo(leftAnkle.position.x, leftAnkle.position.y);
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#00ff00';
        ctx.stroke();

        // 画关节圆点
        [leftHip, leftKnee, leftAnkle].forEach(p => {
            ctx.beginPath();
            ctx.arc(p.position.x, p.position.y, 8, 0, 2*Math.PI);
            ctx.fillStyle = 'red';
            ctx.fill();
        });
    }
}

// 6. 核心逻辑：判断深蹲
function analyzeSquat(keypoints) {
    const leftHip = keypoints.find(k => k.part === 'leftHip');
    const leftKnee = keypoints.find(k => k.part === 'leftKnee');
    const leftAnkle = keypoints.find(k => k.part === 'leftAnkle');

    // 确保三个点都可见
    if (leftHip.score > 0.5 && leftKnee.score > 0.5 && leftAnkle.score > 0.5) {
        // 计算膝盖角度
        const angle = calculateAngle(leftHip.position, leftKnee.position, leftAnkle.position);
        
        // 在屏幕上显示角度
        ctx.font = "bold 24px Arial";
        ctx.fillStyle = "white";
        ctx.fillText(Math.round(angle) + "°", leftKnee.position.x + 20, leftKnee.position.y);

        // --- 状态机逻辑 ---
        
        // 站立状态 (角度大于 160)
        if (angle > 160) {
            if (currentStage === "DOWN") {
                 // 从 DOWN 变成 UP，说明完成了一次
                 squatCount++;
                 countEl.innerText = squatCount;
                 speak(String(squatCount)); // 报数
            }
            currentStage = "UP";
            stateBadge.innerText = "站立";
            stateBadge.style.color = "#00ff00";
            feedbackEl.classList.add('hidden');
        }

        // 下蹲状态 (角度小于 90)
        if (angle < 90) {
            currentStage = "DOWN";
            stateBadge.innerText = "下蹲";
            stateBadge.style.color = "#bb86fc";
            feedbackEl.innerText = "漂亮！保持！";
            feedbackEl.style.background = "rgba(0, 255, 85, 0.9)";
            feedbackEl.classList.remove('hidden');
        }

        // 纠错：如果处于下蹲趋势，但还没蹲到底 (例如 110度)
        if (currentStage === "UP" && angle < 140 && angle > 90) {
            feedbackEl.innerText = "再低一点！";
            feedbackEl.style.background = "rgba(255, 0, 85, 0.9)";
            feedbackEl.classList.remove('hidden');
        }
    }
}

async function startCoach() {
    startBtn.disabled = true;
    startBtn.innerText = "正在加载模型...";
    
    await setupCamera();
    
    // 加载 PoseNet
    net = await posenet.load();
    
    loadingEl.classList.add('hidden');
    isRunning = true;
    startBtn.classList.add('hidden');
    
    speak("准备开始，请侧身站立");
    poseDetectionFrame();
}