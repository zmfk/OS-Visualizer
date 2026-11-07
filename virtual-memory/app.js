const PAGE_SIZE = 4096;
const FRAME_COUNT = 4;
const sequence = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];

let frames = new Array(FRAME_COUNT).fill(null); 
let pageTable = []; 
let pageFaults = 0;
let currentIndex = 0;
let isPlaying = false;
let playTimer = null;
let fifoQueue = [];
let lruQueue = [];

const algorithmSelect = document.getElementById('algorithmSelect');
const startBtn = document.getElementById('startBtn');
const nextBtn = document.getElementById('nextBtn');
const autoBtn = document.getElementById('autoBtn');
const accessBtn = document.getElementById('accessBtn');
const logicAddressInput = document.getElementById('logicAddressInput');
const historyTableBody = document.getElementById('historyTableBody');

function initSystem() {
    clearInterval(playTimer);
    isPlaying = false;
    currentIndex = 0;
    pageFaults = 0;
    frames = new Array(FRAME_COUNT).fill(null);
    fifoQueue = [];
    lruQueue = [];

    pageTable = Array.from({ length: 8 }, (_, i) => ({ page: i, valid: 0, frame: -1 }));

    document.getElementById('faultCount').textContent = '0';
    document.getElementById('faultRate').textContent = '0%';
    document.getElementById('logList').innerHTML = '';
    historyTableBody.innerHTML = ''; 
    resetPipelineUI();

    renderFramesUI();
    renderTableUI();
    renderSequenceUI();

    nextBtn.disabled = false;
    autoBtn.disabled = false;
    accessBtn.disabled = false;
    autoBtn.textContent = '自动播放';
}

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

function resetPipelineUI() {
    document.querySelectorAll('.pipe-step').forEach(el => {
        el.classList.remove('active', 'page-fault');
    });
    document.querySelector('#step-logic .value').textContent = '-';
    document.querySelector('#step-split .value').textContent = '-';
    document.querySelector('#step-page .value').textContent = '-';
    document.querySelector('#step-physics .value').textContent = '-';
}

function appendHistoryTable(pageNum, isFault, changedFrameIndex) {
    const tr = document.createElement('tr');
    
    const statusTd = document.createElement('td');
    statusTd.textContent = isFault ? '缺页' : '命中';
    statusTd.className = isFault ? 'status-fault' : 'status-hit';

    const pageTd = document.createElement('td');
    pageTd.textContent = pageNum;
    pageTd.style.fontWeight = 'bold';
    pageTd.style.color = '#1e293b';

    tr.appendChild(pageTd);
    tr.appendChild(statusTd);

    for (let i = 0; i < FRAME_COUNT; i++) {
        const td = document.createElement('td');
        td.textContent = frames[i] !== null ? frames[i] : '-';
        if (i === changedFrameIndex) {
            td.classList.add(isFault ? 'td-fault' : 'td-hit');
        }
        tr.appendChild(td);
    }

    historyTableBody.appendChild(tr);
    
    const container = document.querySelector('.history-table-container');
    container.scrollTop = container.scrollHeight;
}

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
    let changedFrameIndex = -1;

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
        changedFrameIndex = frameIndex;

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
        changedFrameIndex = frameIndex;
        
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