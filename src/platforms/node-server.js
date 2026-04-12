import { createApp } from '../app/createApp.jsx';
import { createNodeRuntime } from '../runtime/node.js';
import { startNodeHttpServer } from './nodeHttpServer.js';
import { AggregatorScheduler } from '../services/aggregatorScheduler.js';

const runtime = createNodeRuntime(process.env);
const app = createApp(runtime);
const port = Number(process.env.PORT || 8787);

startNodeHttpServer(app, { port, logger: runtime.logger });

// 启动后台聚合器定时刷新（每 60 秒扫描一次）
if (runtime.kv) {
    const scheduler = new AggregatorScheduler(runtime.kv, runtime.logger);
    const scanInterval = Number(process.env.AGG_SCAN_INTERVAL_MS) || 60_000;
    scheduler.startInterval(scanInterval);
}
