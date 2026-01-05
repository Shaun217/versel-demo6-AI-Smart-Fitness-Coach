// ==========================================
// 配置区域
// ==========================================
// 注意：这是 Google Cloud API Key。
// 当前 PoseNet 模型是本地运行的，不需要此 Key。
// 但如果你后续接入 Google Gemini (用于AI建议) 或 Cloud TTS，将使用此 Key。
const GOOGLE_API_KEY = 'AIzaSyCh-KmX3ozjlrYkUiecQMH1KdnOLUmEzx';

// ==========================================
// DOM 元素获取
// ==========================================
let net;
const video = document.getElementById('video');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const countEl = document.getElementById('count');
const stateBadge = document.getElementById('state-badge');
const feedbackEl = document.getElementById('feedback');
const startBtn = document.getElementById('startBtn');
const loadingEl = document.getElementById('loading');
const loadingText = loadingEl.querySelector('p');
const accuracyEl = document.getElementById('accuracy');

// ==========================================
// 状态变量
// ==========================================
let isRunning = false;
let squatCount = 0;
let currentStage = "UP"; 
let lastFeedbackTime = 0;
const synth = window.speechSynthesis; // 浏览器原生语音

// ==========================================
// 1. 初始化摄像头
// ==========================================
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
            video.play();
            resolve(video);
        };
    });
}

// ==========================================
// 2. 数学计算
// ==========================================
function calculateAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
}

// ==========================================
// 3. 交互反馈 (语音 + UI)
// ==========================================
function speak(text) {
    if (!document.getElementById('voiceToggle').checked) return;
    const now = Date.now();
    // 防止语音过于密集
    if (now - lastFeedbackTime < 1200) return; 
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.2; // 稍微加快语速
    synth.speak(utterance);
    lastFeedbackTime = now;
}

// [高级功能示例] 使用 API Key 调用 Gemini 进行评价 (当前未启用，仅作示例)
async function askGeminiFeedback(count) {
    console.log(`正在使用 API Key: ${GOOGLE_API_KEY} 请求 AI 建议...`);
    // 这里可以接入 fetch 调用 Google Generative Language API
}

// ==========================================
// 4. 姿态检测循环
// ==========================================
async function poseDetectionFrame() {
    if (!isRunning) return;

    try {
        const pose = await net.estimateSinglePose(video, {
            flipHorizontal: true
        });

        // 清空画布并绘制视频背景
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // 如果检测可信度尚可，进行绘制和分析
        if (pose.score > 0.4) {
            drawSkeleton(pose.keypoints);
            analyzeSquat(pose.keypoints);
            // 更新准确率显示
            accuracyEl.innerText = Math.round(pose.score * 100) + "%";
        }

        ctx.restore();
        requestAnimationFrame(poseDetectionFrame);
    } catch (e) {
        console.error("Frame error:", e);
        requestAnimationFrame(poseDetectionFrame); 
    }
}

// ==========================================
// 5. 绘制骨架
// ==========================================
function drawSkeleton(keypoints) {
    const leftHip = keypoints.find(k => k.part === 'leftHip');
    const leftKnee = keypoints.find(k => k.part === 'leftKnee');
    const leftAnkle = keypoints.find(k => k.part === 'leftAnkle');

    // 只有当三个关键点都清晰时才绘制
    if (leftHip.score > 0.5 && leftKnee.score > 0.5 && leftAnkle.score > 0.5) {
        // 画线
        ctx.beginPath();
        ctx.moveTo(leftHip.position.x, leftHip.position.y);
        ctx.lineTo(leftKnee.position.x, leftKnee.position.y);
        ctx.lineTo(leftAnkle.position.x, leftAnkle.position.y);
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#00ff00'; // 绿色线条
        ctx.stroke();

        // 画点
        [leftHip, leftKnee, leftAnkle].forEach(p => {
            ctx.beginPath();
            ctx.arc(p.position.x, p.position.y, 10, 0, 2*Math.PI);
            ctx.fillStyle = '#bb86fc'; // 紫色点
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.stroke();
        });
    }
}

// ==========================================
// 6. 深蹲逻辑核心
// ==========================================
function analyzeSquat(keypoints) {
    const leftHip = keypoints.find(k => k.part === 'leftHip');
    const leftKnee = keypoints.find(k => k.part === 'leftKnee');
    const leftAnkle = keypoints.find(k => k.part === 'leftAnkle');

    if (leftHip.score > 0.5 && leftKnee.score > 0.5 && leftAnkle.score > 0.5) {
        const angle = calculateAngle(leftHip.position, leftKnee.position, leftAnkle.position);
        
        // 在膝盖旁边显示角度
        ctx.font = "bold 24px sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(Math.round(angle) + "°", leftKnee.position.x + 25, leftKnee.position.y);

        // 状态机逻辑
        // 站立状态 (腿部伸直，角度很大)
        if (angle > 160) {
            if (currentStage === "DOWN") {
                 squatCount++;
                 countEl.innerText = squatCount;
                 speak(String(squatCount));
                 
                 // 每做5个，可以触发一次特殊鼓励（逻辑示例）
                 if(squatCount % 5 === 0) speak("加油，很棒！");
            }
            currentStage = "UP";
            stateBadge.innerText = "站立";
            stateBadge.style.color = "#00ff00"; // Green
            feedbackEl.classList.add('hidden');
        }

        // 下蹲状态 (腿部弯曲，角度小于90)
        if (angle < 100) { // 放宽一点点到 100度，更容易触发
            currentStage = "DOWN";
            stateBadge.innerText = "下蹲";
            stateBadge.style.color = "#bb86fc"; // Purple
            
            // 只有当之前是 UP 且现在角度合适时才提示
            if (angle < 90) {
                feedbackEl.innerText = "完美深蹲！";
                feedbackEl.style.background = "rgba(0, 255, 0, 0.8)";
            } else {
                feedbackEl.innerText = "再低一点！";
                feedbackEl.style.background = "rgba(255, 165, 0, 0.8)";
            }
            feedbackEl.classList.remove('hidden');
        }
    }
}

// ==========================================
// 7. 启动程序
// ==========================================
async function startCoach() {
    startBtn.disabled = true;
    
    try {
        await setupCamera();
        
        loadingText.innerText = "🧠 正在初始化 AI 模型...";
        console.log("Loading PoseNet...");
        
        // 加载模型
        net = await posenet.load({
            architecture: 'MobileNetV1',
            outputStride: 16,
            inputResolution: { width: 640, height: 480 },
            multiplier: 0.75 
        });
        
        console.log("PoseNet Loaded. API Key configured.");

        loadingEl.classList.add('hidden');
        isRunning = true;
        startBtn.classList.add('hidden');
        
        speak("准备开始，请侧身站立");
        poseDetectionFrame();

    } catch (error) {
        console.error(error);
        alert("启动失败: " + error.message + "\n建议使用 Chrome 浏览器并允许摄像头权限。");
        
        startBtn.disabled = false;
        startBtn.innerText = "重试";
        loadingEl.classList.add('hidden');
    }
}