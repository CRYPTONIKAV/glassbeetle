import { newId } from '../../../common/persistence/identifiers.js';
import { nowIso } from '../../../common/persistence/timestamps.js';
import type { ChatResponseDto } from './chat-response.dto.js';
import type { CreateChatDto } from './create-chat.dto.js';
import type { UpdateChatDto } from './update-chat.dto.js';

/**
 * Raw row shape for the `chats` SQLite table.
 */
export interface ChatRow {
  readonly id: string;
  readonly title: string | null;
  readonly project_id: string | null;
  readonly agent_id: string | null;
  readonly team_id: string | null;
  readonly context_summary: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Maps a SQLite `chats` row to the public `ChatResponseDto`.
 *
 * Defensive row mapping:
 * - A chat whose owning agent or team was deleted will have had its foreign key
 *   set to NULL by SQLite ON DELETE SET NULL, leaving both owner columns null.
 *   This mapper maps them directly without asserting that one owner is present,
 *   ensuring list and retrieve endpoints return the row rather than crashing.
 * - Snake_case columns are mapped to camelCase.
 * - Nullable columns are returned as `null`, never undefined.
 */
export function mapChatRowToResponse(row: ChatRow): ChatResponseDto {
  return {
    id: row.id,
    title: row.title ?? null,
    projectId: row.project_id ?? null,
    agentId: row.agent_id ?? null,
    teamId: row.team_id ?? null,
    contextSummary: row.context_summary ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Options when mapping a `CreateChatDto` to a new row.
 */
export interface CreateChatRowOptions {
  readonly id?: string;
  readonly now?: string;
}

/**
 * Maps a `CreateChatDto` to a fresh `ChatRow` ready for insertion.
 */
export function mapCreateChatDtoToRow(
  dto: CreateChatDto,
  options?: CreateChatRowOptions,
): ChatRow {
  const timestamp = options?.now ?? nowIso();

  return {
    id: options?.id ?? newId(),
    title: dto.title ?? null,
    project_id: dto.projectId ?? null,
    agent_id: dto.agentId ?? null,
    team_id: dto.teamId ?? null,
    context_summary: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

/**
 * Result of evaluating an `UpdateChatDto` against an existing row.
 */
export interface ChatUpdateResult {
  readonly updatedRow: ChatRow;
  readonly hasChanges: boolean;
  readonly setClauses: readonly string[];
  readonly setParams: readonly unknown[];
}

/**
 * Applies an `UpdateChatDto` to an existing `ChatRow`.
 *
 * Supported updates:
 * - `title`: set to new string, or cleared with explicit `null`.
 * - `projectId`: set to new project ID, or cleared with explicit `null` (moving out of a project).
 * - Empty body (`{}`): idempotent no-op (`updated_at` untouched).
 */
export function applyChatUpdates(
  existingRow: ChatRow,
  dto: UpdateChatDto,
  options?: { readonly now?: string },
): ChatUpdateResult {
  const changedColumns: Record<string, unknown> = {};
  const setClauses: string[] = [];
  const setParams: unknown[] = [];

  function recordChange(column: keyof ChatRow, value: unknown): void {
    changedColumns[column] = value;
    setClauses.push(`${column} = ?`);
    setParams.push(value);
  }

  if (dto.title !== undefined) {
    const nextTitle = dto.title ?? null;
    if (nextTitle !== existingRow.title) {
      recordChange('title', nextTitle);
    }
  }

  if (dto.projectId !== undefined) {
    const nextProjectId = dto.projectId ?? null;
    if (nextProjectId !== existingRow.project_id) {
      recordChange('project_id', nextProjectId);
    }
  }

  const hasChanges = setClauses.length > 0;
  const updatedAt = hasChanges
    ? (options?.now ?? nowIso())
    : existingRow.updated_at;

  if (hasChanges) {
    changedColumns.updated_at = updatedAt;
    setClauses.push('updated_at = ?');
    setParams.push(updatedAt);
  }

  const updatedRow: ChatRow = {
    ...existingRow,
    ...(changedColumns as Partial<ChatRow>),
    updated_at: updatedAt,
  };

  return { updatedRow, hasChanges, setClauses, setParams };
}
