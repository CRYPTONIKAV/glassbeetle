import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from './api-base';
import type { Chat, ChatListQuery, CreateChatInput, UpdateChatInput } from './chats.models';
import { toHttpParams } from './http-params';
import type { PaginatedResponse } from './pagination';

/** `/api/v1/chats` — the conversation containers agents and teams own. */
@Injectable({ providedIn: 'root' })
export class ChatsService extends ApiClient {
  /**
   * One page of chats.
   *
   * The filters pass through as they are, including the literal `'null'` the
   * endpoint uses to select chats with no project, agent or team.
   */
  list(query: ChatListQuery = {}): Observable<PaginatedResponse<Chat>> {
    return this.http.get<PaginatedResponse<Chat>>(this.url('/chats'), {
      params: toHttpParams({ ...query }),
    });
  }

  get(chatId: string): Observable<Chat> {
    return this.http.get<Chat>(this.url(`/chats/${chatId}`));
  }

  /**
   * Creates a chat under exactly one owner.
   *
   * The owner rule is the API's, not this client's: sending both an `agentId`
   * and a `teamId`, or neither, comes back as a 400 rather than being fixed up
   * here, so the UI and the API agree on what a chat is.
   */
  create(input: CreateChatInput): Observable<Chat> {
    return this.http.post<Chat>(this.url('/chats'), input);
  }

  /**
   * Partial update. Keys absent from `input` are left untouched; an explicit
   * `null` clears the title or detaches the chat from its project.
   */
  update(chatId: string, input: UpdateChatInput): Observable<Chat> {
    return this.http.patch<Chat>(this.url(`/chats/${chatId}`), input);
  }

  /**
   * Deletes the chat.
   *
   * The messages go with it — the column cascades — while artifacts produced
   * in the conversation survive with their `chatId` cleared.
   */
  remove(chatId: string): Observable<void> {
    return this.http.delete<void>(this.url(`/chats/${chatId}`));
  }
}
