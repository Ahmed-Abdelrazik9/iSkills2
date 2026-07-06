const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const proxy = require('express-http-proxy');

require('module-alias')({ base: path.resolve(__dirname, '..') });
const cors = require('cors');
const axios = require('axios');
const express = require('express');
const passport = require('passport');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { logger } = require('@librechat/data-schemas');
const mongoSanitize = require('express-mongo-sanitize');
const { isEnabled, ErrorController } = require('@librechat/api');
const { connectDb, indexSync } = require('~/db');
const initializeOAuthReconnectManager = require('./services/initializeOAuthReconnectManager');
const createValidateImageRequest = require('./middleware/validateImageRequest');
const { jwtLogin, ldapLogin, passportLogin } = require('~/strategies');
const { updateInterfacePermissions } = require('~/models/interface');
const { checkMigrations } = require('./services/start/migration');
const initializeMCPs = require('./services/initializeMCPs');
const { startScheduler: startModelSync } = require('./services/modelSyncScheduler');
const { startDailyScheduler } = require('./services/dailyScheduler');
const { syncGoogleDirectModels } = require('./services/googleDirectSync');
const configureSocialLogins = require('./socialLogins');
const { getAppConfig } = require('./services/Config');
const staticCache = require('./utils/staticCache');
const noIndex = require('./middleware/noIndex');
const { seedDatabase } = require('~/models');
const {
  PORT,
  HOST,
  ALLOW_SOCIAL_LOGIN,
  DISABLE_COMPRESSION,
  TRUST_PROXY,
  MONGO_URI: RAW_MONGO_URI,
} = process.env ?? {};

// SANITIZE: Remove literal quotes from MONGO_URI (common paste error in Dashboard)
const MONGO_URI = RAW_MONGO_URI ? RAW_MONGO_URI.replace(/^["'](.+)["']$/, '$1') : undefined;
if (RAW_MONGO_URI !== MONGO_URI) {
  process.env.MONGO_URI = MONGO_URI;
  logger.info('💎 [Maveric-Boot] MONGO_URI sanitized (quotes removed)');
}

// Allow PORT=0 to be used for automatic free port assignment
const port = isNaN(Number(PORT)) ? 3090 : Number(PORT);
// Railway requires binding to 0.0.0.0 to accept external connections
// localhost only accepts local connections, causing 502 errors
const host = HOST || '0.0.0.0';
const trusted_proxy = Number(TRUST_PROXY) || 1; /* trust first proxy by default */

logger.info(
  `💎 [Maveric-Boot] Architecture: AGENT_CONTROLLER_SYNC | Port: ${port} | Host: ${host}`,
);

// KEY-SYNC: Ensure OpenRouter keys are synchronized across naming variations
const orKey =
  process.env.OPENROUTER_KEY ||
  process.env.OPENROUTER_API_KEY ||
  process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
if (orKey) {
  if (!process.env.OPENROUTER_KEY) {
    process.env.OPENROUTER_KEY = orKey;
    logger.info('💎 [Maveric-Boot] Key Sync: OPENROUTER_KEY set from existing OpenRouter key');
  }
  if (!process.env.OPENROUTER_API_KEY) {
    process.env.OPENROUTER_API_KEY = orKey;
    logger.info('💎 [Maveric-Boot] Key Sync: OPENROUTER_API_KEY set from existing OpenRouter key');
  }
  if (!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY) {
    process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY = orKey;
    logger.info(
      '💎 [Maveric-Boot] Key Sync: AI_INTEGRATIONS_OPENROUTER_API_KEY set from existing OpenRouter key',
    );
  }
}

// JWT-SYNC: Ensure WEBSOCKET_JWT_SECRET matches JWT_SECRET for iNexus WebSocket
if (process.env.JWT_SECRET && !process.env.WEBSOCKET_JWT_SECRET) {
  process.env.WEBSOCKET_JWT_SECRET = process.env.JWT_SECRET;
  logger.info('💎 [Maveric-Boot] JWT Sync: WEBSOCKET_JWT_SECRET set from JWT_SECRET');
}

// Crash visibility
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Maveric-Crash] Unhandled Rejection:', reason);
  logger.error('[Maveric-Crash] Unhandled Rejection:', reason);
});

const routes = require('./routes');

const app = express();

const startServer = async () => {
  if (typeof Bun !== 'undefined') {
    axios.defaults.headers.common['Accept-Encoding'] = 'gzip';
  }
  await connectDb();

  logger.info('Connected to MongoDB');
  indexSync().catch((err) => {
    logger.error('[indexSync] Background sync failed:', err);
  });

  app.disable('x-powered-by');
  app.set('trust proxy', trusted_proxy);

  await seedDatabase();

  const appConfig = await getAppConfig();
  await updateInterfacePermissions(appConfig);
  const indexPath = path.join(appConfig.paths.dist, 'index.html');
  let indexHTML = '<!DOCTYPE html><html><body><div id="root"></div></body></html>';
  try {
    if (fs.existsSync(indexPath)) {
      indexHTML = fs.readFileSync(indexPath, 'utf8');
    } else if (process.env.NODE_ENV !== 'development') {
      logger.error(`Critical error: index.html not found at ${indexPath}`);
      // In production, we might want to exit or provide a more helpful error
    } else {
      logger.warn(`Development mode: index.html not found at ${indexPath}. Using fallback.`);
    }
  } catch (err) {
    logger.error(`Error reading index.html: ${err.message}`);
  }

  // In order to provide support to serving the application in a sub-directory
  // We need to update the base href if the DOMAIN_CLIENT is specified and not the root path
  if (process.env.DOMAIN_CLIENT) {
    try {
      const clientUrl = new URL(process.env.DOMAIN_CLIENT);
      const baseHref = clientUrl.pathname.endsWith('/')
        ? clientUrl.pathname
        : `${clientUrl.pathname}/`;
      if (baseHref !== '/') {
        logger.info(`Setting base href to ${baseHref}`);
        indexHTML = indexHTML.replace(/base href="\/"/, `base href="${baseHref}"`);
      }
    } catch (err) {
      logger.error(
        `💎 [Maveric-Boot] Invalid DOMAIN_CLIENT: ${process.env.DOMAIN_CLIENT}. Ensure it includes protocol (e.g. https://)`,
      );
    }
  }

  /* Middleware */
  app.use(noIndex);
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(mongoSanitize());
  app.use(
    cors({
      origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Allow localhost:3000 (iAnatomy standalone app)
        if (origin === 'http://localhost:3000') return callback(null, true);

        // Allow configured DOMAIN_CLIENT
        if (process.env.DOMAIN_CLIENT && origin === process.env.DOMAIN_CLIENT) {
          return callback(null, true);
        }

        // Allow all origins if DOMAIN_CLIENT is not set (development mode)
        if (!process.env.DOMAIN_CLIENT) return callback(null, true);

        // Otherwise allow (for backward compatibility)
        callback(null, true);
      },
      credentials: true,
    }),
  );

  // Enhanced health check endpoint for 24/7 availability
  app.get('/health', async (_req, res) => {
    try {
      const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
      };

      // Quick MongoDB check (non-blocking)
      try {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState === 1) {
          health.database = 'connected';
        } else {
          health.database = 'disconnected';
          health.status = 'degraded';
        }
      } catch (dbError) {
        health.database = 'error';
        health.status = 'degraded';
      }

      const statusCode = health.status === 'ok' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    }
  });

  // Readiness endpoint (for Railway health checks)
  app.get('/ready', async (_req, res) => {
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1) {
        res.status(200).json({ ready: true, timestamp: new Date().toISOString() });
      } else {
        res.status(503).json({ ready: false, timestamp: new Date().toISOString() });
      }
    } catch (error) {
      res.status(503).json({ ready: false, error: error.message });
    }
  });

  // Production Health Check
  app.get(['/healthz', '/api/healthz'], (req, res) => res.status(200).send('OK'));
  app.use(cookieParser());

  if (!isEnabled(DISABLE_COMPRESSION)) {
    app.use(compression());
  } else {
    const SILENT_MODE = process.env.SILENT_MODE === 'true';
    if (!SILENT_MODE) {
      console.warn('Response compression has been disabled via DISABLE_COMPRESSION.');
    }
  }

  // SSE Flush Middleware: Prevents buffering of streaming responses (iSpeed, iMed, etc.) in production
  app.use((req, res, next) => {
    const originalWrite = res.write;
    res.write = function (chunk, encoding, callback) {
      const result = originalWrite.call(this, chunk, encoding, callback);
      if (
        res.getHeader('Content-Type') === 'text/event-stream' &&
        typeof res.flush === 'function'
      ) {
        res.flush();
      }
      return result;
    };
    next();
  });

  app.use(staticCache(appConfig.paths.dist));
  app.use(staticCache(appConfig.paths.fonts));
  app.use(staticCache(appConfig.paths.assets));

  // IStudio (WaveSpeed) portal — only mount if dist-web was built
  const studioDistPath = path.resolve(__dirname, '../../wavespeed-desktop-fork/dist-web');
  const studioIndexPath = path.join(studioDistPath, 'index.html');
  if (fs.existsSync(studioIndexPath)) {
    app.use('/studio', express.static(studioDistPath));
    app.get('/studio/*', (req, res) => {
      res.sendFile(studioIndexPath);
    });
    console.log('[IStudio] ✅ dist-web found — /studio route active');
  } else {
    console.warn('[IStudio] ⚠️  dist-web/index.html not found — /studio will return 503');
    app.use('/studio', (req, res) => {
      res
        .status(503)
        .send(
          '<html><body style="background:#0d0d0d;color:#aaa;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>IStudio is not available on this deployment.</p></body></html>',
        );
    });
  }

  if (!ALLOW_SOCIAL_LOGIN) {
    const SILENT_MODE = process.env.SILENT_MODE === 'true';
    if (!SILENT_MODE) {
      console.warn('Social logins are disabled. Set ALLOW_SOCIAL_LOGIN=true to enable them.');
    }
  }

  /* OAUTH */
  app.use(passport.initialize());
  passport.use(jwtLogin());
  passport.use(passportLogin());

  /* LDAP Auth */
  if (process.env.LDAP_URL && process.env.LDAP_USER_SEARCH_BASE) {
    passport.use(ldapLogin);
  }

  if (isEnabled(ALLOW_SOCIAL_LOGIN)) {
    await configureSocialLogins(app);
  }

  app.use('/oauth', routes.oauth);
  /* API Endpoints */
  app.use('/api/auth', routes.auth);
  app.use('/api/actions', routes.actions);
  app.use('/api/keys', routes.keys);
  app.use('/api/user', routes.user);
  app.use('/api/admin', routes.admin);
  app.use('/api/search', routes.search);
  app.use('/api/edit', routes.edit);
  app.use('/api/messages', routes.messages);
  app.use('/api/convos', routes.convos);
  app.use('/api/presets', routes.presets);
  app.use('/api/prompts', routes.prompts);
  app.use('/api/categories', routes.categories);
  app.use('/api/tokenizer', routes.tokenizer);
  app.use('/api/endpoints', routes.endpoints);
  app.use('/api/balance', routes.balance);
  app.use('/api/models', routes.models);
  app.use('/api/plugins', routes.plugins);
  app.use('/api/config', routes.config);
  app.use('/api/assistants', routes.assistants);
  app.use('/api/files', await routes.files.initialize());
  app.use('/images/', createValidateImageRequest(appConfig.secureImageLinks), routes.staticRoute);
  app.use('/api/share', routes.share);
  app.use('/api/roles', routes.roles);
  app.use('/api/user-projects', routes.userProjects);

  app.use('/api/agents', routes.agents);
  app.use('/api/banner', routes.banner);
  app.use('/api/memories', routes.memories);
  app.use('/api/permissions', routes.accessPermissions);
  app.use('/api/favorites', require('~/routes/favorites'));
  app.use('/api/openrouter-rankings', routes.openrouterRankings);

  app.use('/api/tags', routes.tags);
  app.use('/api/mcp', routes.mcp);
  app.use('/api/translate', routes.translate);
  app.use('/api/brief', routes.brief);
  app.use('/api/pollinations', routes.pollinations);
  app.use('/api/maveric', routes.maveric);
  app.use('/api/maveric/auth/google', routes.mavericAuth);
  app.use('/api/invitations', routes.invitations);
  app.use('/api/diagnostics', routes.diagnostics);
  app.use('/api/powerpoint', routes.powerpoint);
  app.use('/api/artifacts', routes.artifacts);

  app.use('/api/studio', routes.studio);

  app.use('/api/google-web-search', routes.googleWebSearch);
  app.use('/api/webintel', routes.webIntel);
  app.use('/api/fusion', routes.fusion);
  app.use('/api/history', routes.history);
  app.use('/api/notes', routes.notes);
  app.use('/api/search-intelligence', routes.searchIntelligence);
  app.use('/api/model-sync', routes.modelSync);
  app.use('/api/gallery', routes.gallery);
  app.use('/api/vault', routes.vault);
  app.use('/api/ws-bridge', routes.wsBridge);
  app.use('/api/ddg-bridge', routes.ddgBridge);
  app.use('/api/duckduckgo-web-search', routes.duckDuckGoWebSearch);
  app.use('/api/enhance', routes.enhance);
  app.use('/api/deep-research', routes.deepResearch);
  app.use('/api/imed', routes.imed);
  app.use('/api/ispace', routes.ispace);
  app.use('/api/iclinic', routes.iclinic);
  app.use('/api/isketch', routes.isketch);
  app.use('/api/illustrate', routes.illustrate);
  app.use('/api/ianatomy', routes.ianatomy);
  app.use('/api/irota', routes.irota);
  app.use('/api/ireminder', routes.ireminder);

  app.use('/api/maveric/gemini', routes.mavericGemini);
  app.use('/api/maveric/qwen', routes.mavericQwen);
  app.use('/api/maveric/fire-red', routes.mavericFireRed);
  app.use('/api/maveric/istudy2', routes.mavericIStudy2);
  app.use('/api/maveric/iexam', routes.mavericIExam);
  app.use('/api/maveric/ithink', routes.mavericIThink);
  app.use('/api/maveric/graph', routes.mavericGraph);
  app.use('/api/maveric/pdf', routes.mavericPdf);
  app.use('/api/inexus', routes.inexus);
  app.use('/api/neural-sync', routes.neuralSync);

  // Integrated Agent-OS (Unified Mode) - Active in Production/Render only
  // Locals use separate processes for hot-reloading (see package.json "dev")
  const isProduction = process.env.NODE_ENV === 'production';
  const { pathToFileURL } = require('url');
  const agentOsPath = path.resolve(__dirname, '../../agent-os/artifacts/api-server/dist/index.mjs');

  if (isProduction) {
    // Inject required Agent-OS environment variables before loading the bundle
    process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL =
      process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY =
      process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY ||
      process.env.OPENROUTER_KEY ||
      process.env.OPENROUTER_API_KEY;
    process.env.AGENT_OS_STANDALONE = 'false';

    logger.info(`🔍 [Maveric-Boot] Checking for Agent-OS at: ${agentOsPath}`);
    if (fs.existsSync(agentOsPath)) {
      try {
        const stats = fs.statSync(agentOsPath);
        logger.info(
          `📦 [Maveric-Boot] Found Agent-OS bundle (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
        );

        // Use pathToFileURL to ensure valid file:/// URI for the dynamic import
        const agentOsUrl = pathToFileURL(agentOsPath).href;
        const { app: agentOsApp } = await import(agentOsUrl);

        app.use('/api/agent-os', (req, res, next) => {
          const originalUrl = req.url;
          req.url = '/api' + (originalUrl.startsWith('/') ? originalUrl : '/' + originalUrl);
          agentOsApp(req, res, next);
        });
        logger.info(
          '💎 [Maveric-Boot] iSpeed Integrated: /api/agent-os mounted directly (Unified Mode)',
        );
      } catch (err) {
        logger.error('❌ [Maveric-Boot] Failed to integrate Agent-OS:', err);
      }
    } else {
      logger.error(
        `❌ [Maveric-Boot] Agent-OS build NOT found. Checked path: ${agentOsPath}. Current dir: ${process.cwd()}`,
      );
      // Fallback list of root files to help debug
      try {
        const rootFiles = fs.readdirSync(path.resolve(__dirname, '../../'));
        logger.info(`📂 [Maveric-Boot] Root directory contents: ${rootFiles.join(', ')}`);
      } catch (e) {
        /* ignore */
      }
    }
  } else {
    // Fallback to Proxy (required for Local Dev)

    const agentOsUrl = process.env.AGENT_OS_URL || 'http://127.0.0.1:3001';
    logger.info(`💎 [Maveric-Boot] iSpeed Proxy: /api/agent-os -> ${agentOsUrl}`);

    app.use(
      '/api/agent-os',
      proxy(agentOsUrl, {
        proxyReqPathResolver: (req) => {
          return '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
        },
        proxyTimeout: 300000,
        timeout: 300000,
        proxyErrorHandler: (err, res, next) => {
          if (isProduction)
            logger.error(`[iSpeed-Proxy] Error reaching Agent-OS at ${agentOsUrl}:`, err.message);
          res.status(502).json({ error: 'iSpeed service is currently unavailable.' });
        },
      }),
    );
  }

  // ── iSkills2 integration ───────────────────────────────────────────────────
  if (!process.env.ISKILLS2_DATABASE_URL && process.env.DATABASE_URL) {
    process.env.ISKILLS2_DATABASE_URL = process.env.DATABASE_URL;
    logger.info('💎 [Maveric-Boot] iSkills2: ISKILLS2_DATABASE_URL set from DATABASE_URL');
  }
  if (!process.env.ISKILLS2_JWT_SECRET && process.env.JWT_SECRET) {
    process.env.ISKILLS2_JWT_SECRET = process.env.JWT_SECRET;
    logger.info('💎 [Maveric-Boot] iSkills2: ISKILLS2_JWT_SECRET set from JWT_SECRET');
  }

  const iskills2RouterPath = path.resolve(__dirname, '../../iskills2-built/iskills2-router.mjs');
  const iskills2PublicPath = path.resolve(__dirname, '../../iskills2-built/public');
  if (fs.existsSync(iskills2RouterPath) && fs.existsSync(iskills2PublicPath)) {
    try {
      const { pathToFileURL } = require('url');
      const { default: iskills2Router } = await import(pathToFileURL(iskills2RouterPath).href);
      app.use('/api/iskills2', iskills2Router);
      app.use('/iskills2', express.static(iskills2PublicPath));
      app.get('/iskills2/*', (req, res) => {
        res.sendFile(path.join(iskills2PublicPath, 'index.html'));
      });
      logger.info('💎 [Maveric-Boot] iSkills2 integrated: /api/iskills2 + /iskills2');
    } catch (err) {
      logger.error('❌ [Maveric-Boot] Failed to integrate iSkills2:', err);
    }
  } else {
    logger.warn(
      `⚠️ [Maveric-Boot] iSkills2 build not found. Checked: ${iskills2RouterPath}, ${iskills2PublicPath}`,
    );
  }

  app.use(ErrorController);

  app.use((req, res) => {
    res.set({
      'Cache-Control': process.env.INDEX_CACHE_CONTROL || 'no-cache, no-store, must-revalidate',
      Pragma: process.env.INDEX_PRAGMA || 'no-cache',
      Expires: process.env.INDEX_EXPIRES || '0',
    });

    const lang = req.cookies.lang || req.headers['accept-language']?.split(',')[0] || 'en-US';
    const saneLang = lang.replace(/"/g, '&quot;');
    let updatedIndexHtml = indexHTML.replace(/lang="en-US"/g, `lang="${saneLang}"`);

    res.type('html');
    res.send(updatedIndexHtml);
  });

  const httpServer = app.listen(port, host, async () => {
    const { WebSocketServer } = require('ws');
    const { nanoid } = require('nanoid');
    // Guard-rail: Increase payload limit to 16MB for large token deltas/images
    const inexusWss = new WebSocketServer({
      noServer: true,
      maxPayload: 16 * 1024 * 1024,
    });

    // Low-level Heartbeat: Send ping every 25s to keep Render proxy alive
    const inexusHeartbeat = setInterval(() => {
      inexusWss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
      });
    }, 25000);

    const { handleWebSocket: handleInexusWS } = require('./routes/inexus');
    const passport = require('passport');
    const cookies = require('cookie');

    httpServer.on('upgrade', (request, socket, head) => {
      // ⚡ EXTREME PERFORMANCE: Disable Nagle's Algorithm for real-time WebSocket speed
      socket.setNoDelay(true);

      const protocol = request.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const host = request.headers.host;
      const url = new URL(request.url, `${protocol}://${host}`);
      const { pathname } = url;

      if (pathname === '/api/inexus/ws') {
        const tokenFromQuery = url.searchParams.get('token');
        const cookieHeader = request.headers.cookie || '';
        const parsedCookies = cookies.parse(cookieHeader);

        const origin = request.headers.origin;
        const DOMAIN_CLIENT = process.env.DOMAIN_CLIENT;

        // Guard-rail: Origin spoofing protection
        if (
          process.env.NODE_ENV === 'production' &&
          DOMAIN_CLIENT &&
          origin &&
          !origin.startsWith(DOMAIN_CLIENT)
        ) {
          console.error(`[Maveric-WS] Blocked connection from unauthorized origin: ${origin}`);
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }

        const wsId = nanoid(6);
        console.log(
          `[Maveric-WS] [${wsId}] Attempting auth. Path: ${pathname}, QueryToken: ${tokenFromQuery ? tokenFromQuery.slice(0, 10) + '...' : 'false'}, Cookies: ${Object.keys(parsedCookies).join(', ')}`,
        );

        // Create a mock req/res to use passport
        const mockReq = Object.assign(request, {
          cookies: parsedCookies,
          headers: {
            ...request.headers,
            authorization: tokenFromQuery
              ? `Bearer ${tokenFromQuery}`
              : request.headers.authorization,
          },
        });
        const mockRes = {
          setHeader: () => {},
          end: (data) => {
            console.log(`[Maveric-WS] mockRes.end called with: ${data?.toString().slice(0, 50)}`);
          },
        };

        passport.authenticate('jwt', { session: false }, (err, user) => {
          if (err || !user) {
            console.warn(
              `[Maveric-WS] [${wsId}] Auth failed for ${pathname}:`,
              err?.message || 'No user found',
            );
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
          }

          if (pathname === '/api/inexus/ws') {
            inexusWss.handleUpgrade(request, socket, head, (ws) => {
              ws._userId = user.id || user._id?.toString();
              ws._token = tokenFromQuery;
              ws._wsId = wsId; // Attach for logging
              inexusWss.emit('connection', ws, request);
            });
          }
        })(mockReq, mockRes, () => {});
      }
    });

    inexusWss.on('connection', (ws) => {
      console.log(`[Maveric-WS] [${ws._wsId}] Connection OPEN for User: ${ws._userId}`);
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
      ws.on('close', (code, reason) => {
        console.log(
          `[Maveric-WS] [${ws._wsId}] Connection CLOSED. Code: ${code}, Reason: ${reason || 'N/A'}`,
        );
      });
      handleInexusWS(ws, ws._userId);
    });

    // Graceful Shutdown - clean up clients on redeploy
    process.on('SIGTERM', () => {
      console.log('[Maveric-WS] SIGTERM received. Closing all WebSocket clients...');
      clearInterval(inexusHeartbeat);
      inexusWss.clients.forEach((client) => {
        client.close(1012, 'Server Restarting');
      });
      inexusWss.close();
    });

    httpServer.on('close', () => {
      clearInterval(inexusHeartbeat);
    });

    // Get network IP address
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    let networkIP = null;
    for (const name of Object.keys(networkInterfaces)) {
      for (const net of networkInterfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          networkIP = net.address;
          break;
        }
      }
      if (networkIP) break;
    }

    logger.info(`\n  🚀 Server is running!\n`);
    logger.info(`  ➜  Local:   http://localhost:${port}`);
    if (networkIP) {
      logger.info(`  ➜  Network: http://${networkIP}:${port}`);
    }
    logger.info('');

    await initializeMCPs();
    await initializeOAuthReconnectManager();
    await checkMigrations();

    // Start OpenRouter model sync scheduler (syncs every 24 hours)
    startModelSync();

    // Hydrate GoogleDirect immediately on boot; the daily scheduler keeps it fresh at 05:00 London.
    syncGoogleDirectModels().catch((err) => {
      logger.warn('[GoogleDirectSync] Initial boot sync failed:', err.message);
    });

    // Unified daily scheduler — fires all heavy refreshes at 05:00 AM London time
    // (rankings Puppeteer scrape + model catalog sync + free models list)
    startDailyScheduler();

    // Keep-alive mechanism for 24/7 availability on Railway
    // Self-ping every 2 minutes to ensure service never sleeps
    // Railway Keep-Alive: Only enable on Railway (not on Render or other platforms)
    // Render manages service health automatically, so this would waste resources
    const isOnRailway = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL;

    if (isOnRailway) {
      const keepAliveInterval = setInterval(
        () => {
          try {
            const http = require('http');
            const https = require('https');

            // Use Railway's public domain if available, otherwise localhost
            let keepAliveUrl;
            if (process.env.RAILWAY_PUBLIC_DOMAIN) {
              // Railway provides HTTPS by default
              keepAliveUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/health`;
            } else if (process.env.RAILWAY_STATIC_URL) {
              keepAliveUrl = `${process.env.RAILWAY_STATIC_URL}/health`;
            } else {
              // Fallback to localhost (for internal keep-alive)
              keepAliveUrl = `http://localhost:${port}/health`;
            }

            const client = keepAliveUrl.startsWith('https') ? https : http;

            const req = client.get(
              keepAliveUrl,
              {
                timeout: 5000,
                headers: {
                  'User-Agent': 'Railway-KeepAlive/1.0',
                },
              },
              (res) => {
                if (res.statusCode === 200) {
                  logger.debug('[Keep-Alive] Service is active');
                }
                res.on('data', () => {}); // Consume response
                res.on('end', () => {});
              },
            );

            req.on('error', (err) => {
              // Silently ignore errors - this is just a keep-alive ping
              logger.debug('[Keep-Alive] Ping failed (non-critical):', err.message);
            });

            req.on('timeout', () => {
              req.destroy();
              logger.debug('[Keep-Alive] Ping timeout (non-critical)');
            });
          } catch (error) {
            // Silently ignore errors
            logger.debug('[Keep-Alive] Error:', error.message);
          }
        },
        2 * 60 * 1000,
      ); // Every 2 minutes (more frequent for better reliability)

      // Clean up on shutdown
      process.on('SIGTERM', () => clearInterval(keepAliveInterval));
      process.on('SIGINT', () => clearInterval(keepAliveInterval));

      logger.info('[Keep-Alive] Enabled - Service will stay active 24/7 on Railway');
    } else {
      logger.info('[Keep-Alive] Disabled - Not running on Railway');
    }

    // Also do an immediate ping to ensure service is marked as active (Railway only)
    if (isOnRailway) {
      setTimeout(() => {
        try {
          const http = require('http');
          const https = require('https');
          let keepAliveUrl;
          if (process.env.RAILWAY_PUBLIC_DOMAIN) {
            keepAliveUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/health`;
          } else {
            keepAliveUrl = `http://localhost:${port}/health`;
          }
          const client = keepAliveUrl.startsWith('https') ? https : http;
          client.get(keepAliveUrl, { timeout: 5000 }, () => {}).on('error', () => {});
        } catch (error) {
          // Ignore
        }
      }, 10000); // Initial ping after 10 seconds
    }
  });
};

startServer();

let messageCount = 0;
process.on('uncaughtException', (err) => {
  const message = err?.message || String(err);

  if (!message.includes('fetch failed')) {
    logger.error('There was an uncaught error:', err);
  }

  if (message.includes('abort')) {
    logger.warn('There was an uncatchable AbortController error.');
    return;
  }

  if (message.includes('GoogleGenerativeAI')) {
    logger.warn(
      '\n\n`GoogleGenerativeAI` errors cannot be caught due to an upstream issue, see: https://github.com/google-gemini/generative-ai-js/issues/303',
    );
    return;
  }

  if (message.includes('fetch failed')) {
    if (messageCount === 0) {
      logger.warn('Meilisearch error, search will be disabled');
      messageCount++;
    }

    return;
  }

  if (message.includes('OpenAIError') || message.includes('ChatCompletionMessage')) {
    console.error(
      '\n\nAn Uncaught `OpenAIError` error may be due to your reverse-proxy setup or stream configuration, or a bug in the `openai` node package.',
    );
    return;
  }

  console.error('[Maveric-Crash] Fatal Uncaught Exception (Secondary Handler):', err);
  setTimeout(() => process.exit(1), 500);
});

/** Export app for easier testing purposes */
// restart trigger 13: exact HF Space defaults (guidance 1.0, steps 4)
// restart trigger 14: manual screenshot handler fix
module.exports = app;
// manual screenshot toggle fix Fri Mar 13 07:59:44 GMT 2026
// manual screenshot download fix Fri Mar 13 08:04:30 GMT 2026
// input bar fix Fri Mar 13 08:05:24 GMT 2026
// manual screenshot robust download fix Fri Mar 13 08:06:28 GMT 2026
// browser launch syntax & navigation integrity fix Fri Mar 13 14:59:58 GMT 2026
