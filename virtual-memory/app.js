const PAGE_SIZE = 4096; // 4KB
const FRAME_COUNT = 4;
const sequence = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];

// 核心数据结构
let frames = new Array(FRAME_COUNT).fill(null); 
let pageTable = []; 
let pageFaults = 0;
let currentIndex = 0;
let isPlaying = false;
let playTimer = null;
let fifoQueue = [];
let lruQueue = [];

// UI 元素
const algorithmSelect = document.getElementById('algorithmSelect');
const startBtn = document.getElementById('startBtn');
const nextBtn = document.getElementById('nextBtn');
const autoBtn = document.getElementById('autoBtn');
const accessBtn = document.getElementById('accessBtn');
const logicAddressInput = document.getElementById('logicAddressInput');
const historyTableBody = document.getElementById('historyTableBody');

// 初始化
function initSystem() {
    clearInterval(playTimer);
    isPlaying = false;
    currentIndex = 0;
    pageFaults = 0;
    frames = new Array(FRAME_COUNT).fill(null);
    fifoQueue = [];
    lruQueue = [];

    // 初始化页表 (假设共有 8 页，0-7)
    pageTable = Array.from({ length: 8 }, (_, i) => ({ page: i, valid: 0, frame: -1 }));

    document.getElementById('faultCount').textContent = '0';
    document.getElementById('faultRate').textContent = '0%';
    document.getElementById('logList').innerHTML = '';
    historyTableBody.innerHTML = ''; // 清空历史记录表
    resetPipelineUI();

    renderFramesUI();
    renderTableUI();
    renderSequenceUI();

    nextBtn.disabled = false;
    autoBtn.disabled = false;
    accessBtn.disabled = false;
    autoBtn.textContent = '自动播放';
}

// 渲染物理块
function renderFramesUI() {
    const container = document.getElementById('framesContainer');
    container.innerHTML = '';
    for (let i = 0; i < FRAME_COUNT; i++) {
        const div = document.createElement('div');
        div.className = 'frame' + (frames[i] !== null ? ' filled' : '');
        div.id = `frame-${i}`;
        div.innerHTML = `<span class="block-id">块 ${i}</span><span class="page-num">${frames[i] !== null ? frames[i] : '空'}</span>`;
        container.appendChild(div);
    }
}

// 渲染页表
function renderTableUI() {
    const tbody = document.getElementById('pageTableBody');
    tbody.innerHTML = '';
    pageTable.forEach(row => {
        const tr = document.createElement('tr');
        tr.id = `page-row-${row.page}`;
        tr.innerHTML = `
            <td>${row.page}</td>
            <td style="color: ${row.valid ? '#16a34a' : '#dc2626'}; font-weight: bold;">${row.valid}</td>
            <td>${row.frame !== -1 ? row.frame : '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

// 渲染序列
function renderSequenceUI() {
    const container = document.getElementById('sequenceContainer');
    container.innerHTML = '';
    sequence.forEach((page, idx) => {
        const div = document.createElement('div');
        div.className = 'seq-item';
        div.id = `seq-${idx}`;
        div.textContent = page;
        container.appendChild(div);
    });
}

// 重置顶部流水线 UI
function resetPipelineUI() {
    document.querySelectorAll('.pipe-step').forEach(el => {
        el.classList.remove('active', 'page-fault');
    });
    document.querySelector('#step-logic .value').textContent = '-';
    document.querySelector('#step-split .value').textContent = '-';
    document.querySelector('#step-page .value').textContent = '-';
    document.querySelector('#step-physics .value').textContent = '-';
}

// 新增：把这一步的结果写入底部表格中
function appendHistoryTable(pageNum, isFault, changedFrameIndex) {
    const tr = document.createElement('tr');
    
    // 1. 状态列
    const statusTd = document.createElement('td');
    statusTd.textContent = isFault ? '缺页' : '命中';
    statusTd.className = isFault ? 'status-fault' : 'status-hit';

    // 2. 访问列
    const pageTd = document.createElement('td');
    pageTd.textContent = pageNum;
    pageTd.style.fontWeight = 'bold';
    pageTd.style.color = '#1e293b';

    tr.appendChild(pageTd);
    tr.appendChild(statusTd);

    // 3. 填入物理块的内容 (0~3)
    for (let i = 0; i < FRAME_COUNT; i++) {
        const td = document.createElement('td');
        td.textContent = frames[i] !== null ? frames[i] : '-';
        
        // 如果当前的物理块发生了变化（被新页面占用），加一个闪烁动画
        if (i === changedFrameIndex) {
            td.classList.add('cell-changed');
            td.style.fontWeight = 'bold';
            td.style.color = isFault ? '#dc2626' : '#16a34a';
        }
        tr.appendChild(td);
    }

    historyTableBody.appendChild(tr);
    
    // 自动滚动到表格底部
    const container = document.querySelector('.history-table-container');
    container.scrollTop = container.scrollHeight;
}

// ================= 核心：地址访问逻辑 =================
function accessAddress(logicAddr, isAuto = false) {
    if (logicAddr < 0 || logicAddr > 32767) {
        alert("逻辑地址范围限制在 0 ~ 32767 (8页)");
        return false;
    }

    const pageNum = Math.floor(logicAddr / PAGE_SIZE);
    const offset = logicAddr % PAGE_SIZE;

    resetPipelineUI();
    document.querySelector('#step-logic').classList.add('active');
    document.querySelector('#step-logic .value').textContent = logicAddr;

    document.querySelector('#step-split').classList.add('active');
    document.querySelector('#step-split .value').textContent = `页 ${pageNum} | 偏移 ${offset}`;

    document.querySelectorAll('tr').forEach(tr => tr.classList.remove('highlight'));
    document.getElementById(`page-row-${pageNum}`).classList.add('highlight');

    const algo = algorithmSelect.value;
    const pageData = pageTable[pageNum];
    
    let isFault = false;
    let changedFrameIndex = -1; // 记录哪个物理块发生了变化

    if (pageData.valid === 0) {
        isFault = true;
        pageFaults++;
        
        document.querySelector('#step-page').classList.add('active', 'page-fault');
        document.querySelector('#step-page .value').textContent = '缺页中断!';

        let frameIndex = frames.indexOf(null);
        
        if (frameIndex === -1) {
            let evictPage;
            if (algo === 'FIFO') {
                evictPage = fifoQueue.shift();
            } else {
                evictPage = lruQueue.shift();
            }
            frameIndex = frames.indexOf(evictPage);
            
            pageTable[evictPage].valid = 0;
            pageTable[evictPage].frame = -1;
            
            addLog(`<span class="log-fault">缺页中断</span>：内存满，使用 ${algo} 淘汰页 ${evictPage} (物理块 ${frameIndex})`, isAuto);
        } else {
            addLog(`<span class="log-fault">缺页中断</span>：物理块 ${frameIndex} 为空，直接装入页 ${pageNum}`, isAuto);
        }

        frames[frameIndex] = pageNum;
        pageTable[pageNum].valid = 1;
        pageTable[pageNum].frame = frameIndex;
        changedFrameIndex = frameIndex; // 记录变化

        if (algo === 'FIFO') fifoQueue.push(pageNum);
        else lruQueue.push(pageNum);

        const frameEl = document.getElementById(`frame-${frameIndex}`);
        frameEl.classList.remove('hit', 'fault');
        frameEl.offsetWidth;
        frameEl.classList.add('fault');
        
        const physicsAddr = frameIndex * PAGE_SIZE + offset;
        document.querySelector('#step-physics').classList.add('active');
        document.querySelector('#step-physics .value').textContent = physicsAddr;
        
    } else {
        const frameIndex = pageData.frame;
        changedFrameIndex = frameIndex; // 命中时，说明这个块被访问了
        
        document.querySelector('#step-page').classList.add('active');
        document.querySelector('#step-page .value').textContent = `命中 (块 ${frameIndex})`;

        if (algo === 'LRU') {
            lruQueue = lruQueue.filter(p => p !== pageNum);
            lruQueue.push(pageNum);
        }

        const frameEl = document.getElementById(`frame-${frameIndex}`);
        frameEl.classList.remove('hit', 'fault');
        frameEl.offsetWidth;
        frameEl.classList.add('hit');

        const physicsAddr = frameIndex * PAGE_SIZE + offset;
        document.querySelector('#step-physics').classList.add('active');
        document.querySelector('#step-physics .value').textContent = physicsAddr;

        addLog(`<span class="log-hit">地址命中</span>：逻辑地址 ${logicAddr} -> 物理地址 ${physicsAddr}`, isAuto);
    }

    // 🌟 调用方法，把这一步的结果记录到表格中
    appendHistoryTable(pageNum, isFault, changedFrameIndex);

    document.getElementById('faultCount').textContent = pageFaults;
    const totalAccess = isAuto ? (currentIndex + 1) : historyTableBody.children.length;
    if (totalAccess > 0) {
        document.getElementById('faultRate').textContent = ((pageFaults / totalAccess) * 100).toFixed(1) + '%';
    }

    renderFramesUI();
    renderTableUI();

    return isFault;
}

function addLog(html, isAuto) {
    const li = document.createElement('li');
    li.innerHTML = html;
    const list = document.getElementById('logList');
    list.insertBefore(li, list.firstChild);
    if (isAuto) return; 
}

// ================= 自动化序列执行 =================
function nextStep() {
    if (currentIndex >= sequence.length) {
        nextBtn.disabled = true;
        autoBtn.disabled = true;
        clearInterval(playTimer);
        return;
    }

    const pageNum = sequence[currentIndex];
    const randomOffset = Math.floor(Math.random() * PAGE_SIZE);
    const logicAddr = pageNum * PAGE_SIZE + randomOffset;

    document.querySelectorAll('.seq-item').forEach(el => el.classList.remove('current'));
    document.getElementById(`seq-${currentIndex}`).classList.add('current');
    if (currentIndex > 0) document.getElementById(`seq-${currentIndex - 1}`).classList.add('passed');

    accessAddress(logicAddr, true);
    
    currentIndex++;
    
    if (currentIndex >= sequence.length) {
        nextBtn.disabled = true;
        autoBtn.disabled = true;
        clearInterval(playTimer);
        autoBtn.textContent = '自动播放';
    }
}

startBtn.addEventListener('click', initSystem);
nextBtn.addEventListener('click', nextStep);

autoBtn.addEventListener('click', () => {
    if (isPlaying) {
        clearInterval(playTimer);
        isPlaying = false;
        autoBtn.textContent = '自动播放';
    } else {
        isPlaying = true;
        autoBtn.textContent = '暂停';
        playTimer = setInterval(nextStep, 1000);
    }
});

accessBtn.addEventListener('click', () => {
    const addr = parseInt(logicAddressInput.value);
    if (isNaN(addr)) return alert("请输入有效的数字地址");
    
    document.querySelectorAll('.seq-item').forEach(el => el.classList.remove('current', 'passed'));
    nextBtn.disabled = true;
    autoBtn.disabled = true;
    clearInterval(playTimer);
    isPlaying = false;
    autoBtn.textContent = '自动播放';
    
    accessAddress(addr, false);
});

window.addEventListener('DOMContentLoaded', initSystem);