import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './harness/index.js';
import {
  BOTH_OWNERS_ERROR_MESSAGE,
  CONTEXT_SUMMARY_READONLY_ERROR_MESSAGE,
  NEITHER_OWNER_ERROR_MESSAGE,
  OWNER_IMMUTABLE_ERROR_MESSAGE,
} from '../src/modules/chats/dto/chat-validators.js';

describe('Chats endpoints (e2e)', () => {
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

  function createAgent(name: string = 'Researcher') {
    return testApp.fixtures.createAgent({ name });
  }

  function createTeam(name: string = 'Engineering') {
    return testApp.fixtures.createTeam({ name });
  }

  function createProject(name: string = 'Main Project') {
    return testApp.fixtures.createProject({ name });
  }

  async function createChat(body: Record<string, unknown>) {
    const response = await testApp
      .request()
      .post('/api/v1/chats')
      .send(body)
      .expect(201);
    return response.body;
  }

  describe('Lifecycle and Owner Rule', () => {
    it('creates an agent-owned chat and sets Location header', async () => {
      const agent = createAgent();
      const response = await testApp
        .request()
        .post('/api/v1/chats')
        .send({ agentId: agent.id, title: 'Agent Chat' })
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        title: 'Agent Chat',
        agentId: agent.id,
        teamId: null,
        projectId: null,
        contextSummary: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      expect(response.headers.location).toBe(`/api/v1/chats/${response.body.id}`);
    });

    it('creates a team-owned chat with project', async () => {
      const team = createTeam();
      const project = createProject();

      const response = await testApp
        .request()
        .post('/api/v1/chats')
        .send({
          teamId: team.id,
          projectId: project.id,
          title: 'Team Project Chat',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        title: 'Team Project Chat',
        teamId: team.id,
        agentId: null,
        projectId: project.id,
      });
    });

    it('rejects create with both owners set and writes no row', async () => {
      const agent = createAgent();
      const team = createTeam();

      const response = await testApp
        .request()
        .post('/api/v1/chats')
        .send({ agentId: agent.id, teamId: team.id, title: 'Both Owners' })
        .expect(400);

      const errorText = JSON.stringify(response.body);
      expect(errorText).toContain(BOTH_OWNERS_ERROR_MESSAGE);

      const rows = testApp.db.all('SELECT * FROM chats');
      expect(rows).toHaveLength(0);
    });

    it('rejects create with neither owner set and writes no row', async () => {
      const response = await testApp
        .request()
        .post('/api/v1/chats')
        .send({ title: 'No Owner' })
        .expect(400);

      const errorText = JSON.stringify(response.body);
      expect(errorText).toContain(NEITHER_OWNER_ERROR_MESSAGE);

      const rows = testApp.db.all('SELECT * FROM chats');
      expect(rows).toHaveLength(0);
    });

    it('rejects create with non-existent agentId, teamId, or projectId naming the field', async () => {
      const missingId = '018f3a9e-0000-7000-8000-000000999999';

      const agentRes = await testApp
        .request()
        .post('/api/v1/chats')
        .send({ agentId: missingId })
        .expect(422);
      expect(agentRes.body.message).toContain('agentId');

      const teamRes = await testApp
        .request()
        .post('/api/v1/chats')
        .send({ teamId: missingId })
        .expect(422);
      expect(teamRes.body.message).toContain('teamId');

      const agent = createAgent();
      const projectRes = await testApp
        .request()
        .post('/api/v1/chats')
        .send({ agentId: agent.id, projectId: missingId })
        .expect(422);
      expect(projectRes.body.message).toContain('projectId');
    });

    it('rejects context_summary during create', async () => {
      const agent = createAgent();

      const res1 = await testApp
        .request()
        .post('/api/v1/chats')
        .send({ agentId: agent.id, contextSummary: 'Manual compaction' })
        .expect(400);
      expect(JSON.stringify(res1.body)).toContain(
        CONTEXT_SUMMARY_READONLY_ERROR_MESSAGE,
      );

      const res2 = await testApp
        .request()
        .post('/api/v1/chats')
        .send({ agentId: agent.id, context_summary: 'Manual compaction' })
        .expect(400);
      expect(JSON.stringify(res2.body)).toContain(
        CONTEXT_SUMMARY_READONLY_ERROR_MESSAGE,
      );
    });
  });

  describe('Retrieval and Updates', () => {
    it('retrieves an existing chat by ID with 200', async () => {
      const agent = createAgent();
      const created = await createChat({ agentId: agent.id, title: 'Chat 1' });

      const res = await testApp
        .request()
        .get(`/api/v1/chats/${created.id}`)
        .expect(200);

      expect(res.body).toEqual(created);
    });

    it('returns 404 for unknown chatId on GET, PATCH, and DELETE', async () => {
      const missingChatId = '018f3a9e-0000-7000-8000-111111111111';

      await testApp.request().get(`/api/v1/chats/${missingChatId}`).expect(404);
      await testApp
        .request()
        .patch(`/api/v1/chats/${missingChatId}`)
        .send({ title: 'New' })
        .expect(404);
      await testApp.request().delete(`/api/v1/chats/${missingChatId}`).expect(404);
    });

    it('updates title and moves between projects via PATCH', async () => {
      const agent = createAgent();
      const p1 = createProject('P1');
      const p2 = createProject('P2');
      const created = await createChat({
        agentId: agent.id,
        projectId: p1.id,
        title: 'Original Title',
      });

      const updated = await testApp
        .request()
        .patch(`/api/v1/chats/${created.id}`)
        .send({ title: 'Modified Title', projectId: p2.id })
        .expect(200);

      expect(updated.body.title).toBe('Modified Title');
      expect(updated.body.projectId).toBe(p2.id);

      // Clear project by passing null
      const detached = await testApp
        .request()
        .patch(`/api/v1/chats/${created.id}`)
        .send({ projectId: null })
        .expect(200);
      expect(detached.body.projectId).toBeNull();
    });

    it('rejects owner changes via PATCH with explanatory message', async () => {
      const agent1 = createAgent('A1');
      const agent2 = createAgent('A2');
      const team = createTeam();
      const created = await createChat({ agentId: agent1.id });

      const patchAgent = await testApp
        .request()
        .patch(`/api/v1/chats/${created.id}`)
        .send({ agentId: agent2.id })
        .expect(400);
      expect(JSON.stringify(patchAgent.body)).toContain(
        OWNER_IMMUTABLE_ERROR_MESSAGE,
      );

      const patchTeam = await testApp
        .request()
        .patch(`/api/v1/chats/${created.id}`)
        .send({ teamId: team.id })
        .expect(400);
      expect(JSON.stringify(patchTeam.body)).toContain(
        OWNER_IMMUTABLE_ERROR_MESSAGE,
      );
    });

    it('rejects context_summary during update via PATCH', async () => {
      const agent = createAgent();
      const created = await createChat({ agentId: agent.id });

      const res = await testApp
        .request()
        .patch(`/api/v1/chats/${created.id}`)
        .send({ contextSummary: 'Manual compaction' })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain(
        CONTEXT_SUMMARY_READONLY_ERROR_MESSAGE,
      );
    });
  });

  describe('Collection filtering and pagination', () => {
    it('filters by projectId, agentId, and teamId individually and combined', async () => {
      const p1 = createProject('P1');
      const p2 = createProject('P2');
      const a1 = createAgent('A1');
      const a2 = createAgent('A2');
      const t1 = createTeam('T1');

      await createChat({ agentId: a1.id, projectId: p1.id, title: 'Chat-A1-P1' });
      await createChat({ agentId: a1.id, projectId: p2.id, title: 'Chat-A1-P2' });
      await createChat({ agentId: a2.id, projectId: p1.id, title: 'Chat-A2-P1' });
      await createChat({ teamId: t1.id, projectId: p1.id, title: 'Chat-T1-P1' });

      // Filter by agentId
      const resA1 = await testApp
        .request()
        .get(`/api/v1/chats?agentId=${a1.id}`)
        .expect(200);
      expect(resA1.body.total).toBe(2);

      // Filter by teamId
      const resT1 = await testApp
        .request()
        .get(`/api/v1/chats?teamId=${t1.id}`)
        .expect(200);
      expect(resT1.body.total).toBe(1);
      expect(resT1.body.items[0].title).toBe('Chat-T1-P1');

      // Filter by projectId
      const resP1 = await testApp
        .request()
        .get(`/api/v1/chats?projectId=${p1.id}`)
        .expect(200);
      expect(resP1.body.total).toBe(3);

      // Combined filter
      const resCombined = await testApp
        .request()
        .get(`/api/v1/chats?projectId=${p1.id}&agentId=${a1.id}`)
        .expect(200);
      expect(resCombined.body.total).toBe(1);
      expect(resCombined.body.items[0].title).toBe('Chat-A1-P1');
    });

    it('paginates and sorts chats correctly', async () => {
      const agent = createAgent();
      await createChat({ agentId: agent.id, title: 'B Chat' });
      await createChat({ agentId: agent.id, title: 'A Chat' });
      await createChat({ agentId: agent.id, title: 'C Chat' });

      const sorted = await testApp
        .request()
        .get('/api/v1/chats?sort=title&order=asc&limit=2&offset=0')
        .expect(200);

      expect(sorted.body.total).toBe(3);
      expect(sorted.body.items).toHaveLength(2);
      expect(sorted.body.items[0].title).toBe('A Chat');
      expect(sorted.body.items[1].title).toBe('B Chat');

      const page2 = await testApp
        .request()
        .get('/api/v1/chats?sort=title&order=asc&limit=2&offset=2')
        .expect(200);
      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.items[0].title).toBe('C Chat');
    });
  });

  describe('Deletion and Cascades', () => {
    it('deletes chat, destroys message history (CASCADE), and clears chatId on artifacts (SET NULL)', async () => {
      const agent = createAgent();
      const chat = await createChat({ agentId: agent.id, title: 'To Delete' });

      // Create messages
      testApp.fixtures.createMessage({ chat_id: chat.id, sequence: 1 });
      testApp.fixtures.createMessage({ chat_id: chat.id, sequence: 2 });

      // Create artifact linked to this chat
      const artifact = testApp.fixtures.createArtifact({
        chat_id: chat.id,
        title: 'Important Report',
      });

      // Verify they exist prior to deletion
      expect(
        testApp.db.all('SELECT * FROM messages WHERE chat_id = ?', [chat.id]),
      ).toHaveLength(2);

      // Delete chat
      await testApp.request().delete(`/api/v1/chats/${chat.id}`).expect(204);

      // Verify chat is gone
      await testApp.request().get(`/api/v1/chats/${chat.id}`).expect(404);

      // Verify messages are permanently destroyed
      const remainingMessages = testApp.db.all(
        'SELECT * FROM messages WHERE chat_id = ?',
        [chat.id],
      );
      expect(remainingMessages).toHaveLength(0);

      // Verify artifact survived with chat_id set to null
      const survivingArtifact = testApp.db.get<{ chat_id: string | null }>(
        'SELECT chat_id FROM artifacts WHERE id = ?',
        [artifact.id],
      );
      expect(survivingArtifact).toBeDefined();
      expect(survivingArtifact?.chat_id).toBeNull();
    });
  });
});
