import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';

import {
  MAX_CHAT_TITLE_LENGTH,
  type Chat,
  type ChatOwner,
  type CreateChatInput,
} from '../../../core/api/chats.models';
import { ChatsService } from '../../../core/api/chats.service';
import type { Team } from '../../../core/api/teams.models';
import { TeamsService } from '../../../core/api/teams.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AgentRosterService } from '../../../core/workspace/agent-roster.service';

/** What the chat list hands in when it already knows who the chat is for. */
export interface ChatCreateData {
  readonly defaultOwner?: ChatOwner | null;
}

/** The owner select's value, which has to name both a kind and an id. */
function ownerValue(owner: ChatOwner): string {
  return `${owner.kind}:${owner.id}`;
}

/**
 * Creates a chat under one agent or one team.
 *
 * The owner is asked for here rather than on the chat's own page because the
 * API will not move a conversation afterwards: its history belongs to whoever
 * produced it. Title is optional — the list names an untitled chat itself, and
 * a conversation is usually worth naming only once there is something in it.
 */
@Component({
  selector: 'app-chat-create-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  template: `
    <h2 mat-dialog-title>New chat</h2>

    @if (saving()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <mat-dialog-content>
      @if (!hasOwners() && loaded()) {
        <p class="blank">
          A chat belongs to an agent or a team, and this workspace has neither yet. Create an
          <a routerLink="/agents" [queryParams]="{ new: 1 }" (click)="dialogRef.close()">agent</a>
          or a
          <a routerLink="/teams" [queryParams]="{ new: 1 }" (click)="dialogRef.close()">team</a>
          first.
        </p>
      } @else {
        <form class="form" [formGroup]="form" (ngSubmit)="create()">
          <mat-form-field class="form__field">
            <mat-label>Owner</mat-label>
            <mat-select formControlName="owner" [disabled]="!loaded()" cdkFocusInitial>
              @if (agents().length) {
                <mat-optgroup label="Agents">
                  @for (agent of agents(); track agent.id) {
                    <mat-option [value]="'agent:' + agent.id">{{ agent.name }}</mat-option>
                  }
                </mat-optgroup>
              }
              @if (teams().length) {
                <mat-optgroup label="Teams">
                  @for (team of teams(); track team.id) {
                    <mat-option [value]="'team:' + team.id">{{ team.name }}</mat-option>
                  }
                </mat-optgroup>
              }
            </mat-select>
            <mat-hint>
              {{ loaded() ? 'The owner cannot be changed later.' : 'Reading the workspace…' }}
            </mat-hint>
            @if (form.controls.owner.hasError('required')) {
              <mat-error>A chat needs an agent or a team to belong to.</mat-error>
            }
          </mat-form-field>

          <mat-form-field class="form__field">
            <mat-label>Title</mat-label>
            <input matInput formControlName="title" placeholder="Optional" />
            <mat-hint>Leave this empty and the chat is listed as untitled.</mat-hint>
            @if (form.controls.title.hasError('maxlength')) {
              <mat-error>A title may be at most {{ maxTitleLength }} characters.</mat-error>
            }
          </mat-form-field>
        </form>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button matButton [disabled]="saving()" (click)="dialogRef.close()">Cancel</button>
      @if (hasOwners() || !loaded()) {
        <button matButton="filled" [disabled]="saving() || form.invalid" (click)="create()">
          <mat-icon>add</mat-icon>
          Create
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding-top: 0.5rem;
      min-width: min(26rem, 70vw);
    }

    .form__field {
      width: 100%;
    }

    .blank {
      margin: 0;
      max-width: 26rem;
      color: var(--mat-sys-on-surface-variant);
      line-height: 1.55;
    }
  `,
})
export class ChatCreateDialog {
  private readonly chats = inject(ChatsService);
  private readonly teamsApi = inject(TeamsService);
  private readonly notify = inject(NotificationService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly roster = inject(AgentRosterService);

  protected readonly dialogRef = inject<MatDialogRef<ChatCreateDialog, Chat>>(MatDialogRef);
  private readonly data = inject<ChatCreateData | null>(MAT_DIALOG_DATA, { optional: true });

  protected readonly saving = signal(false);
  protected readonly maxTitleLength = MAX_CHAT_TITLE_LENGTH;

  /** The rail's roster, so picking an agent costs no request of its own. */
  protected readonly agents = this.roster.agents;
  protected readonly teams = signal<readonly Team[]>([]);
  private readonly teamsLoaded = signal(false);

  /** True once both sides of the owner picker have been answered for. */
  protected readonly loaded = computed(() => this.roster.loaded() && this.teamsLoaded());

  protected readonly hasOwners = computed(
    () => this.agents().length > 0 || this.teams().length > 0,
  );

  protected readonly form = this.formBuilder.nonNullable.group({
    owner: ['', [Validators.required]],
    title: ['', [Validators.maxLength(MAX_CHAT_TITLE_LENGTH)]],
  });

  constructor() {
    const owner = this.data?.defaultOwner;
    if (owner) {
      // Opened from a list already filtered to one agent or team: that is
      // almost certainly who the new chat is for.
      this.form.controls.owner.setValue(ownerValue(owner));
    }

    // The shell loads the roster on startup; this covers the case where that
    // request has not landed yet or failed.
    if (!this.roster.loaded() && !this.roster.loading()) {
      this.roster.refresh();
    }

    // A team roster is a handful of teams, and 100 is the API's page ceiling.
    this.teamsApi.list({ limit: 100, sort: 'name', order: 'asc' }).subscribe({
      next: (page) => {
        this.teams.set(page.items);
        this.teamsLoaded.set(true);
      },
      // Costs the picker its teams; agents are still offered.
      error: () => this.teamsLoaded.set(true),
    });
  }

  protected create(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);

    this.chats.create(this.buildInput()).subscribe({
      next: (chat) => {
        this.saving.set(false);
        this.notify.success('Chat created.');
        this.dialogRef.close(chat);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notify.error(error, 'Could not create the chat.');
      },
    });
  }

  /**
   * Builds the request body.
   *
   * Exactly one owner key is sent: the API rejects a body carrying both, even
   * when one of them is null.
   */
  private buildInput(): CreateChatInput {
    const { owner, title } = this.form.getRawValue();
    const [kind, id] = [owner.slice(0, owner.indexOf(':')), owner.slice(owner.indexOf(':') + 1)];
    const trimmed = title.trim();

    return {
      ...(kind === 'team' ? { teamId: id } : { agentId: id }),
      // An empty title is left out rather than sent as null: there is nothing
      // to clear on a chat that does not exist yet.
      ...(trimmed ? { title: trimmed } : {}),
    };
  }
}
