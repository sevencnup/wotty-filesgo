import './style.css'

// Toast notification function
function showToast(message, type = 'info') {
    // Remove existing toast
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'toast-notification';

    // Set styles based on type
    const bgColor = type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-blue-500';

    toast.className = `toast-notification fixed top-4 left-1/2 transform -translate-x-1/2 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in`;
    toast.textContent = message;

    // Add animation styles
    toast.style.animation = 'fadeIn 0.3s ease-in-out';

    // Add to document
    document.body.appendChild(toast);

    // Remove after 2 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-in-out';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// State
let currentTab = 'send';
let uploadQueue = [];
let uploadResults = [];
let isUploading = false;
let currentXHR = null;
let uploadPassword = '';

// Elements
const tabSend = document.getElementById('tab-send');
const tabReceive = document.getElementById('tab-receive');
const panelSend = document.getElementById('panel-send');
const panelReceive = document.getElementById('panel-receive');
const fileInput = document.getElementById('dropzone-file');
const uploadArea = document.getElementById('upload-area');
const uploadQueueEl = document.getElementById('upload-queue');
const currentUploadEl = document.getElementById('current-upload');
const currentFilenameEl = document.getElementById('current-filename');
const uploadResultsEl = document.getElementById('upload-results');
const singleResultEl = document.getElementById('single-result');
const singleFilenameEl = document.getElementById('single-filename');
const singleCodeEl = document.getElementById('single-code');
const codeInput = document.getElementById('code-input');
const btnDownload = document.getElementById('btn-download');
const receiveStatus = document.getElementById('receive-status');
const passwordInput = document.getElementById('password-input');
const passwordSection = document.getElementById('password-section');

// Tab Switching
function switchTab(tab) {
    currentTab = tab;
    if (tab === 'send') {
        tabSend.className = 'flex-1 py-4 md:py-5 text-center text-sm tracking-wide transition-all tab-active';
        tabReceive.className = 'flex-1 py-4 md:py-5 text-center text-sm tracking-wide transition-all tab-inactive';
        if (panelSend) panelSend.classList.remove('hidden');
        if (panelReceive) panelReceive.classList.add('hidden');
    } else {
        tabSend.className = 'flex-1 py-4 md:py-5 text-center text-sm tracking-wide transition-all tab-inactive';
        tabReceive.className = 'flex-1 py-4 md:py-5 text-center text-sm tracking-wide transition-all tab-active';
        if (panelSend) panelSend.classList.add('hidden');
        if (panelReceive) panelReceive.classList.remove('hidden');
    }
}

tabSend.addEventListener('click', () => switchTab('send'));
tabReceive.addEventListener('click', () => switchTab('receive'));

// Event Listeners
// Initialize App
const initApp = () => {
    console.log('--- FilesGO Init V2 ---');
    checkUploadState();
    
    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    let potentialCode = urlParams.get('code'); // 优先尝试从 ?code= 拿
    
    if (!potentialCode) {
        // 如果没拿到，再从路径里拿
        const match = path.match(/\/([A-Z0-9]{6})\/?$/i);
        if (match && match[1]) {
            potentialCode = match[1];
        }
    }
    
    if (potentialCode) {
        potentialCode = potentialCode.toUpperCase();
        console.log('Detected Code:', potentialCode);
        
        setTimeout(() => {
            switchTab('receive');
            if (codeInput) {
                codeInput.value = potentialCode;
                console.log('Code auto-filled:', potentialCode);
            }
        }, 100);
    }
};

// Ensure init runs even if DOMContentLoaded has already fired (common in module scripts)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        addFilesToQueue(e.target.files);
    });
}

// Password Verification
if (passwordInput) {
    passwordInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            const password = passwordInput.value.trim();
            if (password) {
                await verifyAndShowUpload(password);
            }
        }
    });
    
    passwordInput.addEventListener('blur', async () => {
        const password = passwordInput.value.trim();
        if (password) {
            await verifyAndShowUpload(password);
        }
    });
}

async function verifyAndShowUpload(password) {
    try {
        const res = await fetch('/api/verify-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();
        
        if (data.valid) {
            uploadPassword = password;
            passwordSection.classList.add('hidden');
            uploadArea.classList.remove('hidden');
            passwordInput.disabled = true;
            passwordInput.classList.add('opacity-50');
        } else {
            showToast('密码错误，请重新输入', 'error');
            passwordInput.value = '';
            passwordInput.focus();
        }
    } catch (e) {
        showToast('密码验证失败: ' + e.message, 'error');
    }
}

if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.querySelector('label')?.classList.add('border-blue-500', 'bg-blue-50/50');
    });

    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.querySelector('label')?.classList.remove('border-blue-500', 'bg-blue-50/50');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.querySelector('label')?.classList.remove('border-blue-500', 'bg-blue-50/50');
        
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            addFilesToQueue(files);
        }
    });
}

function checkUploadState() {
    if (uploadQueue.length > 0 || uploadResults.length > 0) {
        uploadArea.classList.remove('hidden');
    }
}

function addFilesToQueue(files) {
    const MAX_SIZE = 10 * 1024 * 1024 * 1024;
    
    for (const file of files) {
        if (file.size > MAX_SIZE) {
            showToast(`文件 "${file.name}" 超过 10GB 限制，已跳过`, 'error');
            continue;
        }
        uploadQueue.push({
            id: Date.now() + Math.random().toString(36).substring(2),
            file: file,
            status: 'waiting'
        });
    }
    
    if (uploadQueue.length > 0) {
        uploadQueueEl.classList.remove('hidden');
        renderQueue();
        if (!isUploading) {
            processQueue();
        }
    }
    
    fileInput.value = '';
}

function renderQueue() {
    uploadQueueEl.innerHTML = uploadQueue.map((item, index) => `
        <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <div class="flex items-center gap-3 flex-1 min-w-0">
                <div class="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg class="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
                <div class="min-w-0">
                    <p class="text-sm font-medium text-slate-700 truncate">${item.file.name}</p>
                    <p class="text-xs text-slate-400">${formatSize(item.file.size)}</p>
                </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                ${item.status === 'uploading' ? `
                    <span class="text-xs text-blue-600 font-medium animate-pulse">上传中...</span>
                ` : `
                    <span class="text-xs text-slate-400">等待</span>
                `}
                <button onclick="removeFromQueue(${index})" class="p-1 hover:bg-red-100 rounded-lg transition-colors">
                    <svg class="w-4 h-4 text-slate-400 hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

window.removeFromQueue = (index) => {
    const item = uploadQueue[index];
    if (!item) return;

    if (item.status === 'uploading') {
        if (confirm(`确定要取消上传 "${item.file.name}" 吗？`)) {
            if (currentXHR) {
                currentXHR.abort();
                currentXHR = null;
            }
            // 注意：abort 会触发 xhr 的 error 事件，
            // 进而进入 processQueue 的 catch 块进行 shift() 和处理下一个
        }
        return;
    }
    
    uploadQueue.splice(index, 1);
    if (uploadQueue.length === 0 && uploadResults.length === 0) {
        uploadQueueEl.classList.add('hidden');
    } else {
        renderQueue();
    }
};

async function processQueue() {
    if (isUploading || uploadQueue.length === 0) return;
    
    isUploading = true;
    const currentItem = uploadQueue[0];
    currentItem.status = 'uploading';
    renderQueue();
    
    currentUploadEl.classList.remove('hidden');
    currentFilenameEl.textContent = `正在上传: ${currentItem.file.name}`;
    updateProgress(0, 0, currentItem.file.size);
    
    try {
        const result = await uploadFile(currentItem.file);
        uploadResults.push({
            filename: currentItem.file.name,
            code: result.code,
            size: currentItem.file.size,
            download_url: result.download_url || (window.location.origin + '/' + result.code)
        });
        uploadQueue.shift();
        
        renderResults();
        
    } catch (e) {
        showToast(`文件 "${currentItem.file.name}" 上传失败: ${e.message}`, 'error');
        uploadQueue.shift();
    }
    
    isUploading = false;
    
    if (uploadQueue.length > 0) {
        processQueue();
    } else {
        currentUploadEl.classList.add('hidden');
        if (uploadQueue.length === 0) {
            uploadQueueEl.classList.add('hidden');
        }
    }
}

function renderResults() {
    if (uploadResults.length === 0) {
        uploadResultsEl.classList.add('hidden');
        singleResultEl.classList.add('hidden');
        return;
    }
    
    if (uploadResults.length === 1) {
        uploadResultsEl.classList.add('hidden');
        singleResultEl.classList.remove('hidden');
        singleFilenameEl.textContent = uploadResults[0].filename;
        singleCodeEl.textContent = uploadResults[0].code;
        const downloadLinkEl = document.getElementById('download-link');
        if (downloadLinkEl && uploadResults[0].download_url) {
            downloadLinkEl.value = uploadResults[0].download_url;
        }
    } else {
        singleResultEl.classList.add('hidden');
        uploadResultsEl.classList.remove('hidden');
        uploadResultsEl.innerHTML = uploadResults.map((result, index) => `
            <div class="bg-blue-50 border-2 border-blue-100 rounded-xl p-4">
                <div class="flex items-center justify-between mb-2">
                    <p class="text-sm font-medium text-slate-700 truncate flex-1">${result.filename}</p>
                    <button onclick="copyResultCode(${index})" class="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded-lg transition-colors">
                        复制取件码
                    </button>
                </div>
                <div class="text-2xl font-mono font-black tracking-[0.15em] text-blue-600 cursor-pointer hover:bg-blue-100 rounded-lg p-2 text-center transition-colors mb-2" onclick="copyResultCode(${index})">
                    ${result.code}
                </div>
                ${result.download_url ? `
                <div class="flex items-center gap-2 bg-white rounded-lg p-2 border border-blue-200">
                    <input type="text" readonly class="flex-1 text-xs text-slate-600 bg-transparent outline-none font-mono truncate" value="${result.download_url}">
                    <button onclick="copyResultLink(${index})" class="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded-lg transition-colors">
                        复制链接
                    </button>
                </div>
                ` : ''}
            </div>
        `).join('');
    }
}

window.copyResultCode = (index) => {
    const code = uploadResults[index].code;
    navigator.clipboard.writeText(code).then(() => {
        const btns = uploadResultsEl.querySelectorAll('button');
        if (btns[index]) {
            const originalText = btns[index].textContent;
            btns[index].textContent = '已复制';
            btns[index].classList.replace('bg-blue-100', 'bg-green-100');
            btns[index].classList.replace('text-blue-700', 'text-green-700');
            setTimeout(() => {
                btns[index].textContent = originalText;
                btns[index].classList.replace('bg-green-100', 'bg-blue-100');
                btns[index].classList.replace('text-green-700', 'text-blue-700');
            }, 1500);
        }
    });
};

window.copySingleCode = (el) => {
    const code = singleCodeEl.textContent.trim();
    if (!code || code === '------') {
        showToast('取件码未生成，请稍后', 'error');
        return;
    }
    navigator.clipboard.writeText(code).then(() => {
        showToast('取件码已复制', 'success');
        el.classList.add('opacity-50');
        setTimeout(() => el.classList.remove('opacity-50'), 200);
    });
};

window.copyDownloadLink = () => {
    const downloadLinkEl = document.getElementById('download-link');
    const link = downloadLinkEl.value;
    if (!link) {
        showToast('链接未生成，请稍后', 'error');
        return;
    }
    navigator.clipboard.writeText(link).then(() => {
        showToast('链接已复制', 'success');
    });
};

window.copyResultLink = (index) => {
    const link = uploadResults[index].download_url;
    if (link) {
        navigator.clipboard.writeText(link).then(() => {
            showToast('链接已复制', 'success');
        });
    }
};

function updateProgress(percent, loaded, total) {
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    if (progressBar) {
        progressBar.style.width = percent + '%';
    }
    if (progressText) {
        progressText.textContent = percent + '% · ' + formatSize(loaded) + ' / ' + formatSize(total);
    }
}

async function uploadFile(file) {
    const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB chunks
    if (file.size <= CHUNK_SIZE) {
        return uploadSingleFile(file);
    }
    return uploadChunkedFile(file, CHUNK_SIZE);
}

// === 加密工具函数 ===
async function encryptBuffer(buffer, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    
    // 派生密钥
    const keyMaterial = await crypto.subtle.importKey(
        "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
    );
    
    const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
    );
    
    // 加密
    const encryptedContent = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        buffer
    );
    
    // 拼接: [Salt][IV][Content]
    const result = new Uint8Array(16 + 12 + encryptedContent.byteLength);
    result.set(salt, 0);
    result.set(iv, 16);
    result.set(new Uint8Array(encryptedContent), 28);
    
    return result;
}

async function uploadSingleFile(file) {
    // 1. 【预处理阶段】在 XHR 之前处理加密
    let fileToSend = file;
    
    if (uploadPassword) {
        try {
            // 简单的 UI 反馈
            const currentFilename = document.getElementById('current-filename');
            const originalText = currentFilename ? currentFilename.textContent : '';
            if (currentFilename) currentFilename.textContent = `正在加密: ${file.name}...`;

            const buffer = await file.arrayBuffer();
            const encryptedData = await encryptBuffer(buffer, uploadPassword);
            fileToSend = new Blob([encryptedData], { type: 'application/octet-stream' });
            
            if (currentFilename) currentFilename.textContent = originalText;
        } catch (e) {
            console.error('Encryption error:', e);
            if (!confirm('加密失败，是否以明文继续上传？')) {
                throw new Error('用户取消上传');
            }
        }
    }

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        currentXHR = xhr;
        
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                updateProgress(percent, e.loaded, e.total);
            }
        });

        xhr.addEventListener('load', () => {
            currentXHR = null;
            try {
                const data = JSON.parse(xhr.responseText);
                if (xhr.status === 200 && data.code) {
                    resolve({ code: data.code });
                } else {
                    reject(new Error(data.error || '上传失败'));
                }
            } catch (e) {
                reject(new Error('解析响应失败'));
            }
        });

        xhr.addEventListener('error', () => {
            currentXHR = null;
            reject(new Error('网络错误或上传被取消'));
        });
        
        xhr.addEventListener('abort', () => {
            currentXHR = null;
            reject(new Error('上传已取消'));
        });

        xhr.timeout = 30 * 60 * 1000;
        xhr.addEventListener('timeout', () => {
            currentXHR = null;
            reject(new Error('上传超时'));
        });

        const formData = new FormData();
        // 使用原始文件名
        formData.append('file', fileToSend, file.name);
        
        // 2. 【核心修复】严格顺序: open -> setRequestHeader -> send
        xhr.open('POST', '/api/upload', true);
        xhr.setRequestHeader('X-Upload-Password', uploadPassword);
        xhr.send(formData);
    });
}

async function uploadChunkedFile(file, chunkSize) {
    const totalChunks = Math.ceil(file.size / chunkSize);
    const identifier = Date.now() + '-' + Math.random().toString(36).substring(2);
    
    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        
        await uploadChunk(chunk, i, identifier, file.name, (loadedInChunk) => {
            const totalLoaded = start + loadedInChunk;
            const percent = Math.round((totalLoaded / file.size) * 100);
            updateProgress(percent, totalLoaded, file.size);
        });
    }
    
    // Complete upload
    const res = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-Upload-Password': uploadPassword
        },
        body: JSON.stringify({
            identifier,
            filename: file.name,
            totalChunks
        })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '合并文件失败');
    return { code: data.code };
}

async function uploadChunk(chunk, index, identifier, filename, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        currentXHR = xhr;

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) onProgress(e.loaded);
        });
        
        xhr.addEventListener('load', () => {
            currentXHR = null;
            if (xhr.status === 200) resolve();
            else reject(new Error('分片上传失败'));
        });
        
        xhr.addEventListener('error', () => {
            currentXHR = null;
            reject(new Error('网络错误或上传被取消'));
        });

        xhr.addEventListener('abort', () => {
            currentXHR = null;
            reject(new Error('上传已取消'));
        });
        
        const formData = new FormData();
        formData.append('file', chunk);
        formData.append('identifier', identifier);
        formData.append('index', index);
        formData.append('filename', filename);
        xhr.open('POST', '/api/upload/chunk', true);
        xhr.setRequestHeader('X-Upload-Password', uploadPassword);
        
        xhr.send(formData);
    });
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
        const res = await fetch(`/api/file/${code}`);
        if (res.ok) {
            const file = await res.json();
            showReceiveStatus(`找到文件: ${file.filename} (${formatSize(file.size)})，正在下载...`, 'text-green-600');
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

window.resetUpload = () => {
    fileInput.value = '';
    uploadQueue = [];
    uploadResults = [];
    isUploading = false;
    uploadPassword = '';
    uploadQueueEl.classList.add('hidden');
    uploadResultsEl.classList.add('hidden');
    singleResultEl.classList.add('hidden');
    currentUploadEl.classList.add('hidden');
    uploadQueueEl.innerHTML = '';
    uploadResultsEl.innerHTML = '';
    passwordSection.classList.remove('hidden');
    passwordInput.disabled = false;
    passwordInput.classList.remove('opacity-50');
    passwordInput.value = '';
    uploadArea.classList.add('hidden');
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
