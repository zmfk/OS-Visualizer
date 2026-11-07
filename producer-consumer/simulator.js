// 信号量类：用 async/await 模拟 P/V 操作
class Semaphore {
  constructor(initial) {
    this.count = initial;
    this.waiters = [];
    this.destroyed = false;
  }
  async wait() {
    if (this.destroyed) throw new Error('semaphore destroyed');
    while (this.count <= 0) {
      if (this.destroyed) throw new Error('semaphore destroyed');
      await new Promise((resolve, reject) => {
        this.waiters.push({ resolve, reject });
      });
      if (this.destroyed) throw new Error('semaphore destroyed');
    }
    this.count--;
  }
  release() {
    if (this.destroyed) return;
    this.count++;
    if (this.waiters.length > 0) {
      const w = this.waiters.shift();
      w.resolve();
    }
  }
  destroy() {
    this.destroyed = true;
    while (this.waiters.length > 0) {
      const w = this.waiters.shift();
      w.reject(new Error('semaphore destroyed'));
    }
  }
}

function createState(capacity) {
  return {
    capacity,
    buffer: new Array(capacity).fill(null),
    productNumber: 0,
    nextProductId: 1, 
    producePointer: 0,
    consumerPointer: 0,
    empty: new Semaphore(capacity),
    full: new Semaphore(0),
    mutex: new Semaphore(1),
  };
}

let currentState = null;
let currentGen = 0;
let running = false;
let paused = false;
let speedFactor = 1;

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitIfPaused(gen) {
  while (paused && running && gen === currentGen) { await delay(50); }
}

async function sleepWithPause(ms, gen) {
  const step = 50;
  let elapsed = 0;
  while (elapsed < ms && running && gen === currentGen) {
    await waitIfPaused(gen);
    const d = Math.min(step, ms - elapsed);
    await delay(d);
    elapsed += d;
  }
}

async function producerLoop(st, gen) {
  try {
    while (running && gen === currentGen) {
      await waitIfPaused(gen);
      if (!running || gen !== currentGen) break;

      if (currentState === st) setProducerStatus('阻塞：等待空缓冲区 (P empty)', true);
      await st.empty.wait();
      if (!running || gen !== currentGen) break;

      if (currentState === st) setProducerStatus('等待互斥量 (P mutex)', false);
      await st.mutex.wait();
      if (!running || gen !== currentGen) break;

      if (currentState === st) setProducerStatus('正在生产（临界区）', false);

      st.producePointer = (st.producePointer + 1) % st.capacity;
      const productId = st.nextProductId++; 
      st.buffer[st.producePointer] = productId;
      st.productNumber++;

      if (currentState === st) {
        renderBuffer(st);
        updateSemaphores(st);
        addLog(`生产者写入位置 ${st.producePointer}，产品 ${productId}，当前产品数 ${st.productNumber}`);
      }

      st.mutex.release();
      st.full.release();

      if (currentState === st) {
        setProducerStatus('生产完成，休眠中', false);
        updateSemaphores(st);
      }
      await sleepWithPause(500 / speedFactor, gen);
    }
  } catch (e) {}
  if (currentState === st) setProducerStatus('已停止', false);
}

async function consumerLoop(st, gen) {
  try {
    while (running && gen === currentGen) {
      await waitIfPaused(gen);
      if (!running || gen !== currentGen) break;

      if (currentState === st) setConsumerStatus('阻塞：等待产品 (P full)', true);
      await st.full.wait();
      if (!running || gen !== currentGen) break;

      if (currentState === st) setConsumerStatus('等待互斥量 (P mutex)', false);
      await st.mutex.wait();
      if (!running || gen !== currentGen) break;

      if (currentState === st) setConsumerStatus('正在消费（临界区）', false);

      st.consumerPointer = (st.consumerPointer + 1) % st.capacity;
      const item = st.buffer[st.consumerPointer];
      st.buffer[st.consumerPointer] = null;
      st.productNumber--;

      if (currentState === st) {
        renderBuffer(st);
        updateSemaphores(st);
        addLog(`消费者取出位置 ${st.consumerPointer}，产品 ${item}，当前产品数 ${st.productNumber}`);
      }

      st.mutex.release();
      st.empty.release();

      if (currentState === st) {
        setConsumerStatus('消费完成，休眠中', false);
        updateSemaphores(st);
      }
      await sleepWithPause(1000 / speedFactor, gen);
    }
  } catch (e) {}
  if (currentState === st) setConsumerStatus('已停止', false);
}