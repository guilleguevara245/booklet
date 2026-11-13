// Datos de ejemplo para las pruebas de la web.

export const BIZ = '22222222-2222-4222-8222-222222222222';
export const LOC = '33333333-3333-4333-8333-333333333333';
export const LOC2 = '88888888-8888-4888-8888-888888888888';
export const SVC = '44444444-4444-4444-8444-444444444444';
export const SVC2 = '99999999-9999-4999-8999-999999999999';
export const LEO = '55555555-5555-4555-8555-555555555555';
export const MIA = '66666666-6666-4666-8666-666666666666';

export const business = {
  id: BIZ,
  slug: 'barberia-sur',
  name: 'Barbería Sur',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const location = {
  id: LOC,
  businessId: BIZ,
  name: 'Boedo',
  address: 'Av. Boedo 900',
  timezone: 'America/Argentina/Buenos_Aires',
  active: true,
};

export const services = [
  {
    id: SVC,
    businessId: BIZ,
    name: 'Corte',
    durationMinutes: 30,
    bufferMinutes: 0,
    priceCents: 1_500_000,
    currency: 'ARS',
    active: true,
  },
  {
    id: SVC2,
    businessId: BIZ,
    name: 'Corte y barba',
    durationMinutes: 45,
    bufferMinutes: 0,
    priceCents: 0,
    currency: 'ARS',
    active: true,
  },
];

export const staff = [
  { id: LEO, businessId: BIZ, name: 'Leo', active: true, serviceIds: [SVC, SVC2], userId: null },
  { id: MIA, businessId: BIZ, name: 'Mia', active: true, serviceIds: [SVC], userId: null },
];
