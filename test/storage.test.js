import { beforeEach, describe, expect, it } from 'vitest';

process.env.ZAHZAN_STORAGE_DRIVER = 'memory';

const {
  deletePaymentProof,
  signProofUrl,
  uploadPaymentProof,
  uploadProductImage,
  __resetMemoryStore,
  __memoryStoreEntries
} = await import('../lib/storage.js');

const fixtureBuffer = Buffer.from('fake-image-bytes');

describe('lib/storage.js (memory driver)', () => {
  beforeEach(() => {
    __resetMemoryStore();
  });

  it('uploadPaymentProof round-trips: the upload is actually recorded', async () => {
    const result = await uploadPaymentProof(fixtureBuffer, 'proof.png', 'image/png', 'order-1');

    const entries = __memoryStoreEntries();
    expect(entries).toHaveLength(1);
    const [path, stored] = entries[0];
    expect(path).toBe(result.public_id);
    expect(Buffer.compare(stored.buffer, fixtureBuffer)).toBe(0);
    expect(stored.contentType).toBe('image/png');
  });

  it('uploadPaymentProof returns the { secure_url, public_id } shape', async () => {
    const result = await uploadPaymentProof(fixtureBuffer, 'proof.png', 'image/png', 'order-1');

    expect(typeof result.secure_url).toBe('string');
    expect(typeof result.public_id).toBe('string');
    expect(Object.keys(result).sort()).toEqual(['public_id', 'secure_url']);
  });

  it('uploadPaymentProof URLs are deterministic (memory driver requirement)', async () => {
    __resetMemoryStore();
    const first = await uploadPaymentProof(fixtureBuffer, 'proof.png', 'image/png', 'order-1');
    __resetMemoryStore();
    const second = await uploadPaymentProof(fixtureBuffer, 'proof.png', 'image/png', 'order-1');

    expect(second.public_id).toBe(first.public_id);
    expect(second.secure_url).toBe(first.secure_url);
  });

  it('uploadProductImage returns the same { secure_url, public_id } shape', async () => {
    const result = await uploadProductImage(fixtureBuffer, 'kurta.png', 'image/png');
    expect(Object.keys(result).sort()).toEqual(['public_id', 'secure_url']);
    expect(result.public_id).toContain('product/');
  });

  it('deletePaymentProof removes a recorded upload', async () => {
    const result = await uploadPaymentProof(fixtureBuffer, 'proof.png', 'image/png', 'order-1');
    expect(__memoryStoreEntries()).toHaveLength(1);

    await deletePaymentProof(result.public_id);
    expect(__memoryStoreEntries()).toHaveLength(0);
  });

  it('deletePaymentProof("local_x") is a no-op (mirrors deletePaymentProofFromCloudinary exactly)', async () => {
    await uploadPaymentProof(fixtureBuffer, 'proof.png', 'image/png', 'order-1');
    expect(__memoryStoreEntries()).toHaveLength(1);

    await expect(deletePaymentProof('local_some_id')).resolves.toBeUndefined();

    // The unrelated real upload must be untouched -- proves this really is
    // a no-op, not just "doesn't throw."
    expect(__memoryStoreEntries()).toHaveLength(1);
  });

  it('deletePaymentProof(null) and deletePaymentProof(undefined) are no-ops', async () => {
    await expect(deletePaymentProof(null)).resolves.toBeUndefined();
    await expect(deletePaymentProof(undefined)).resolves.toBeUndefined();
  });

  it('signProofUrl returns a URL for a given public_id without requiring another upload call', async () => {
    const { public_id } = await uploadPaymentProof(fixtureBuffer, 'proof.png', 'image/png', 'order-1');
    const signed = await signProofUrl(public_id);
    expect(typeof signed).toBe('string');
    expect(signed).toContain(public_id);
  });
});
