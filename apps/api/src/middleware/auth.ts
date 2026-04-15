import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { prisma } from '../lib/prisma';

export interface AuthUser {
  supabaseUserId: string;
  profileId: string;
  role: 'STUDENT_PARENT' | 'ADMIN';
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

// Lazily initialised so the module can load even when SUPABASE_URL is not yet set.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) throw new Error('SUPABASE_URL is not configured');
    jwks = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
    );
  }
  return jwks;
}

/** Resolve + upsert a UserProfile from a verified JWT sub claim.
 *  displayName priority: user_metadata.displayName > email username (part before @)
 *  This ensures existing users whose JWT lacks user_metadata still get a sensible
 *  name (their email prefix) backfilled on next API call.
 */
async function resolveProfile(sub: string, displayName?: string, email?: string) {
  // Best available name: explicit displayName, or email username as fallback
  const bestName = displayName ?? (email ? email.split('@')[0] : undefined);

  let profile = await prisma.userProfile.findUnique({ where: { supabaseUserId: sub } });
  if (!profile) {
    profile = await prisma.userProfile.create({
      data: { supabaseUserId: sub, role: 'STUDENT_PARENT', displayName: bestName ?? null },
    });
  } else if (!profile.displayName && bestName) {
    // Backfill: profile exists but has no name — set it from JWT data
    profile = await prisma.userProfile.update({
      where: { id: profile.id },
      data: { displayName: bestName },
    });
  }
  return profile;
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, getJWKS());

    const sub = payload.sub;
    if (!sub) throw new Error('JWT has no sub claim');

    const userMeta = payload.user_metadata as Record<string, unknown> | undefined;
    const displayName = typeof userMeta?.displayName === 'string' ? userMeta.displayName : undefined;
    const email = typeof payload.email === 'string' ? payload.email : undefined;
    const profile = await resolveProfile(sub, displayName, email);

    // Block banned users from all authenticated actions
    if (profile.banned) {
      res.status(403).json({
        ok: false,
        error: { code: 'BANNED', message: 'Your account has been suspended' },
      });
      return;
    }

    req.user = {
      supabaseUserId: sub,
      profileId: profile.id,
      role: profile.role as 'STUDENT_PARENT' | 'ADMIN',
    };

    next();
  } catch (err) {
    const isConfig = err instanceof Error && err.message.includes('SUPABASE_URL');
    res.status(isConfig ? 500 : 401).json({
      ok: false,
      error: isConfig
        ? { code: 'CONFIG_ERROR', message: 'SUPABASE_URL not configured' }
        : { code: 'INVALID_TOKEN', message: 'Token is invalid or expired' },
    });
  }
}

export async function optionalAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, getJWKS());
    const sub = payload.sub;
    if (!sub) { next(); return; }

    const userMeta = payload.user_metadata as Record<string, unknown> | undefined;
    const displayName = typeof userMeta?.displayName === 'string' ? userMeta.displayName : undefined;
    const email = typeof payload.email === 'string' ? payload.email : undefined;
    const profile = await resolveProfile(sub, displayName, email);

    // If banned, proceed as unauthenticated — don't set req.user
    if (!profile.banned) {
      req.user = {
        supabaseUserId: sub,
        profileId: profile.id,
        role: profile.role as 'STUDENT_PARENT' | 'ADMIN',
      };
    }
    next();
  } catch {
    next(); // Non-fatal for optional auth
  }
}
