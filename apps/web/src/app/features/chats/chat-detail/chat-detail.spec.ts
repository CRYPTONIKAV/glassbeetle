import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type { Agent } from '../../../core/api/agents.models';
import type { Chat } from '../../../core/api/chats.models';
import { AgentRosterService } from '../../../core/workspace/agent-roster.service';
import { ChatDetail } from './chat-detail';

const CHAT_URL = `${environment.apiBaseUrl}/chats/c1`;
const TEAM_URL = `${environment.apiBaseUrl}/teams/t1`;

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

function chat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: 'c1',
    title: 'Release planning',
    projectId: null,
    agentId: 'a1',
    teamId: null,
    contextSummary: null,
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-02T08:00:00.000Z',
    ...overrides,
  };
}

interface ChatDetailInternals {
  readonly form: { setValue(value: { title: string }): void };
  save(): void;
  detachProject(): Promise<void>;
  load(chatId: string): void;
}

function configure() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ChatDetail],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: AgentRosterService,
        useValue: {
          agents: signal<readonly Agent[]>([AGENT]),
          loading: signal(false),
          loaded: signal(true),
          refresh: () => undefined,
        },
      },
      { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(true) }) } },
    ],
  });

  const httpMock = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(ChatDetail);
  fixture.componentRef.setInput('chatId', 'c1');

  return { fixture, httpMock };
}

function setup(current: Chat = chat()) {
  const { fixture, httpMock } = configure();
  fixture.detectChanges();

  httpMock.expectOne(CHAT_URL).flush(current);
  fixture.detectChanges();

  return {
    fixture,
    httpMock,
    element: fixture.nativeElement as HTMLElement,
    component: fixture.componentInstance as unknown as ChatDetailInternals,
  };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function patch(httpMock: HttpTestingController): TestRequest {
  return httpMock.expectOne(CHAT_URL);
}

describe('ChatDetail', () => {
  it('shows the chat and names the agent it belongs to', () => {
    const { element } = setup();

    expect(element.textContent).toContain('Release planning');
    expect(element.textContent).toContain('Research Assistant');
  });

  it('reads the owning team by name, which the shell does not hold', () => {
    const { httpMock, fixture } = setup(chat({ agentId: null, teamId: 't1' }));

    httpMock.expectOne(TEAM_URL).flush({
      id: 't1',
      name: 'Research Desk',
      description: null,
      memberCount: 2,
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-01T08:00:00.000Z',
    });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Research Desk');
  });

  it('names an untitled chat without pretending it has a title', () => {
    const { element } = setup(chat({ title: null }));

    expect(element.querySelector('.view__title')?.textContent?.trim()).toBe('Untitled chat');
  });

  it('says the conversation turns are not served yet rather than faking a composer', () => {
    const { element } = setup();

    expect(element.textContent).toContain('No messages yet');
    expect(element.querySelector('textarea')).toBeNull();
  });

  it('shows a compacted summary when there is one', () => {
    const { element } = setup(chat({ contextSummary: 'Earlier turns, condensed.' }));

    expect(element.querySelector('.summary')?.textContent?.trim()).toBe(
      'Earlier turns, condensed.',
    );
  });

  it('saves a new title', () => {
    const { component, httpMock } = setup();

    component.form.setValue({ title: '  Renamed  ' });
    component.save();

    const request = patch(httpMock);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ title: 'Renamed' });
    request.flush(chat({ title: 'Renamed' }));
  });

  it('clears an emptied title with null rather than a blank string', () => {
    const { component, httpMock } = setup();

    component.form.setValue({ title: '   ' });
    component.save();

    const request = patch(httpMock);
    expect(request.request.body).toEqual({ title: null });
    request.flush(chat({ title: null }));
  });

  it('sends nothing when the title is retyped as it was', () => {
    const { component, httpMock } = setup();

    component.form.setValue({ title: 'Release planning' });
    component.save();

    httpMock.expectNone(CHAT_URL);
  });

  it('detaches the chat from its project with an explicit null', async () => {
    const { component, httpMock } = setup(chat({ projectId: 'p1' }));

    const pending = component.detachProject();
    await tick();

    const request = patch(httpMock);
    expect(request.request.body).toEqual({ projectId: null });
    request.flush(chat({ projectId: null }));
    await pending;
  });

  it('reports a chat that is not there as missing, not as a failure', () => {
    const { fixture, httpMock } = configure();
    fixture.detectChanges();

    httpMock
      .expectOne(CHAT_URL)
      .flush(
        { statusCode: 404, code: 'CHAT_NOT_FOUND', message: 'Chat with ID "c1" not found' },
        { status: 404, statusText: 'Not Found' },
      );
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Chat not found');
    const hrefs = Array.from(element.querySelectorAll('a[href]')).map((link) =>
      link.getAttribute('href'),
    );
    expect(hrefs).toContain('/chats');
  });

  it('offers a retry when the read failed for another reason', () => {
    const { fixture, httpMock } = configure();
    fixture.detectChanges();

    httpMock
      .expectOne(CHAT_URL)
      .flush(
        { statusCode: 500, code: 'INTERNAL', message: 'boom' },
        { status: 500, statusText: 'Server Error' },
      );
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('boom');

    (fixture.componentInstance as unknown as ChatDetailInternals).load('c1');
    httpMock.expectOne(CHAT_URL).flush(chat());
  });

  it('abandons the request for the chat it was navigated away from', () => {
    const { fixture, httpMock } = configure();
    fixture.detectChanges();

    const first = httpMock.expectOne(CHAT_URL);

    fixture.componentRef.setInput('chatId', 'c2');
    fixture.detectChanges();

    const second = httpMock.expectOne(`${environment.apiBaseUrl}/chats/c2`);

    // Without the switch, a slow first response could land after the second
    // and leave the page showing the chat that is no longer open.
    expect(first.cancelled).toBe(true);

    second.flush(chat({ id: 'c2', title: 'Second' }));
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Second');
  });
});
