import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  client,
  integrationReady,
  signUp,
  startApp,
  uniqueSlug,
  waitForMail,
  withSession,
} from './helpers.js';

describe.skipIf(!integrationReady)('equipo e invitaciones (e2e)', () => {
  let app: NestFastifyApplication;
  let anon: ReturnType<typeof client>;
  let sql: postgres.Sql;

  beforeAll(async () => {
    app = await startApp();
    anon = client(app);
    sql = postgres(process.env.DATABASE_URL!, { max: 2 });
  });

  afterAll(async () => {
    await app?.close();
    await sql?.end();
  });

  async function setup() {
    const ownerAccount = await signUp(anon, 'Dueña');
    const owner = withSession(anon, ownerAccount.as);
    const business = (await owner('POST', '/businesses', { slug: uniqueSlug(), name: 'Estudio' }))
      .body;
    const base = `/businesses/${business.id}`;
    const ana = (await owner('POST', `${base}/staff`, { name: 'Ana' })).body;
    return { owner, ownerAccount, business, base, ana };
  }

  it('invita, la persona acepta y queda como staff vinculada a su profesional', async () => {
    const { owner, base, business, ana } = await setup();
    const invited = await signUp(anon, 'Ana');
    const created = await owner('POST', `${base}/invitations`, {
      email: invited.email,
      staffId: ana.id,
    });
    expect(created.status).toBe(201);
    const { token } = created.body;

    const mail = await waitForMail(app, invited.email, (m) =>
      m.subject.includes('Te invitaron a Estudio'),
    );
    expect(mail.text).toContain(`/invitacion/${token}`);
    expect(mail.text).toContain('Dueña te invitó');

    const preview = await anon('GET', `/invitations/${token}`);
    expect(preview.body).toEqual({
      businessName: 'Estudio',
      businessSlug: business.slug,
      email: invited.email,
      role: 'staff',
      status: 'pending',
    });

    const accepted = await anon('POST', `/invitations/${token}/accept`, undefined, invited.as);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ businessId: business.id, role: 'staff' });

    const staffApi = withSession(anon, invited.as);
    expect((await staffApi('GET', `${base}/bookings`)).status).toBe(200);
    expect((await owner('GET', `${base}/staff/${ana.id}`)).body.userId).toBe(invited.user.id);
    expect((await anon('GET', `/invitations/${token}`)).body.status).toBe('accepted');
  });

  it('una invitación sirve una sola vez', async () => {
    const { owner, base } = await setup();
    const invited = await signUp(anon);
    const { token } = (await owner('POST', `${base}/invitations`, { email: invited.email })).body;
    expect((await anon('POST', `/invitations/${token}/accept`, undefined, invited.as)).status).toBe(
      200,
    );
    expect((await anon('POST', `/invitations/${token}/accept`, undefined, invited.as)).status).toBe(
      410,
    );
  });

  it('solo la puede aceptar la cuenta del email invitado', async () => {
    const { owner, base } = await setup();
    const invited = await signUp(anon);
    const other = await signUp(anon, 'Otra');
    const { token } = (await owner('POST', `${base}/invitations`, { email: invited.email })).body;
    const res = await anon('POST', `/invitations/${token}/accept`, undefined, other.as);
    expect(res.status).toBe(403);
    expect(res.body.message).toContain(invited.email);
  });

  it('aceptar exige sesión', async () => {
    const { owner, base } = await setup();
    const { token } = (await owner('POST', `${base}/invitations`, { email: 'x@example.com' })).body;
    expect((await anon('POST', `/invitations/${token}/accept`)).status).toBe(401);
  });

  it('una invitación vencida no sirve', async () => {
    const { owner, base } = await setup();
    const invited = await signUp(anon);
    const created = (await owner('POST', `${base}/invitations`, { email: invited.email })).body;
    await sql`update invitations set expires_at = now() - interval '1 minute'
      where id = ${created.invitation.id}`;
    expect((await anon('GET', `/invitations/${created.token}`)).body.status).toBe('expired');
    expect(
      (await anon('POST', `/invitations/${created.token}/accept`, undefined, invited.as)).status,
    ).toBe(410);
  });

  it('la dueña puede ver y revocar invitaciones pendientes', async () => {
    const { owner, base } = await setup();
    const created = (await owner('POST', `${base}/invitations`, { email: 'b@example.com' })).body;
    expect((await owner('GET', `${base}/invitations`)).body).toHaveLength(1);
    expect((await owner('DELETE', `${base}/invitations/${created.invitation.id}`)).status).toBe(
      204,
    );
    expect((await owner('GET', `${base}/invitations`)).body).toHaveLength(0);
    expect((await anon('GET', `/invitations/${created.token}`)).status).toBe(404);
  });

  it('no deja invitar a alguien que ya es del equipo ni vincular un profesional ajeno', async () => {
    const a = await setup();
    const b = await setup();
    expect(
      (await a.owner('POST', `${a.base}/invitations`, { email: a.ownerAccount.email })).status,
    ).toBe(409);
    expect(
      (
        await a.owner('POST', `${a.base}/invitations`, {
          email: 'nuevo@example.com',
          staffId: b.ana.id,
        })
      ).status,
    ).toBe(400);
  });

  it('el staff no puede invitar', async () => {
    const { owner, base } = await setup();
    const invited = await signUp(anon);
    const { token } = (await owner('POST', `${base}/invitations`, { email: invited.email })).body;
    await anon('POST', `/invitations/${token}/accept`, undefined, invited.as);
    const staffApi = withSession(anon, invited.as);
    expect((await staffApi('POST', `${base}/invitations`, { email: 'z@example.com' })).status).toBe(
      403,
    );
  });

  describe('miembros', () => {
    it('lista el equipo y deja sacar a alguien, que pierde el acceso', async () => {
      const { owner, base, ana } = await setup();
      const invited = await signUp(anon, 'Bruno');
      const { token } = (
        await owner('POST', `${base}/invitations`, { email: invited.email, staffId: ana.id })
      ).body;
      await anon('POST', `/invitations/${token}/accept`, undefined, invited.as);

      const members = (await owner('GET', `${base}/members`)).body as { name: string }[];
      expect(members.map((m) => m.name).sort()).toEqual(['Bruno', 'Dueña']);

      expect((await owner('DELETE', `${base}/members/${invited.user.id}`)).status).toBe(204);
      const staffApi = withSession(anon, invited.as);
      expect((await staffApi('GET', `${base}/bookings`)).status).toBe(403);
      expect((await owner('GET', `${base}/staff/${ana.id}`)).body.userId).toBeNull();
    });

    it('no deja al negocio sin dueños', async () => {
      const { owner, base, ownerAccount } = await setup();
      const res = await owner('DELETE', `${base}/members/${ownerAccount.user.id}`);
      expect(res.status).toBe(409);
    });
  });
});
