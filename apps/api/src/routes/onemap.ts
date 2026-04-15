import { Router, Request, Response } from 'express';
import { isConfigured, onemapPublicFetch } from '../lib/onemapClient';

const router = Router();

/**
 * GET /onemap/ping
 *
 * Health-check for the OneMap integration.
 * - 503 if ONEMAP_TOKEN is not configured.
 * - 200 if token is present and OneMap API is reachable.
 * - 502 if token is present but OneMap API is unreachable.
 */
router.get('/ping', async (_req: Request, res: Response) => {
  if (!isConfigured()) {
    res.status(503).json({
      ok: false,
      error: {
        code: 'ONEMAP_NOT_CONFIGURED',
        message: 'OneMap token not configured. Set ONEMAP_TOKEN in your environment.',
      },
    });
    return;
  }

  try {
    const resp = await onemapPublicFetch(
      '/api/common/elastic/search?searchVal=Raffles&returnGeom=N&getAddrDetails=N&pageNum=1'
    );

    if (!resp.ok) {
      res.status(502).json({
        ok: false,
        error: {
          code: 'ONEMAP_UNREACHABLE',
          message: `OneMap API returned HTTP ${resp.status}`,
        },
      });
      return;
    }

    const data = (await resp.json()) as { found?: number };

    res.json({
      ok: true,
      data: {
        status: 'ok',
        tokenConfigured: true,
        searchTest: { found: data.found ?? 0 },
      },
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    res.status(502).json({
      ok: false,
      error: {
        code: isTimeout ? 'ONEMAP_TIMEOUT' : 'ONEMAP_UNREACHABLE',
        message: isTimeout
          ? 'OneMap API request timed out'
          : 'Could not reach OneMap API',
      },
    });
  }
});

export default router;
