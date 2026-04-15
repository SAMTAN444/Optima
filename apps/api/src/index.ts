import { createApp } from './app';
import { prisma } from './lib/prisma';
import { isConfigured, isStaticTokenExpired } from './lib/onemapClient';

const PORT = parseInt(process.env.PORT ?? '4000', 10);

async function main() {
  // Verify DB connection
  await prisma.$connect();
  console.log('✓ Database connected');

  // OneMap configuration check
  if (isConfigured()) {
    if (isStaticTokenExpired()) {
      console.warn(
        '⚠ ONEMAP_TOKEN is set but has EXPIRED — commute routing will fall back to estimates.\n' +
        '  Get a fresh token from https://www.onemap.gov.sg/apidocs/ and update ONEMAP_TOKEN\n' +
        '  in apps/api/.env, then restart the server (docker compose restart api).'
      );
    } else {
      console.log('✓ OneMap configured — real transit commute times enabled');
    }
  } else {
    console.warn(
      '⚠ OneMap not configured — commute times will use distance estimates only.\n' +
      '  Set ONEMAP_TOKEN in apps/api/.env to enable real transit data.\n' +
      '  See apps/api/.env.example for details.'
    );
  }

  const app = createApp();

  app.listen(PORT, () => {
    console.log(`✓ API server running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
