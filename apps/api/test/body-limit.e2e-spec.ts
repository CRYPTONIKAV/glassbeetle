import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './harness/index.js';

describe('Request body size limits (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    testApp.reset();
  });

  it('accepts a 100 000-character non-ASCII memory (issue #157)', async () => {
    const agent = testApp.fixtures.createAgent({ name: 'Limit Agent' });

    const res = await testApp
      .request()
      .post(`/api/v1/agents/${agent.id}/memories`)
      .send({ content: 'あ'.repeat(100_000) })
      .expect(201);

    expect(res.body.content).toHaveLength(100_000);
  });

  it('answers 413 with the envelope past the limit, never 500', async () => {
    const agent = testApp.fixtures.createAgent({ name: 'Limit Agent' });

    const res = await testApp
      .request()
      .post(`/api/v1/agents/${agent.id}/memories`)
      .send({ content: 'x'.repeat(2 * 1024 * 1024) })
      .expect(413);

    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
