import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';

import { prisma } from '../config/database.js';
import { environment } from '../config/environment.js';
import { AppError } from '../errors/app-error.js';

export const authRouter = Router();

const oauthClient = () => {
  if (!environment.GOOGLE_CLIENT_ID || !environment.GOOGLE_CLIENT_SECRET || !environment.GOOGLE_CALLBACK_URL) {
    throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Google OAuth credentials are not configured.');
  }
  return new OAuth2Client(environment.GOOGLE_CLIENT_ID, environment.GOOGLE_CLIENT_SECRET, environment.GOOGLE_CALLBACK_URL);
};

authRouter.get('/google', (request, response, next) => {
  try {
    const state = randomBytes(24).toString('hex');
    request.session.oauthState = state;
    response.redirect(oauthClient().generateAuthUrl({ access_type: 'offline', scope: ['openid', 'email', 'profile'], state }));
  } catch (error) { next(error); }
});

authRouter.get('/google/callback', async (request, response, next) => {
  try {
    const { code, state } = z.object({ code: z.string(), state: z.string() }).parse(request.query);
    if (state !== request.session.oauthState) throw new AppError(400, 'INVALID_OAUTH_STATE', 'Invalid OAuth state.');
    const oauth = oauthClient();
    const { tokens } = await oauth.getToken(code);
    if (!tokens.id_token) throw new AppError(400, 'MISSING_ID_TOKEN', 'Google did not return an ID token.');
    const profile = (await oauth.verifyIdToken({ idToken: tokens.id_token, audience: environment.GOOGLE_CLIENT_ID })).getPayload();
    if (!profile?.sub || !profile.email) throw new AppError(400, 'INVALID_GOOGLE_PROFILE', 'Google profile is incomplete.');
    const user = await prisma.user.upsert({
      where: { email: profile.email },
      update: { googleId: profile.sub, name: profile.name ?? profile.email, avatarUrl: profile.picture },
      create: { googleId: profile.sub, email: profile.email, name: profile.name ?? profile.email, avatarUrl: profile.picture },
    });
    request.session.userId = user.id;
    delete request.session.oauthState;
    response.redirect(environment.FRONTEND_URL);
  } catch (error) { next(error); }
});

authRouter.get('/me', async (request, response, next) => {
  try {
    if (!request.session.userId) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required.');
    const user = await prisma.user.findUnique({ where: { id: request.session.userId }, select: { id: true, name: true, email: true, avatarUrl: true } });
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required.');
    response.json({ user });
  } catch (error) { next(error); }
});

authRouter.post('/logout', (request, response, next) => request.session.destroy((error) => error ? next(error) : response.status(204).send()));
