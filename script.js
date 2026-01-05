// ==========================================
// 配置区域
// ==========================================
const GOOGLE_API_KEY = 'AIzaSyCh-KmX3ozjlrYkUiecQMH1KdnOLUmEzx';

// ==========================================
// 元素与状态
// ==========================================
let net;
const video = document.getElementById('video');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const countEl = document.getElementById('count');
const stateBadge = document.getElementById('state-badge');
const feedbackEl = document.getElementById('feedback');
const startBtn = document.getElementById('startBtn');
const switchBtn = document.getElementById('switchBtn'); // 新增
const loadingEl = document.getElementById('loading');
const loadingText = loadingEl.querySelector('p');
const accuracyEl = document.getElementById('accuracy');

let isRunning = false;
let squatCount = 0;
let currentStage = "UP"; 
let lastFeedbackTime = 0;
const synth = window.speechSynthesis;

// 摄像头状态控制
let currentStream = null;
let useFrontCamera = true; // 默认为前置
// 判断设备类型
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// ==========================================
// 1. 摄像头管理 (核心修改)
// ==========================================

// 停止当前视频流（切换前必须调用）
function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
}

async function setupCamera() {
    stopCamera(); // 先停止旧的
    loadingText.innerText = "📷 正在启动摄像头...";
    
    // 确定 facingMode
    // 如果是手机，根据变量切换 user/environment
    // 如果是电脑，通常忽略此参数或默认为 user
    const facingMode = useFrontCamera ? "user" : "environment";

    const constraints = {
        audio: false,
        video: {
            facingMode: facingMode,
            // 请求较高分辨率，让 CSS object-fit: cover 去裁剪，保证清晰度
            width: { ideal: 640 }, 
            height: { ideal: 480 }
        }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = stream;
        video.srcObject = stream;

        // 处理镜像逻辑：只有前置摄像头才镜像
        if (useFrontCamera) {
            video.classList.remove('no-mirror');
            canvas.classList.remove('no-mirror');
        } else {
            video.classList.add('no-mirror');
            canvas.classList.add('no-mirror');
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
    } catch (err) {
        throw new Error("摄像头启动失败，请检查权限。");
    }
}

// 切换摄像头功能的入口
async function toggleCamera() {
    if (!isMobile && !confirm("电脑端通常只有一个摄像头，确定要切换吗？")) return;
    
    // 暂停 AI 循环，防止报错
    isRunning = false; 
    loadingEl.classList.remove('hidden');
    
    // 切换状态
    useFrontCamera = !useFrontCamera;
    
    try {
        await setupCamera();
        // 重新开始循环
        loadingEl.classList.add('hidden');
        isRunning = true;
        poseDetectionFrame();
    } catch (e) {
        alert(e.message);
        loadingEl.classList.add('hidden');
    }
}

// ==========================================
// 2. 交互与逻辑
// ==========================================
function calculateAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
}

function speak(text) {
    if (!document.getElementById('voiceToggle').checked) return;
    const now = Date.now();
    if (now - lastFeedbackTime < 1200) return; 
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    synth.speak(utterance);
    lastFeedbackTime = now;
}

// ==========================================
// 3. AI 视觉处理
// ==========================================
async function poseDetectionFrame() {
    if (!isRunning) return;

    try {
        // 如果是后置摄像头，不需要翻转输入图像
        const pose = await net.estimateSinglePose(video, {
            flipHorizontal: useFrontCamera 
        });

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();

        if (useFrontCamera) {
            // 前置：镜像绘制
            ctx.scale(-1, 1);
            ctx.translate(-canvas.width, 0);
        }
        // 后置：直接绘制，无需变换

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

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
            ctx.stroke();
        });
    }
}

function analyzeSquat(keypoints) {
    const leftHip = keypoints.find(k => k.part === 'leftHip');
    const leftKnee = keypoints.find(k => k.part === 'leftKnee');
    const leftAnkle = keypoints.find(k => k.part === 'leftAnkle');

    if (leftHip.score > 0.5 && leftKnee.score > 0.5 && leftAnkle.score > 0.5) {
        const angle = calculateAngle(leftHip.position, leftKnee.position, leftAnkle.position);
        
        ctx.font = "bold 24px sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(Math.round(angle) + "°", leftKnee.position.x + 25, leftKnee.position.y);

        // 逻辑：站立 > 160
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

        // 逻辑：下蹲 < 100
        if (angle < 100) {
            currentStage = "DOWN";
            stateBadge.innerText = "下蹲";
            stateBadge.style.color = "#bb86fc";
            
            if (angle < 90) {
                feedbackEl.innerText = "完美！";
            } else {
                feedbackEl.innerText = "再低点！";
            }
            feedbackEl.classList.remove('hidden');
        }
    }
}

// ==========================================
// 4. 启动程序
// ==========================================
async function startCoach() {
    startBtn.disabled = true;
    loadingEl.classList.remove('hidden');
    
    try {
        // 根据设备类型，手机默认开后置(environment)，电脑默认前置(user)
        useFrontCamera = !isMobile; 
        
        await setupCamera();
        
        loadingText.innerText = "🧠 加载 AI 模型...";
        const configMultiplier = isMobile ? 0.50 : 0.75;
        
        net = await posenet.load({
            architecture: 'MobileNetV1',
            outputStride: 16,
            inputResolution: { width: 640, height: 480 },
            multiplier: configMultiplier
        });
        
        console.log("System Ready.");

        loadingEl.classList.add('hidden');
        startBtn.classList.add('hidden'); // 隐藏开始按钮
        switchBtn.classList.remove('hidden'); // 显示切换按钮
        
        isRunning = true;
        speak("准备开始，请调整位置");
        poseDetectionFrame();

    } catch (error) {
        console.error(error);
        alert("错误: " + error.message);
        startBtn.disabled = false;
        loadingEl.classList.add('hidden');
    }
}