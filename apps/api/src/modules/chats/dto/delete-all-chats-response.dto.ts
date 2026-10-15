import { ApiProperty } from '@nestjs/swagger';

/**
 * Response payload returned upon successful bulk deletion of all chats.
 *
 * Provides counts of both deleted chats and cascaded messages so callers and UIs
 * can report exactly what was removed.
 */
export class DeleteAllChatsResponseDto {
  @ApiProperty({
    description: 'The number of chats permanently deleted',
    example: 12,
  })
  readonly deletedChats!: number;

  @ApiProperty({
    description: 'The number of messages permanently deleted via cascade',
    example: 438,
  })
  readonly deletedMessages!: number;
}
