import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { MAX_CHAT_TITLE_LENGTH, type Chat } from '../../../core/api/chats.models';
import { ChatsService } from '../../../core/api/chats.service';
import { NotificationService } from '../../../core/notifications/notification.service';

export interface ChatRenameData {
  readonly chat: Chat;
}

/**
 * Retitles a chat from the list, without having to open it.
 *
 * Emptying the field clears the title rather than storing a blank one: the
 * list then shows the chat as untitled, which is a state the API has and the
 * UI can already render.
 */
@Component({
  selector: 'app-chat-rename-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    ReactiveFormsModule,
  ],
  template: `
    <h2 mat-dialog-title>Rename chat</h2>

    @if (saving()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <mat-dialog-content>
      <form class="form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field class="form__field">
          <mat-label>Title</mat-label>
          <input matInput formControlName="title" placeholder="Untitled chat" cdkFocusInitial />
          <mat-hint>Clear the field to leave the chat untitled.</mat-hint>
          @if (form.controls.title.hasError('maxlength')) {
            <mat-error>A title may be at most {{ maxTitleLength }} characters.</mat-error>
          }
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button matButton [disabled]="saving()" (click)="dialogRef.close()">Cancel</button>
      <button matButton="filled" [disabled]="saving() || form.invalid" (click)="save()">
        Save
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      padding-top: 0.5rem;
      min-width: min(24rem, 70vw);
    }

    .form__field {
      width: 100%;
    }
  `,
})
export class ChatRenameDialog {
  private readonly chats = inject(ChatsService);
  private readonly notify = inject(NotificationService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly dialogRef = inject<MatDialogRef<ChatRenameDialog, Chat>>(MatDialogRef);
  private readonly data = inject<ChatRenameData>(MAT_DIALOG_DATA);

  protected readonly saving = signal(false);
  protected readonly maxTitleLength = MAX_CHAT_TITLE_LENGTH;

  protected readonly form = this.formBuilder.nonNullable.group({
    title: [this.data.chat.title ?? '', [Validators.maxLength(MAX_CHAT_TITLE_LENGTH)]],
  });

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const trimmed = this.form.getRawValue().title.trim();
    const title = trimmed === '' ? null : trimmed;

    // Nothing to send: the API would treat it as a no-op anyway, and a
    // request that changes nothing should not report that it did.
    if (title === (this.data.chat.title ?? null)) {
      this.dialogRef.close();
      return;
    }

    this.saving.set(true);

    this.chats.update(this.data.chat.id, { title }).subscribe({
      next: (chat) => {
        this.saving.set(false);
        this.notify.success(title ? 'Chat renamed.' : 'Title cleared.');
        this.dialogRef.close(chat);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notify.error(error, 'Could not rename the chat.');
      },
    });
  }
}
