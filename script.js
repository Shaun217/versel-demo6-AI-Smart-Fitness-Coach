let net;
const video = document.getElementById('video');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const countEl = document.getElementById('count');
const stateBadge = document.getElementById('state-badge');
const feedbackEl = document.getElementById('feedback');
const startBtn = document.getElementById('startBtn');
const loadingEl = document.getElementById('loading');
const loadingText = loadingEl.querySelector('p'); // 获取 loading 文字元素

// 状态变量
let isRunning = false;
let squatCount = 0;
let currentStage = "UP"; 
let lastFeedbackTime = 0;

// 语音合成
const synth = window.speechSynthesis;

// 1. 初始化摄像头
async function setupCamera() {
    loadingText.innerText = "📷 正在请求摄像头权限...";
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('你的浏览器不支持摄像头 API，请使用 Chrome 或 Safari。');
    }

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
            video.play(); // 关键：确保视频开始播放
            resolve(video);
        };
    });
}

// 2. 核心数学：计算夹角
function calculateAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
}

// 3. 语音播报
function speak(text) {
    if (!document.getElementById('voiceToggle').checked) return;
    const now = Date.now();
    if (now - lastFeedbackTime < 1500) return; 
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    synth.speak(utterance);
    lastFeedbackTime = now;
}

// 4. 姿态分析循环
async function poseDetectionFrame() {
    if (!isRunning) return;

    try {
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
    } catch (e) {
        console.error("Frame error:", e);
        // 出错不中断，尝试下一帧
        requestAnimationFrame(poseDetectionFrame); 
    }
}

// 5. 绘制骨骼 (只画左腿)
function drawSkeleton(keypoints) {
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

    if (leftHip.score > 0.5 && leftKnee.score > 0.5 && leftAnkle.score > 0.5) {
        const angle = calculateAngle(leftHip.position, leftKnee.position, leftAnkle.position);
        
        ctx.font = "bold 24px Arial";
        ctx.fillStyle = "white";
        ctx.fillText(Math.round(angle) + "°", leftKnee.position.x + 20, leftKnee.position.y);

        if (angle > 160) {
            if (currentStage === "DOWN") {
                 squatCount++;
                 countEl.innerText = squatCount;
                 speak(String(squatCount));
            }
            currentStage = "UP";
            stateBadge.innerText = "站立";
            stateBadge.style.color = "#00ff00";
            feedbackEl.classList.add('hidden');
        }

        if (angle < 90) {
            currentStage = "DOWN";
            stateBadge.innerText = "下蹲";
            stateBadge.style.color = "#bb86fc";
            feedbackEl.innerText = "漂亮！保持！";
            feedbackEl.classList.remove('hidden');
        }

        if (currentStage === "UP" && angle < 140 && angle > 90) {
            feedbackEl.innerText = "再低一点！";
            feedbackEl.classList.remove('hidden');
        }
    }
}

// 🚀 启动入口
async function startCoach() {
    startBtn.disabled = true;
    
    try {
        // 第一步：摄像头
        await setupCamera();
        
        // 第二步：加载 AI
        loadingText.innerText = "🧠 正在下载 AI 模型 (约 10MB)...";
        console.log("Loading PoseNet...");
        
        // 使用更轻量级的配置，加快加载速度
        net = await posenet.load({
            architecture: 'MobileNetV1',
            outputStride: 16,
            inputResolution: { width: 640, height: 480 },
            multiplier: 0.75 // 值越小模型越小，速度越快，但精度略降
        });
        
        console.log("PoseNet Loaded!");

        // 启动成功
        loadingEl.classList.add('hidden');
        isRunning = true;
        startBtn.classList.add('hidden'); // 隐藏开始按钮
        
        speak("准备开始");
        poseDetectionFrame();

    } catch (error) {
        console.error(error);
        alert("启动失败: " + error.message + "\n(请检查摄像头权限或网络连接)");
        
        // 重置按钮
        startBtn.disabled = false;
        startBtn.innerText = "重试";
        loadingEl.classList.add('hidden');
    }
}