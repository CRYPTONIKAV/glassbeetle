import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { ownerOf, titleOf, type Chat } from './chats.models';
import { ChatsService } from './chats.service';

const CHATS_URL = `${environment.apiBaseUrl}/chats`;

const CHAT: Chat = {
  id: 'c1',
  title: 'Release planning',
  projectId: null,
  agentId: 'a1',
  teamId: null,
  contextSummary: null,
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-02T08:00:00.000Z',
};

function setup() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });

  return {
    chats: TestBed.inject(ChatsService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('ChatsService', () => {
  it('asks for a page with the pagination and sorting the API documents', () => {
    const { chats, httpMock } = setup();

    chats.list({ limit: 25, offset: 50, sort: 'updatedAt', order: 'desc' }).subscribe();

    const request = httpMock.expectOne((candidate) => candidate.url === CHATS_URL);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('limit')).toBe('25');
    expect(request.request.params.get('offset')).toBe('50');
    expect(request.request.params.get('sort')).toBe('updatedAt');
    expect(request.request.params.get('order')).toBe('desc');
  });

  it('filters by owner', () => {
    const { chats, httpMock } = setup();

    chats.list({ agentId: 'a1' }).subscribe();

    const request = httpMock.expectOne((candidate) => candidate.url === CHATS_URL);
    expect(request.request.params.get('agentId')).toBe('a1');
    expect(request.request.params.has('teamId')).toBe(false);
  });

  it("keeps the literal 'null' the API uses to select an empty column", () => {
    const { chats, httpMock } = setup();

    chats.list({ agentId: 'null', teamId: 'null' }).subscribe();

    const request = httpMock.expectOne((candidate) => candidate.url === CHATS_URL);
    expect(request.request.params.get('agentId')).toBe('null');
    expect(request.request.params.get('teamId')).toBe('null');
  });

  it('sends no empty filters, which the API would read as filters', () => {
    const { chats, httpMock } = setup();

    chats.list({ agentId: '', teamId: undefined }).subscribe();

    const request = httpMock.expectOne((candidate) => candidate.url === CHATS_URL);
    expect(request.request.params.keys()).toEqual([]);
  });

  it('reads one chat', () => {
    const { chats, httpMock } = setup();
    let received: Chat | null = null;

    chats.get('c1').subscribe((chat) => (received = chat));
    httpMock.expectOne(`${CHATS_URL}/c1`).flush(CHAT);

    expect(received).toEqual(CHAT);
  });

  it('creates a chat under exactly the owner it was given', () => {
    const { chats, httpMock } = setup();

    chats.create({ agentId: 'a1', title: 'Release planning' }).subscribe();

    const request = httpMock.expectOne(CHATS_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ agentId: 'a1', title: 'Release planning' });
  });

  it('patches only what it is given', () => {
    const { chats, httpMock } = setup();

    chats.update('c1', { title: 'Renamed' }).subscribe();

    const request = httpMock.expectOne(`${CHATS_URL}/c1`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ title: 'Renamed' });
  });

  it('clears a field with an explicit null rather than omitting it', () => {
    const { chats, httpMock } = setup();

    chats.update('c1', { title: null, projectId: null }).subscribe();

    expect(httpMock.expectOne(`${CHATS_URL}/c1`).request.body).toEqual({
      title: null,
      projectId: null,
    });
  });

  it('deletes a chat', () => {
    const { chats, httpMock } = setup();

    chats.remove('c1').subscribe();

    expect(httpMock.expectOne(`${CHATS_URL}/c1`).request.method).toBe('DELETE');
  });
});

describe('chat helpers', () => {
  it('reports the agent as the owner', () => {
    expect(ownerOf(CHAT)).toEqual({ kind: 'agent', id: 'a1' });
  });

  it('reports the team as the owner', () => {
    expect(ownerOf({ ...CHAT, agentId: null, teamId: 't1' })).toEqual({ kind: 'team', id: 't1' });
  });

  it('reports no owner once the agent or team has been deleted', () => {
    expect(ownerOf({ ...CHAT, agentId: null, teamId: null })).toBeNull();
  });

  it('names an untitled chat without storing a title for it', () => {
    expect(titleOf({ ...CHAT, title: null })).toBe('Untitled chat');
    expect(titleOf({ ...CHAT, title: '   ' })).toBe('Untitled chat');
    expect(titleOf(CHAT)).toBe('Release planning');
  });
});
