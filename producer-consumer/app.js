const capacityInput = document.getElementById('capacityInput');
const resetBtn = document.getElementById('resetBtn');
const pauseBtn = document.getElementById('pauseBtn');
const speedInput = document.getElementById('speedInput');
const speedValue = document.getElementById('speedValue');
const emptyCountEl = document.getElementById('emptyCount');
const fullCountEl = document.getElementById('fullCount');
const mutexCountEl = document.getElementById('mutexCount');
const producerStatusEl = document.getElementById('producerStatus');
const consumerStatusEl = document.getElementById('consumerStatus');
const bufferRing = document.getElementById('bufferRing');
const ringCenter = document.getElementById('ringCenter');
const logList = document.getElementById('logList');

function setProducerStatus(text, isBlocked = false) {
  producerStatusEl.textContent = text;
  const card = document.getElementById('producerCard');
  if (isBlocked) card.classList.add('blocked');
  else card.classList.remove('blocked');
}

function setConsumerStatus(text, isBlocked = false) {
  consumerStatusEl.textContent = text;
  const card = document.getElementById('consumerCard');
  if (isBlocked) card.classList.add('blocked');
  else card.classList.remove('blocked');
}

function renderBuffer(st) {
  bufferRing.innerHTML = '';
  bufferRing.appendChild(ringCenter);

  if (st.productNumber === st.capacity) {
    ringCenter.textContent = '缓冲区已满';
    ringCenter.style.color = '#ef4444';
    ringCenter.style.borderColor = '#fca5a5';
  } else if (st.productNumber === 0) {
    ringCenter.textContent = '缓冲区已空';
    ringCenter.style.color = '#2563eb';
    ringCenter.style.borderColor = '#93c5fd';
  } else {
    ringCenter.textContent = `当前库存: ${st.productNumber}`;
    ringCenter.style.color = '#1e293b';
    ringCenter.style.borderColor = '#e2e8f0';
  }

  const radius = 180; 
  const total = st.capacity;

  for (let i = 0; i < total; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    if (st.buffer[i] !== null) slot.classList.add('filled');
    if (i === st.producePointer) slot.classList.add('producer-pointer');
    if (i === st.consumerPointer) slot.classList.add('consumer-pointer');

    const angle = (i / total) * 2 * Math.PI - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    slot.style.left = `calc(50% + ${x}px)`;
    slot.style.top = `calc(50% + ${y}px)`;

    const indexSpan = document.createElement('span');
    indexSpan.className = 'index';
    indexSpan.textContent = i;
    slot.appendChild(indexSpan);

    if (st.buffer[i] !== null) {
      slot.appendChild(document.createTextNode(st.buffer[i]));
    }
    
    bufferRing.appendChild(slot);
  }
}

function updateSemaphores(st) {
  emptyCountEl.textContent = st.empty.count;
  fullCountEl.textContent = st.full.count;
  mutexCountEl.textContent = st.mutex.count;
}

function addLog(message) {
  const li = document.createElement('li');
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  li.textContent = `[${time}] ${message}`;
  logList.appendChild(li);
  while (logList.children.length > 100) {
    logList.removeChild(logList.firstChild);
  }
  logList.scrollTop = logList.scrollHeight;
}

function updateAll(st) {
  renderBuffer(st);
  updateSemaphores(st);
}

function stopSimulation() {
  running = false;
  paused = false;
  currentGen++;
  if (currentState) {
    currentState.empty.destroy();
    currentState.full.destroy();
    currentState.mutex.destroy();
    currentState = null;
  }
  pauseBtn.textContent = '暂停';
  setProducerStatus('已停止', false);
  setConsumerStatus('已停止', false);
}

function resetSimulation() {
  stopSimulation();

  let cap = parseInt(capacityInput.value, 10);
  if (isNaN(cap) || cap < 1) cap = 12;
  cap = Math.min(cap, 30); 
  capacityInput.value = cap;

  currentState = createState(cap);
  currentGen++;
  logList.innerHTML = '';
  updateAll(currentState);
  setProducerStatus('准备就绪', false);
  setConsumerStatus('准备就绪', false);

  running = true;
  paused = false;
  const gen = currentGen;
  const st = currentState;
  pauseBtn.textContent = '暂停';
  producerLoop(st, gen);
  consumerLoop(st, gen);
}

resetBtn.addEventListener('click', resetSimulation);

pauseBtn.addEventListener('click', () => {
  if (!running) return;
  paused = !paused;
  pauseBtn.textContent = paused ? '继续' : '暂停';
});

speedInput.addEventListener('input', () => {
  speedFactor = parseFloat(speedInput.value);
  speedValue.textContent = speedFactor + 'x';
});

window.addEventListener('DOMContentLoaded', () => {
  resetSimulation();
});