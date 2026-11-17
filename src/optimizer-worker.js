import { parentPort, workerData } from "node:worker_threads";
import { optimize } from "./engine.js";
try {
  parentPort.postMessage({ result: optimize(workerData) });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
