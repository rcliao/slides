import type { Plugin, ViteDevServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { parseSlides } from './parser.js';

const VIRTUAL_MODULE_ID = 'virtual:slides-data';
const RESOLVED_ID = '\0' + VIRTUAL_MODULE_ID;

export function slidesPlugin(options: { file: string; live?: boolean }): Plugin {
  let filePath: string;
  let server: ViteDevServer | undefined;

  return {
    name: 'vite-plugin-slides',

    configResolved() {
      filePath = path.resolve(options.file);
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_ID;
    },

    load(id) {
      if (id === RESOLVED_ID) {
        const markdown = fs.readFileSync(filePath, 'utf-8');
        const data = parseSlides(markdown);
        return `export default ${JSON.stringify({ ...data, live: !!options.live })}`;
      }
    },

    configureServer(srv) {
      server = srv;

      // Watch the markdown file for changes
      server.watcher.add(filePath);
      server.watcher.on('change', (changed) => {
        if (path.resolve(changed) === filePath) {
          const mod = server!.moduleGraph.getModuleById(RESOLVED_ID);
          if (mod) {
            server!.moduleGraph.invalidateModule(mod);
          }
          server!.ws.send({ type: 'full-reload' });
        }
      });

      // Set up WebSocket server for live sync
      if (options.live && srv.httpServer) {
        setupLiveSync(srv);
      }
    },
  };
}

function setupLiveSync(srv: ViteDevServer) {
  // Dynamic import ws (server-side only)
  import('ws').then(({ WebSocketServer, WebSocket: WS }) => {
    const wss = new WebSocketServer({ noServer: true });

    type ClientInfo = { role: 'presenter' | 'audience' };
    const clients = new Map<InstanceType<typeof WS>, ClientInfo>();
    let presenterState = { slide: 0, step: 0 };

    srv.httpServer!.on('upgrade', (req, socket, head) => {
      if (req.url === '/live-ws') {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
        });
      }
    });

    wss.on('connection', (ws) => {
      clients.set(ws, { role: 'audience' });

      // Send current state to new connections
      ws.send(JSON.stringify({
        type: 'state',
        ...presenterState,
        audienceCount: countAudience(),
      }));

      // Broadcast updated audience count
      broadcastAudienceCount();

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          switch (msg.type) {
            case 'presenter-join':
              clients.set(ws, { role: 'presenter' });
              broadcastAudienceCount();
              break;

            case 'slide':
              presenterState = { slide: msg.slide, step: msg.step };
              // Broadcast to all audience members
              for (const [client, info] of clients) {
                if (client !== ws && info.role === 'audience' && client.readyState === WS.OPEN) {
                  client.send(JSON.stringify({ type: 'slide', ...presenterState }));
                }
              }
              break;

            case 'reaction':
              // Broadcast reaction to everyone
              for (const [client] of clients) {
                if (client.readyState === WS.OPEN) {
                  client.send(JSON.stringify({ type: 'reaction', emoji: msg.emoji }));
                }
              }
              break;
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on('close', () => {
        clients.delete(ws);
        broadcastAudienceCount();
      });
    });

    function countAudience(): number {
      let count = 0;
      for (const [, info] of clients) {
        if (info.role === 'audience') count++;
      }
      return count;
    }

    function broadcastAudienceCount() {
      const count = countAudience();
      for (const [client] of clients) {
        if (client.readyState === WS.OPEN) {
          client.send(JSON.stringify({ type: 'audience-count', count }));
        }
      }
    }

    console.log('  Live sync: WebSocket server ready on /live-ws');
  });
}
