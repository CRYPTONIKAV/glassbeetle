import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { Subject, catchError, firstValueFrom, map, of, switchMap } from 'rxjs';

import { describeApiError, toApiError, type ApiError } from '../../../core/api/api-error';
import { MAX_CHAT_TITLE_LENGTH, ownerOf, titleOf, type Chat } from '../../../core/api/chats.models';
import { ChatsService } from '../../../core/api/chats.service';
import { TeamsService } from '../../../core/api/teams.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AgentRosterService } from '../../../core/workspace/agent-roster.service';
import { confirm } from '../../../shared/confirm-dialog/confirm-dialog';
import { RelativeTimePipe } from '../../../shared/relative-time/relative-time.pipe';
import { Panel } from '../../../shared/ui/panel';
import { Skeleton } from '../../../shared/ui/skeleton';

interface LoadResult {
  readonly chat: Chat | null;
  readonly error: ApiError | null;
}

/**
 * One chat: what it is called, who it belongs to, and what has been summarised
 * from it.
 *
 * There is no transcript on this page because there is no endpoint for one —
 * `/chats/:chatId/messages` and the completion endpoints are empty
 * controllers. The page says so where the transcript will go rather than
 * showing an input that could not send anything.
 */
@Component({
  selector: 'app-chat-detail',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatTooltipModule,
    Panel,
    ReactiveFormsModule,
    RelativeTimePipe,
    RouterLink,
    Skeleton,
  ],
  templateUrl: './chat-detail.html',
  styleUrl: './chat-detail.scss',
})
export class ChatDetail {
  private readonly chats = inject(ChatsService);
  private readonly teams = inject(TeamsService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  private readonly roster = inject(AgentRosterService);

  /** Bound from the route (`withComponentInputBinding`). */
  readonly chatId = input.required<string>();

  private readonly loads = new Subject<string>();
  private readonly ownerLookups = new Subject<string | null>();

  protected readonly chat = signal<Chat | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  /** The owning team's name, once it has been read. */
  private readonly teamName = signal<string | null>(null);

  protected readonly maxTitleLength = MAX_CHAT_TITLE_LENGTH;

  protected readonly form = this.formBuilder.nonNullable.group({
    title: ['', [Validators.maxLength(MAX_CHAT_TITLE_LENGTH)]],
  });

  protected readonly owner = computed(() => {
    const chat = this.chat();
    return chat ? ownerOf(chat) : null;
  });

  /**
   * The owner's name and where to find it.
   *
   * An agent's name comes from the roster the shell already holds — the same
   * source the rail uses, so the two cannot disagree. A team is read on its
   * own because the shell does not hold teams, and until that lands the id
   * stands in for the name.
   */
  protected readonly ownerName = computed(() => {
    const owner = this.owner();
    if (!owner) {
      return null;
    }

    if (owner.kind === 'agent') {
      return this.roster.agents().find((agent) => agent.id === owner.id)?.name ?? owner.id;
    }

    return this.teamName() ?? owner.id;
  });

  protected readonly ownerLink = computed(() => {
    const owner = this.owner();
    return owner ? [owner.kind === 'agent' ? '/agents' : '/teams', owner.id] : null;
  });

  /** The title as stored, for the heading and the delete confirmation. */
  protected readonly heading = computed(() => {
    const chat = this.chat();
    return chat ? titleOf(chat) : '';
  });

  protected readonly untitled = computed(() => !this.chat()?.title);

  /**
   * What is in the title field, as a signal.
   *
   * The control's value is read through `valueChanges` rather than from the
   * template so that `titleChanged` is a real computed: a plain
   * `form.getRawValue()` call inside one would never recompute as the user
   * types.
   */
  private readonly typedTitle = toSignal(this.form.controls.title.valueChanges, {
    initialValue: '',
  });

  /** True when the field holds something other than what is stored. */
  protected readonly titleChanged = computed(() => {
    const chat = this.chat();
    if (!chat) {
      return false;
    }

    const trimmed = this.typedTitle().trim();
    return (trimmed === '' ? null : trimmed) !== (chat.title ?? null);
  });

  constructor() {
    // `switchMap` rather than a subscribe per id: navigating from one chat to
    // the next must not leave a slow first response overwriting the second.
    this.loads
      .pipe(
        switchMap((chatId) =>
          this.chats.get(chatId).pipe(
            map((chat): LoadResult => ({ chat, error: null })),
            catchError((error: unknown) =>
              of<LoadResult>({ chat: null, error: toApiError(error) }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ chat, error }) => {
        this.chat.set(chat);
        this.error.set(error);
        this.loading.set(false);
        this.reset();
      });

    // Same reasoning, for the owning team's name.
    this.ownerLookups
      .pipe(
        switchMap((teamId) =>
          teamId === null
            ? of<string | null>(null)
            : this.teams.get(teamId).pipe(
                map((team) => team.name),
                // The id is already on screen as the fallback; a failed name
                // lookup is not worth reporting over the chat itself.
                catchError(() => of<string | null>(null)),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((name) => this.teamName.set(name));

    effect(() => this.load(this.chatId()));

    effect(() => this.ownerLookups.next(this.chat()?.teamId ?? null));
  }

  protected load(chatId: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.loads.next(chatId);
  }

  /** Puts the form back to what the API last returned. */
  protected reset(): void {
    this.form.reset({ title: this.chat()?.title ?? '' });
  }

  /**
   * Saves the title, or clears it.
   *
   * Only sent when it actually differs: the API treats an unchanged PATCH as a
   * no-op, and a request that changes nothing should not report that it did.
   */
  protected save(): void {
    const chat = this.chat();
    const title = this.nextTitle();

    if (!chat || this.form.invalid || this.saving() || title === undefined) {
      return;
    }

    this.saving.set(true);

    this.chats.update(chat.id, { title }).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.chat.set(updated);
        this.reset();
        this.notify.success(title ? 'Title saved.' : 'Title cleared.');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notify.error(error, 'Could not save the title.');
      },
    });
  }

  /** Detaches the chat from its project, which `projectId: null` does. */
  protected async detachProject(): Promise<void> {
    const chat = this.chat();
    if (!chat || !chat.projectId || this.saving()) {
      return;
    }

    const confirmed = await confirm(this.dialog, {
      title: 'Remove from project?',
      message:
        'The chat stays, with its history, but no longer belongs to a project. ' +
        'It can be put back once the projects endpoints exist.',
      confirmLabel: 'Remove',
      destructive: false,
    });

    if (!confirmed) {
      return;
    }

    this.saving.set(true);

    try {
      const updated = await firstValueFrom(this.chats.update(chat.id, { projectId: null }));
      this.chat.set(updated);
      this.notify.success('Chat removed from its project.');
    } catch (error) {
      this.notify.error(error, 'Could not remove the chat from its project.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const chat = this.chat();
    if (!chat) {
      return;
    }

    const confirmed = await confirm(this.dialog, {
      title: 'Delete chat?',
      message:
        `“${titleOf(chat)}” and its message history will be deleted. ` +
        `Artifacts produced in it are kept, without their link to the chat. ` +
        `This cannot be undone.`,
      confirmLabel: 'Delete',
    });

    if (!confirmed) {
      return;
    }

    try {
      await firstValueFrom(this.chats.remove(chat.id));
      this.notify.success('Chat deleted.');
      void this.router.navigate(['/chats']);
    } catch (error) {
      this.notify.error(error, 'Could not delete the chat.');
    }
  }

  protected describe(error: ApiError): string {
    return describeApiError(error);
  }

  /**
   * The title to send, or `undefined` when there is nothing to send.
   *
   * An emptied field clears the stored title with an explicit `null` rather
   * than storing a blank string, which is the distinction the API makes.
   */
  private nextTitle(): string | null | undefined {
    const chat = this.chat();
    if (!chat) {
      return undefined;
    }

    const trimmed = this.form.getRawValue().title.trim();
    const next = trimmed === '' ? null : trimmed;

    return next === (chat.title ?? null) ? undefined : next;
  }
}
