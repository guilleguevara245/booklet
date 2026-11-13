import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import {
  googleLoginSchema,
  loginSchema,
  NATIVE_CLIENT_HEADER,
  registerSchema,
  SESSION_COOKIE,
  type AuthResponse,
  type GoogleLogin,
  type Login,
  type MeResponse,
  type Register,
  type User,
} from '@booklet/shared';
import { BusinessesService } from '../businesses/businesses.service.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ENV, type Env } from '../config/env.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AuthService, toUser } from './auth.service.js';
import { CurrentUser, Public } from './request-user.js';
import { SESSION_DAYS, type SessionUser } from './sessions.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(BusinessesService) private readonly businesses: BusinessesService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('register')
  @Public()
  async register(
    @Body(new ZodPipe(registerSchema)) body: Register,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const { user, token } = await this.auth.register(body, clientInfo(req));
    return this.startSession(req, reply, user, token);
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) body: Login,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const { user, token } = await this.auth.login(body, clientInfo(req));
    return this.startSession(req, reply, user, token);
  }

  /** Recibe el ID token de Google Identity Services (el `credential` del botón de Google). */
  @Post('google')
  @Public()
  @HttpCode(200)
  async google(
    @Body(new ZodPipe(googleLoginSchema)) body: GoogleLogin,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    const { user, token } = await this.auth.loginWithGoogle(body, clientInfo(req));
    return this.startSession(req, reply, user, token);
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    if (req.sessionToken) await this.auth.logout(req.sessionToken.value);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  async me(@CurrentUser() user: SessionUser): Promise<MeResponse> {
    return { user: toUser(user), memberships: await this.businesses.membershipsOf(user.id) };
  }

  /**
   * Deja la sesión en una cookie que JavaScript no puede leer. Las apps nativas, que no
   * usan cookies, reciben además el token en la respuesta.
   */
  private startSession(
    req: FastifyRequest,
    reply: FastifyReply,
    user: User,
    token: string,
  ): AuthResponse {
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DAYS * 86_400,
    });
    const native = req.headers[NATIVE_CLIENT_HEADER] === 'native';
    return native ? { user, token } : { user };
  }
}

function clientInfo(req: FastifyRequest) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}
