import { process_init } from './common/utils/process_init';
process_init();

import os from 'os';
import Koa from 'koa';
import http from 'http';

import { logger } from '@common/utils';
import { handleRouter } from './helpers/http';
import { logger as reqLogger, cors, body, realIp } from '@middlewares/index';
import { PORT } from '@config/env';
import apiRoutes from '@routes/api.routes';
import healthRoutes from '@routes/health.routes';
import { createWsServer } from './wsapi';

const app = new Koa();

app.keys = ['6fd1de93-812b-4e3a-a4b6-b04d8136a8da'];

app.use(reqLogger({ server: 'api' }));

app.use(realIp());

app.use(body());

app.use(cors());

app.use(handleRouter([ ...apiRoutes, ...healthRoutes ], 'api').routes());

const server = http.createServer(app.callback());
server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 125 * 1000;

const wss = createWsServer(server);

server.listen(PORT, 65535, () => {
  logger.info(`api server start, hostname: ${os.hostname()}, port: ${PORT}`);
});
