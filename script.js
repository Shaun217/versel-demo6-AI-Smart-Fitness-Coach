// ==========================================
// 配置区域
// ==========================================
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
const synth = window.speechSynthesis;

// 判断是否为移动设备
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// ==========================================
// 1. 初始化摄像头 (智能判断前后置)
// ==========================================
async function setupCamera() {
    loadingText.innerText = "📷 正在请求摄像头权限...";
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('你的浏览器不支持摄像头 API，请使用 Chrome 或 Safari。');
    }

    // 根据设备决定配置
    const videoConstraints = {
        audio: false,
        video: {
            // 移动端通常不需要强制 640x480，使用 ideal 让系统自动适配宽高比
            width: isMobile ? { ideal: 640 } : 640,
            height: isMobile ? { ideal: 480 } : 480,
            // 【关键修改】：移动端用 'environment' (后置)，电脑用 'user' (前置)
            facingMode: isMobile ? "environment" : "user"
        }
    };

    const stream = await navigator.mediaDevices.getUserMedia(videoConstraints);
    video.srcObject = stream;

    // 【关键修改】：如果是后置摄像头，不需要镜像翻转，添加 no-mirror 类
    if (isMobile) {
        video.classList.add('no-mirror');
        canvas.classList.add('no-mirror');
    } else {
        video.classList.remove('no-mirror');
        canvas.classList.remove('no-mirror');
    }

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
// 3. 交互反馈
// ==========================================
function speak(text) {
    if (!document.getElementById('voiceToggle').checked) return;
    const now = Date.now();
    if (now - lastFeedbackTime < 1200) return; 
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.2;
    synth.speak(utterance);
    lastFeedbackTime = now;
}

// ==========================================
// 4. 姿态检测循环
// ==========================================
async function poseDetectionFrame() {
    if (!isRunning) return;

    try {
        // 如果是后置摄像头(isMobile)，不需要水平翻转 flipHorizontal: false
        // 如果是前置摄像头，通常需要镜像，所以 flipHorizontal: true
        const pose = await net.estimateSinglePose(video, {
            flipHorizontal: !isMobile
        });

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();

        if (isMobile) {
            // 移动端后置：正常绘制，不需要镜像翻转
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } else {
            // 电脑端前置：需要镜像翻转绘制
            ctx.scale(-1, 1);
            ctx.translate(-canvas.width, 0);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }

        if (pose.score > 0.4) {
            drawSkeleton(pose.keypoints);
            analyzeSquat(pose.keypoints);
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

    if (leftHip.score > 0.5 && leftKnee.score > 0.5 && leftAnkle.score > 0.5) {
        ctx.beginPath();
        ctx.moveTo(leftHip.position.x, leftHip.position.y);
        ctx.lineTo(leftKnee.position.x, leftKnee.position.y);
        ctx.lineTo(leftAnkle.position.x, leftAnkle.position.y);
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#00ff00';
        ctx.stroke();

        [leftHip, leftKnee, leftAnkle].forEach(p => {
            ctx.beginPath();
            ctx.arc(p.position.x, p.position.y, 10, 0, 2*Math.PI);
            ctx.fillStyle = '#bb86fc';
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
        
        ctx.font = "bold 24px sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(Math.round(angle) + "°", leftKnee.position.x + 25, leftKnee.position.y);

        if (angle > 160) {
            if (currentStage === "DOWN") {
                 squatCount++;
                 countEl.innerText = squatCount;
                 speak(String(squatCount));
                 if(squatCount % 5 === 0) speak("加油，很棒！");
            }
            currentStage = "UP";
            stateBadge.innerText = "站立";
            stateBadge.style.color = "#00ff00";
            feedbackEl.classList.add('hidden');
        }

        if (angle < 100) {
            currentStage = "DOWN";
            stateBadge.innerText = "下蹲";
            stateBadge.style.color = "#bb86fc";
            
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
    loadingEl.classList.remove('hidden'); // 显示加载层
    
    try {
        await setupCamera();
        
        loadingText.innerText = "🧠 正在初始化 AI 模型...";
        
        // 移动端为了性能，可以用更小的 multiplier (比如 0.50)
        const mobileNetConfig = isMobile ? 0.50 : 0.75;

        net = await posenet.load({
            architecture: 'MobileNetV1',
            outputStride: 16,
            inputResolution: { width: 640, height: 480 },
            multiplier: mobileNetConfig 
        });
        
        console.log(`PoseNet Loaded. Mobile: ${isMobile}, Multiplier: ${mobileNetConfig}`);

        loadingEl.classList.add('hidden');
        startBtn.classList.add('hidden');
        
        isRunning = true;
        speak("准备开始，请侧身站立");
        poseDetectionFrame();

    } catch (error) {
        console.error(error);
        alert("启动失败: " + error.message + "\n如果使用手机，请确保在 Safari 或 Chrome 中打开。");
        
        startBtn.disabled = false;
        startBtn.innerText = "重试";
        startBtn.classList.remove('hidden');
        loadingEl.classList.add('hidden');
    }
}