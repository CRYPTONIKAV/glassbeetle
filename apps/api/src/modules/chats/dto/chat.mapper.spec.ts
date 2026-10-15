import { describe, expect, it } from 'vitest';
import {
  applyChatUpdates,
  mapChatRowToResponse,
  mapCreateChatDtoToRow,
  type ChatRow,
} from './chat.mapper.js';

const ROW: ChatRow = {
  id: '018f3a9e-0000-7000-8000-000000000001',
  title: 'Architecture Discussion',
  project_id: '018f3a9e-0000-7000-8000-000000000002',
  agent_id: '018f3a9e-0000-7000-8000-000000000003',
  team_id: null,
  context_summary: 'Prior discussion points...',
  created_at: '2026-10-15T08:00:00.000Z',
  updated_at: '2026-10-15T08:00:00.000Z',
};

describe('mapChatRowToResponse', () => {
  it('maps every column to its camelCase field', () => {
    expect(mapChatRowToResponse(ROW)).toEqual({
      id: ROW.id,
      title: 'Architecture Discussion',
      projectId: '018f3a9e-0000-7000-8000-000000000002',
      agentId: '018f3a9e-0000-7000-8000-000000000003',
      teamId: null,
      contextSummary: 'Prior discussion points...',
      createdAt: ROW.created_at,
      updatedAt: ROW.updated_at,
    });
  });

  it('maps team-owned chats correctly', () => {
    const response = mapChatRowToResponse({
      ...ROW,
      agent_id: null,
      team_id: '018f3a9e-0000-7000-8000-000000000004',
    });
    expect(response.agentId).toBeNull();
    expect(response.teamId).toBe('018f3a9e-0000-7000-8000-000000000004');
  });

  it('handles deleted owner gracefully (defensive row mapping)', () => {
    // When SQLite foreign key cascade ON DELETE SET NULL clears both owner columns
    const response = mapChatRowToResponse({
      ...ROW,
      agent_id: null,
      team_id: null,
    });
    expect(response.agentId).toBeNull();
    expect(response.teamId).toBeNull();
  });

  it('emits null for missing optional fields', () => {
    const response = mapChatRowToResponse({
      ...ROW,
      title: null,
      project_id: null,
      context_summary: null,
    });
    expect(response.title).toBeNull();
    expect(response.projectId).toBeNull();
    expect(response.contextSummary).toBeNull();
  });
});

describe('mapCreateChatDtoToRow', () => {
  it('generates a UUIDv7 id and timestamps', () => {
    const row = mapCreateChatDtoToRow({
      agentId: '018f3a9e-0000-7000-8000-000000000003',
    });

    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.created_at).toBe(row.updated_at);
    expect(row.agent_id).toBe('018f3a9e-0000-7000-8000-000000000003');
    expect(row.team_id).toBeNull();
    expect(row.project_id).toBeNull();
    expect(row.title).toBeNull();
    expect(row.context_summary).toBeNull();
  });

  it('honours explicit id and timestamp overrides for testing', () => {
    const row = mapCreateChatDtoToRow(
      {
        teamId: '018f3a9e-0000-7000-8000-000000000004',
        title: 'Team Chat',
      },
      { id: 'fixed-id', now: '2026-01-01T00:00:00.000Z' },
    );

    expect(row.id).toBe('fixed-id');
    expect(row.created_at).toBe('2026-01-01T00:00:00.000Z');
    expect(row.updated_at).toBe('2026-01-01T00:00:00.000Z');
    expect(row.title).toBe('Team Chat');
    expect(row.team_id).toBe('018f3a9e-0000-7000-8000-000000000004');
  });
});

describe('applyChatUpdates', () => {
  const NOW = '2026-11-01T10:00:00.000Z';
  const BASE: ChatRow = { ...ROW };

  it('reports no changes for an empty payload', () => {
    const result = applyChatUpdates(BASE, {}, { now: NOW });
    expect(result.hasChanges).toBe(false);
    expect(result.updatedRow.updated_at).toBe(BASE.updated_at);
  });

  it('reports no changes when values are identical to existing row', () => {
    const result = applyChatUpdates(
      BASE,
      { title: BASE.title, projectId: BASE.project_id },
      { now: NOW },
    );
    expect(result.hasChanges).toBe(false);
  });

  it('updates title and bumps updated_at', () => {
    const result = applyChatUpdates(
      BASE,
      { title: 'New Title' },
      { now: NOW },
    );
    expect(result.hasChanges).toBe(true);
    expect(result.setClauses).toEqual(['title = ?', 'updated_at = ?']);
    expect(result.setParams).toEqual(['New Title', NOW]);
    expect(result.updatedRow.title).toBe('New Title');
    expect(result.updatedRow.updated_at).toBe(NOW);
  });

  it('clears title and projectId when set to null', () => {
    const result = applyChatUpdates(
      BASE,
      { title: null, projectId: null },
      { now: NOW },
    );
    expect(result.hasChanges).toBe(true);
    expect(result.setClauses).toEqual([
      'title = ?',
      'project_id = ?',
      'updated_at = ?',
    ]);
    expect(result.setParams).toEqual([null, null, NOW]);
    expect(result.updatedRow.title).toBeNull();
    expect(result.updatedRow.project_id).toBeNull();
  });
});
