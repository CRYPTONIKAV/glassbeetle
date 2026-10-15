import { Test, type TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatsController } from './chats.controller.js';
import { ChatsService } from './chats.service.js';
import type { ChatResponseDto } from './dto/chat-response.dto.js';

const CHAT: ChatResponseDto = {
  id: '018f3a9e-0000-7000-8000-000000000001',
  title: 'Architecture Discussion',
  projectId: '018f3a9e-0000-7000-8000-000000000002',
  agentId: '018f3a9e-0000-7000-8000-000000000003',
  teamId: null,
  contextSummary: null,
  createdAt: '2026-10-15T08:00:00.000Z',
  updatedAt: '2026-10-15T08:00:00.000Z',
};

describe('ChatsController', () => {
  let controller: ChatsController;
  let service: ChatsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatsController],
      providers: [
        {
          provide: ChatsService,
          useValue: {
            findAll: vi.fn().mockResolvedValue({
              items: [CHAT],
              total: 1,
              limit: 50,
              offset: 0,
            }),
            findOne: vi.fn().mockResolvedValue(CHAT),
            create: vi.fn().mockResolvedValue(CHAT),
            update: vi.fn().mockResolvedValue(CHAT),
            delete: vi.fn().mockResolvedValue(undefined),
            removeAll: vi
              .fn()
              .mockResolvedValue({ deletedChats: 5, deletedMessages: 20 }),
          },
        },
      ],
    }).compile();

    controller = module.get(ChatsController);
    service = module.get(ChatsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates findAll passing query parameters through', async () => {
    const query = {
      limit: 10,
      offset: 0,
      projectId: '018f3a9e-0000-7000-8000-000000000002',
      agentId: '018f3a9e-0000-7000-8000-000000000003',
    };

    const result = await controller.findAll(query);

    expect(result).toEqual({
      items: [CHAT],
      total: 1,
      limit: 50,
      offset: 0,
    });
    expect(service.findAll).toHaveBeenCalledWith(query);
  });

  it('delegates findOne by chatId', async () => {
    await expect(controller.findOne(CHAT.id)).resolves.toBe(CHAT);
    expect(service.findOne).toHaveBeenCalledWith(CHAT.id);
  });

  it('creates a chat and sets the Location header', async () => {
    const res = { setHeader: vi.fn() } as unknown as Response;

    const result = await controller.create(
      {
        agentId: CHAT.agentId,
        title: CHAT.title,
      },
      res,
    );

    expect(result).toBe(CHAT);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Location',
      `/api/v1/chats/${CHAT.id}`,
    );
  });

  it('delegates update by chatId', async () => {
    const updateDto = { title: 'Renamed Chat' };
    await controller.update(CHAT.id, updateDto);

    expect(service.update).toHaveBeenCalledWith(CHAT.id, updateDto);
  });

  it('delegates delete by chatId', async () => {
    await expect(controller.delete(CHAT.id)).resolves.toBeUndefined();
    expect(service.delete).toHaveBeenCalledWith(CHAT.id);
  });

  it('delegates removeAll (delete all chats)', async () => {
    const result = await controller.removeAll({ confirm: 'true' });
    expect(result).toEqual({ deletedChats: 5, deletedMessages: 20 });
    expect(service.removeAll).toHaveBeenCalled();
  });
});
