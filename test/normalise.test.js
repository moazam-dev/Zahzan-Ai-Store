import { describe, expect, it } from 'vitest';
import { normalise, normaliseString, normaliseText } from '../tools/lib/normalise.mjs';

describe('normalise', () => {
  it('replaces a 24-hex Mongo ObjectId with <ID>', () => {
    expect(normaliseString('64f1a2b3c4d5e6f7a8b9c0d1')).toBe('<ID>');
  });

  it('replaces a UUID with <ID>', () => {
    expect(normaliseString('123e4567-e89b-12d3-a456-426614174000')).toBe('<ID>');
  });

  it('replaces an ISO-8601 timestamp with <TS>', () => {
    expect(normaliseString('2026-08-15T09:30:00.123Z')).toBe('<TS>');
    expect(normaliseString('2026-08-15T09:30:00Z')).toBe('<TS>');
  });

  it('replaces a JWT with <JWT>', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY0ZjFhMmIzYzRkNWU2ZjdhOGI5YzBkMSIsInJvbGUiOiJjdXN0b21lciJ9.4Adcj3UFYzPUVaVF43FmMab6RlaQD8A9V8wFzzht-KQ';
    expect(normaliseString(jwt)).toBe('<JWT>');
  });

  it('replaces an orderNumber with <ORDERNO>', () => {
    expect(normaliseString('ZHZ-20260815-0001')).toBe('<ORDERNO>');
    expect(normaliseString('Order ZHZ-20260815-0001 confirmed')).toBe('Order <ORDERNO> confirmed');
  });

  it('replaces an absolute http(s) URL with <URL>', () => {
    expect(normaliseString('https://res.cloudinary.com/demo/image/upload/v123/payment_x.png')).toBe('<URL>');
    expect(normaliseString('http://example.com/a/b?c=1')).toBe('<URL>');
  });

  it('replaces a tools/golden absolute path with <PATH>', () => {
    expect(normaliseString('/home/user/repo/tools/golden/001-health.json')).toBe('<PATH>');
    expect(normaliseString('C:\\Users\\zaeem\\repo\\tools\\golden\\001-health.json')).toBe('<PATH>');
  });

  it('replaces a raw epoch-millisecond timestamp embedded in a string with <TS>', () => {
    // Not in the brief's literal list -- added because Cloudinary public_ids
    // embed Date.now() and are returned verbatim in payment responses; see
    // the comment above EPOCH_MS_RE in tools/lib/normalise.mjs.
    expect(normaliseString('payment_ZHZ-20260815-0001_1755218381234')).toBe('payment_<ORDERNO>_<TS>');
  });

  it('leaves stable values alone', () => {
    expect(normaliseString('Cash on Delivery')).toBe('Cash on Delivery');
    expect(normaliseString('customer@example.com')).toBe('customer@example.com');
    expect(normaliseString('ZHZ-001')).toBe('ZHZ-001'); // SKU, not an orderNumber
    expect(normaliseString('')).toBe('');
  });

  it('normalise() recurses through objects and arrays, preserving structure and key order', () => {
    const input = {
      success: true,
      message: 'Order ZHZ-20260815-0001 confirmed',
      order: {
        _id: '64f1a2b3c4d5e6f7a8b9c0d1',
        id: '64f1a2b3c4d5e6f7a8b9c0d1',
        total: 8500,
        createdAt: '2026-08-15T09:30:00.000Z',
        items: [{ productName: 'Silk Kurta', quantity: 2 }]
      }
    };

    const result = normalise(input);

    expect(Object.keys(result)).toEqual(['success', 'message', 'order']);
    expect(Object.keys(result.order)).toEqual(['_id', 'id', 'total', 'createdAt', 'items']);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Order <ORDERNO> confirmed');
    expect(result.order._id).toBe('<ID>');
    expect(result.order.id).toBe('<ID>');
    expect(result.order.total).toBe(8500);
    expect(result.order.createdAt).toBe('<TS>');
    expect(result.order.items).toEqual([{ productName: 'Silk Kurta', quantity: 2 }]);
  });

  it('is idempotent: normalising twice equals normalising once', () => {
    const input = {
      id: '64f1a2b3c4d5e6f7a8b9c0d1',
      orderNumber: 'ZHZ-20260815-0001',
      createdAt: '2026-08-15T09:30:00.000Z',
      proofUrl: 'https://res.cloudinary.com/demo/image/upload/v123/payment.png',
      proofPublicId: 'payment_ZHZ-20260815-0001_1755218381234',
      token: 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEyMyJ9.abcDEF123-_xyz',
      note: 'stable text, unchanged'
    };

    const once = normalise(input);
    const twice = normalise(once);
    expect(twice).toEqual(once);
  });

  it('normaliseText applies the same substitutions to a raw (non-JSON) body', () => {
    const csv = 'Email,Status,Subscribed Date\n"a@b.com",subscribed,"2026-08-15T09:30:00.000Z"\n';
    const result = normaliseText(csv);
    expect(result).toBe('Email,Status,Subscribed Date\n"a@b.com",subscribed,"<TS>"\n');
  });
});
