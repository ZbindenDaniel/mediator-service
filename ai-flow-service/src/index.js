import { buildServer } from './api.js';
import { getMcpClient } from '../src/utils/mcpClient.js';
import { startNotificationWorker } from './notificationWorker.js';

const port = Number(process.env.PORT || 3000);

const server = await buildServer();

const { client } = await getMcpClient();
const { tools } = await client.listTools();
console.log('MCP tools:', tools?.map(t => t.name));

await server.listen({ port, host: '0.0.0.0' });
server.log.info({ msg: `API listening on :${port}` });

startNotificationWorker();

