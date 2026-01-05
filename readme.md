# 🏋️‍♂️ AI Fitness Coach (智能深蹲计数器)

这是一个利用计算机视觉技术（Computer Vision）实现的网页版健身教练。它利用三角函数和状态机逻辑，实时分析你的运动姿态。

## 🔑 API 配置
已在 `script.js` 中配置 Google API Key：
> `const GOOGLE_API_KEY = 'AIzaSyCh-KmX3ozjlrYkUiecQMH1KdnOLUmEzx';`

*注意：当前核心动作捕捉使用的是 TensorFlow.js (PoseNet) 本地模型，不消耗 API 配额。该 Key 预留给未来的 Google Cloud TTS 或 Gemini AI 建议功能。*

## 🧠 技术原理

1.  **关键点提取**: 使用 `PoseNet` (TensorFlow.js) 提取人体骨骼点，重点关注 **左髋(Hip)**、**左膝(Knee)**、**左踝(Ankle)**。
2.  **几何计算**: 利用反三角函数 `Math.atan2` 计算这三点形成的夹角。
3.  **状态机 (State Machine)**:
    - `UP State`: 角度 > 160° (站直)
    - `DOWN State`: 角度 < 100° (深蹲)
    - 只有当状态从 `UP` -> `DOWN` -> `UP` 完整流转时，计数器加 1。
4.  **反馈**: 实时语音报数与纠错。

## 🚀 使用方法

1.  **浏览器支持**: 推荐使用 PC 端 Chrome 或 Edge 浏览器。
2.  **侧身站立**: 为了让 AI 最清楚地看到你的腿部弯曲角度，请**侧面对着摄像头**。
3.  **全身入镜**: 确保摄像头能看到你的腰部到脚部。
4.  **开始运动**: 
    - 慢慢下蹲，直到界面显示“下蹲”。
    - 站起来，直到听到语音报数。

## 📂 文件结构
- `index.html`: UI 界面结构
- `style.css`: 深色模式健身风格样式
- `script.js`: AI 模型加载、角度计算与 API 配置