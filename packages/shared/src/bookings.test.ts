import { describe, expect, it } from 'vitest';
import { createBookingSchema } from './bookings.js';

const uuid = '3f2b8c1e-8d4a-4b6e-9c1a-2f4e6d8b0a1c';
const base = {
  serviceId: uuid,
  staffId: uuid,
  locationId: uuid,
  startsAt: '2030-01-07T09:00:00-03:00',
};

describe('createBookingSchema', () => {
  it('normaliza el email del cliente', () => {
    const parsed = createBookingSchema.parse({
      ...base,
      customer: { name: 'Juana', email: '  Juana@Example.COM ' },
    });
    expect(parsed.customer.email).toBe('juana@example.com');
  });

  it('rechaza un email o un teléfono inválidos', () => {
    const bad = (customer: object) => createBookingSchema.safeParse({ ...base, customer }).success;
    expect(bad({ name: 'J', email: 'no-es-email' })).toBe(false);
    expect(bad({ name: 'J', email: 'j@example.com', phone: 'llamame' })).toBe(false);
    expect(bad({ name: 'J', email: 'j@example.com', phone: '+54 9 11 5555-1234' })).toBe(true);
  });

  it('exige la zona horaria en la fecha del turno', () => {
    const r = createBookingSchema.safeParse({
      ...base,
      startsAt: '2030-01-07T09:00:00',
      customer: { name: 'J', email: 'j@example.com' },
    });
    expect(r.success).toBe(false);
  });
});
