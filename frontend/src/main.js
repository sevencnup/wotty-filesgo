import './style.css'

// State
let currentTab = 'send';

// Elements
const tabSend = document.getElementById('tab-send');
const tabReceive = document.getElementById('tab-receive');
const panelSend = document.getElementById('panel-send');
const panelReceive = document.getElementById('panel-receive');
const fileInput = document.getElementById('dropzone-file');
const uploadArea = document.getElementById('upload-area');
const uploadResult = document.getElementById('upload-result');
const processingState = document.getElementById('processing-state');
const successState = document.getElementById('success-state');
const resultCode = document.getElementById('result-code');
const codeInput = document.getElementById('code-input');
const btnDownload = document.getElementById('btn-download');
const receiveStatus = document.getElementById('receive-status');

// Tab Switching
function switchTab(tab) {
    currentTab = tab;
    if (tab === 'send') {
        tabSend.className = 'flex-1 py-4 text-center text-lg transition-all tab-active';
        tabReceive.className = 'flex-1 py-4 text-center text-lg transition-all tab-inactive';
        panelSend.classList.remove('hidden');
        panelReceive.classList.add('hidden');
    } else {
        tabSend.className = 'flex-1 py-4 text-center text-lg transition-all tab-inactive';
        tabReceive.className = 'flex-1 py-4 text-center text-lg transition-all tab-active';
        panelSend.classList.add('hidden');
        panelReceive.classList.remove('hidden');
    }
}

tabSend.addEventListener('click', () => switchTab('send'));
tabReceive.addEventListener('click', () => switchTab('receive'));

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Check URL params for auto-fill code? Maybe later.
});

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        handleUpload(e.target.files[0]);
    });
}

async function handleUpload(file) {
    if (!file) return;

    // 10GB Limit
    const MAX_SIZE = 10 * 1024 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        alert('文件大小不能超过 10GB');
        return;
    }

    // Show processing
    uploadArea.classList.add('hidden');
    uploadResult.classList.remove('hidden');
    processingState.classList.remove('hidden');
    successState.classList.add('hidden');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        if (res.ok) {
            const data = await res.json();
            const code = data && (data.code || data.Code || data.CODE) ? String(data.code || data.Code || data.CODE).trim() : '';
            processingState.classList.add('hidden');
            successState.classList.remove('hidden');
            if (code) {
                resultCode.textContent = code;
            } else {
                resultCode.textContent = '------';
                alert('后端未返回取件码，请稍后重试');
            }
        } else {
            alert('上传失败，请重试');
            resetUpload();
        }
    } catch (e) {
        alert('网络错误: ' + e.message);
        resetUpload();
    }
}

// Download Logic
btnDownload.addEventListener('click', async () => {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length !== 6) {
        showReceiveStatus('请输入 6 位提取码', 'text-red-500');
        return;
    }

    btnDownload.disabled = true;
    btnDownload.textContent = '正在查找...';
    showReceiveStatus('');

    try {
        // Check file info first
        const res = await fetch(`/api/file/${code}`);
        if (res.ok) {
            const file = await res.json();
            showReceiveStatus(`找到文件: ${file.filename} (${formatSize(file.size)})，正在下载...`, 'text-green-600');
            
            // Trigger download
            window.location.href = `/api/download/${code}`;
            
            setTimeout(() => {
                btnDownload.disabled = false;
                btnDownload.textContent = '立即下载';
                showReceiveStatus('下载已开始', 'text-gray-500');
            }, 2000);
        } else {
            showReceiveStatus('文件不存在或已过期', 'text-red-500');
            btnDownload.disabled = false;
            btnDownload.textContent = '立即下载';
        }
    } catch (e) {
        showReceiveStatus('网络错误', 'text-red-500');
        btnDownload.disabled = false;
        btnDownload.textContent = '立即下载';
    }
});

// Utilities
window.copyCode = (el) => {
    const codeElement = document.getElementById('result-code');
    const code = codeElement ? codeElement.innerText.trim() : '';
    
    if (!code || code === '------') {
        alert('取件码未生成，请稍后');
        return;
    }

    navigator.clipboard.writeText(code).then(() => {
        // Visual feedback instead of alert
        if (el) {
            const originalClass = el.className;
            // Add opacity-50 for visual feedback
            el.classList.add('opacity-50');
            
            // Restore after 200ms
            setTimeout(() => {
                el.classList.remove('opacity-50');
            }, 200);
        }
    }).catch(err => {
        console.error('Copy failed:', err);
        prompt('复制失败，请手动复制:', code);
    });
};

window.resetUpload = () => {
    fileInput.value = '';
    uploadArea.classList.remove('hidden');
    uploadResult.classList.add('hidden');
};

function showReceiveStatus(msg, className) {
    receiveStatus.textContent = msg;
    receiveStatus.className = 'text-center text-sm min-h-[20px] ' + (className || '');
}

const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
