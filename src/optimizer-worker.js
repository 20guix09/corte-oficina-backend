import { parentPort, workerData } from "node:worker_threads";
import { optimize } from "./engine.js";
try {
  parentPort.postMessage({
    type: "corte:result",
    result: optimize(workerData),
  });
} catch (error) {
  parentPort.postMessage({
    type: "corte:error",
    error: error.message || "Falha ao calcular o plano.",
  });
}
