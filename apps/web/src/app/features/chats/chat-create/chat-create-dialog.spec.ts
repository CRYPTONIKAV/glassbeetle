import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';

import { environment } from '../../../../environments/environment';
import type { Agent } from '../../../core/api/agents.models';
import type { Chat } from '../../../core/api/chats.models';
import type { Team } from '../../../core/api/teams.models';
import { AgentRosterService } from '../../../core/workspace/agent-roster.service';
import { ChatCreateDialog, type ChatCreateData } from './chat-create-dialog';

const CHATS_URL = `${environment.apiBaseUrl}/chats`;
const TEAMS_URL = `${environment.apiBaseUrl}/teams`;

const AGENT: Agent = {
  id: 'a1',
  name: 'Research Assistant',
  personality: null,
  instructions: null,
  systemPromptId: null,
  modelId: null,
  temperature: null,
  maxTokens: null,
  modelParams: null,
  hasPicture: false,
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
};

const TEAM: Team = {
  id: 't1',
  name: 'Research Desk',
  description: null,
  memberCount: 2,
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
};

interface DialogInternals {
  readonly form: { setValue(value: { owner: string; title: string }): void };
  create(): void;
}

function setup(options: { data?: ChatCreateData; agents?: Agent[]; teams?: Team[] } = {}): {
  component: DialogInternals;
  httpMock: HttpTestingController;
  element: HTMLElement;
  closed: Chat[];
} {
  const closed: Chat[] = [];

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ChatCreateDialog],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: MAT_DIALOG_DATA, useValue: options.data ?? {} },
      {
        provide: MatDialogRef,
        useValue: {
          close: (chat?: Chat) => {
            if (chat) {
              closed.push(chat);
            }
          },
        },
      },
      {
        provide: AgentRosterService,
        useValue: {
          agents: signal<readonly Agent[]>(options.agents ?? [AGENT]),
          loading: signal(false),
          loaded: signal(true),
          refresh: () => undefined,
        },
      },
    ],
  });

  const httpMock = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(ChatCreateDialog);

  const teams = options.teams ?? [TEAM];
  httpMock
    .expectOne((request) => request.url === TEAMS_URL)
    .flush({ items: teams, total: teams.length, limit: 100, offset: 0 });
  fixture.detectChanges();

  return {
    component: fixture.componentInstance as unknown as DialogInternals,
    httpMock,
    element: fixture.nativeElement as HTMLElement,
    closed,
  };
}

function chat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: 'c1',
    title: null,
    projectId: null,
    agentId: 'a1',
    teamId: null,
    contextSummary: null,
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
    ...overrides,
  };
}

describe('ChatCreateDialog', () => {
  it('sends the agent as the only owner', () => {
    const { component, httpMock } = setup();

    component.form.setValue({ owner: 'agent:a1', title: '' });
    component.create();

    const request = httpMock.expectOne(CHATS_URL);
    expect(request.request.method).toBe('POST');
    // The API rejects a body carrying both owners, even when one is null.
    expect(request.request.body).toEqual({ agentId: 'a1' });
    request.flush(chat());
  });

  it('sends the team as the only owner', () => {
    const { component, httpMock } = setup();

    component.form.setValue({ owner: 'team:t1', title: 'Kickoff' });
    component.create();

    expect(httpMock.expectOne(CHATS_URL).request.body).toEqual({
      teamId: 't1',
      title: 'Kickoff',
    });
  });

  it('leaves a blank title out instead of sending null', () => {
    const { component, httpMock } = setup();

    component.form.setValue({ owner: 'agent:a1', title: '   ' });
    component.create();

    expect(httpMock.expectOne(CHATS_URL).request.body).toEqual({ agentId: 'a1' });
  });

  it('creates nothing without an owner, which the form requires', () => {
    const { component, httpMock } = setup();

    component.form.setValue({ owner: '', title: 'Orphan' });
    component.create();

    httpMock.expectNone(CHATS_URL);
  });

  it('closes with the created chat, so the caller can open it', () => {
    const { component, httpMock, closed } = setup();

    component.form.setValue({ owner: 'agent:a1', title: '' });
    component.create();
    httpMock.expectOne(CHATS_URL).flush(chat());

    expect(closed).toEqual([chat()]);
  });

  it('preselects the owner the list was filtered to', () => {
    const { component, httpMock } = setup({ data: { defaultOwner: { kind: 'team', id: 't1' } } });

    component.create();

    expect(httpMock.expectOne(CHATS_URL).request.body).toEqual({ teamId: 't1' });
  });

  it('asks for an agent or a team first when the workspace has neither', () => {
    const { element } = setup({ agents: [], teams: [] });

    expect(element.textContent).toContain('neither yet');
    expect(element.querySelector('mat-select')).toBeNull();
  });
});
