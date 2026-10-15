import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorResponseDto } from '../../common/http/api-error.js';
import type { PaginatedResponse } from '../../common/pagination/paginated-response.dto.js';
import { ChatsService } from './chats.service.js';
import {
  ChatResponseDto,
  CreateChatDto,
  DeleteAllChatsQueryDto,
  DeleteAllChatsResponseDto,
  ListChatsQueryDto,
  PaginatedChatsResponseDto,
  UpdateChatDto,
} from './dto/index.js';

@ApiTags('chats')
@Controller('chats')
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  @ApiOperation({
    summary: 'List chats',
    description:
      'Retrieves stored chats with pagination, sorting and filters (projectId, agentId, teamId).',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description:
      'Maximum number of items returned per page (default: 50, max: 100)',
    example: 50,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Zero-based offset of the first item returned (default: 0)',
    example: 0,
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    type: String,
    description: "Field to sort by ('createdAt', 'updatedAt', 'title', 'id')",
    example: 'createdAt',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    description: "Sort direction (default: 'desc')",
    example: 'desc',
  })
  @ApiQuery({
    name: 'projectId',
    required: false,
    type: String,
    description:
      'Filter by project ID, or "null" to filter for chats outside any project',
    example: '018f3a9e-0000-7000-8000-000000000002',
  })
  @ApiQuery({
    name: 'agentId',
    required: false,
    type: String,
    description: 'Filter by owning agent ID',
    example: '018f3a9e-0000-7000-8000-000000000003',
  })
  @ApiQuery({
    name: 'teamId',
    required: false,
    type: String,
    description: 'Filter by owning team ID',
    example: '018f3a9e-0000-7000-8000-000000000004',
  })
  @ApiOkResponse({
    description: 'Paginated list of chats',
    type: PaginatedChatsResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid pagination, sorting or filter query parameters',
    type: ApiErrorResponseDto,
  })
  async findAll(
    @Query() query: ListChatsQueryDto,
  ): Promise<PaginatedResponse<ChatResponseDto>> {
    return this.chatsService.findAll(query);
  }

  @Get(':chatId')
  @ApiOperation({
    summary: 'Retrieve a chat',
    description:
      'Retrieves a single chat by ID, including its metadata and compacted context summary.',
  })
  @ApiParam({ name: 'chatId', description: 'Unique chat identifier (UUIDv7)' })
  @ApiOkResponse({
    description: 'Chat found and returned',
    type: ChatResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'No chat found with that ID',
    type: ApiErrorResponseDto,
  })
  async findOne(@Param('chatId') chatId: string): Promise<ChatResponseDto> {
    return this.chatsService.findOne(chatId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a chat',
    description: `Creates a conversation container with server-managed identifiers and timestamps.

Owner rule:
- A chat must belong to exactly one owner: either an agent or a team, never both and never neither.
- Referenced agentId, teamId, and projectId must exist.
- context_summary is read-only and cannot be supplied by clients.`,
  })
  @ApiCreatedResponse({
    description: 'Chat created successfully',
    type: ChatResponseDto,
    headers: {
      Location: {
        description: 'URI of the newly created chat',
        schema: {
          type: 'string',
          example: '/api/v1/chats/018f3a9e-0000-7000-8000-000000000001',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Request validation failed (e.g. owner rule violated, context_summary supplied, or server-managed fields provided)',
    type: ApiErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Referenced agentId, teamId, or projectId does not exist',
    type: ApiErrorResponseDto,
  })
  async create(
    @Body() dto: CreateChatDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ChatResponseDto> {
    const created = await this.chatsService.create(dto);
    res.setHeader('Location', `/api/v1/chats/${created.id}`);
    return created;
  }

  @Patch(':chatId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update a chat',
    description: `Applies partial updates to a chat.

- Only supplied fields are changed.
- title and projectId can be updated or cleared with an explicit null.
- Owner cannot be changed: message history was produced under the original owner.
- context_summary is read-only through this endpoint.
- An empty body is an idempotent no-op.`,
  })
  @ApiParam({ name: 'chatId', description: 'Unique chat identifier (UUIDv7)' })
  @ApiOkResponse({
    description: 'Chat updated successfully',
    type: ChatResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Request validation failed, or attempt made to change the owner or set context_summary',
    type: ApiErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'No chat found with that ID',
    type: ApiErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Referenced projectId does not exist',
    type: ApiErrorResponseDto,
  })
  async update(
    @Param('chatId') chatId: string,
    @Body() dto: UpdateChatDto,
  ): Promise<ChatResponseDto> {
    return this.chatsService.update(chatId, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete all chats',
    description: `Permanently and irreversibly deletes every chat and destroys all conversation history.

This is an untargeted, irreversible operation. To protect against accidental deletion or unauthenticated cross-site requests, callers must explicitly supply the \`?confirm=true\` query parameter.

Cascade behaviour:
- \`messages\` (\`chat_id NOT NULL REFERENCES chats(id) ON DELETE CASCADE\`): Every message in all chats is permanently destroyed.
- \`artifacts\` (\`chat_id REFERENCES chats(id) ON DELETE SET NULL\`): Artifacts survive with their \`chatId\` set to null.
- \`usage_events\` (\`chat_id REFERENCES chats(id) ON DELETE SET NULL\`): Usage telemetry survives with attribution unlinked, keeping historical usage totals intact.
- Agents, teams, projects, and memories are completely untouched.`,
  })
  @ApiQuery({
    name: 'confirm',
    description:
      'Safety confirmation parameter. Must be set to "true" to authorize irreversible deletion.',
    required: true,
    type: String,
    example: 'true',
  })
  @ApiOkResponse({
    description:
      'All chats successfully deleted, returning counts of deleted chats and messages',
    type: DeleteAllChatsResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Missing or invalid confirmation parameter (?confirm=true required)',
    type: ApiErrorResponseDto,
  })
  async removeAll(
    @Query() _query: DeleteAllChatsQueryDto,
  ): Promise<DeleteAllChatsResponseDto> {
    return this.chatsService.removeAll();
  }

  @Delete(':chatId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a chat',
    description: `Permanently deletes a chat.

Cascade behaviour:
- \`messages\` (\`chat_id NOT NULL REFERENCES chats(id) ON DELETE CASCADE\`): Conversation history is permanently destroyed.
- \`artifacts\` (\`chat_id REFERENCES chats(id) ON DELETE SET NULL\`): Artifacts survive with their chat_id reference cleared to null.`,
  })
  @ApiParam({ name: 'chatId', description: 'Unique chat identifier (UUIDv7)' })
  @ApiNoContentResponse({ description: 'Chat successfully deleted' })
  @ApiNotFoundResponse({
    description: 'No chat found with that ID',
    type: ApiErrorResponseDto,
  })
  async delete(@Param('chatId') chatId: string): Promise<void> {
    await this.chatsService.delete(chatId);
  }
}
