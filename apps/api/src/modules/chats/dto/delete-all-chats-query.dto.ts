import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsNotEmpty } from 'class-validator';

/**
 * Query parameters for the bulk chat deletion endpoint (DELETE /api/v1/chats).
 *
 * Clearing all chats is an irreversible, untargeted operation that destroys
 * all conversation history and cascaded messages.
 *
 * To protect against accidental invocation and unauthenticated cross-site requests,
 * callers must explicitly authorize destruction with `?confirm=true`.
 * This confirmation parameter matches the convention used by the bulk memory deletion endpoints.
 */
export class DeleteAllChatsQueryDto {
  @ApiProperty({
    description:
      'Safety confirmation parameter. Must be set to "true" to authorize irreversible deletion.',
    example: 'true',
    type: String,
  })
  @IsNotEmpty({
    message: 'confirm query parameter is required',
  })
  @Equals('true', {
    message: 'confirm must be "true" to authorize irreversible deletion',
  })
  confirm!: string;
}
