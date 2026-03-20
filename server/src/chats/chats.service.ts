import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { mapChat, type MappedChat } from '../common/mappers';
import type { User } from '@prisma/client';
import { ChatType } from '@prisma/client';

@Injectable()
export class ChatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getChatsForUser(
    userId: string,
    includeMembers = false,
  ): Promise<MappedChat[]> {
    const chats = await this.prisma.chat.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      include: {
        lastMessage: true,
        members: { include: { user: true } },
      },
      orderBy: {
        lastMessageAt: 'desc',
      },
    });

    return chats.map((chat) =>
      mapChat(chat, {
        includeLastMessage: true,
        includeMembers: includeMembers,
        currentUserId: userId,
      }),
    );
  }

  async createOrFindChat(
    currentUser: User,
    chatType: 'private' | 'group',
    name?: string,
    memberIds: string[] = [],
  ): Promise<MappedChat> {
    const type = chatType === 'private' ? ChatType.private : ChatType.group;

    if (type === ChatType.private) {
      if (memberIds.length !== 1) {
        throw new BadRequestException(
          'Private chat requires exactly one other member',
        );
      }
      const otherUserId = memberIds[0];
      if (otherUserId === currentUser.id) {
        throw new BadRequestException(
          'Cannot create private chat with yourself',
        );
      }

      const existing = await this.prisma.chat.findFirst({
        where: {
          chatType: ChatType.private,
          AND: [
            { members: { some: { userId: currentUser.id } } },
            { members: { some: { userId: otherUserId } } },
          ],
        },
        include: {
          members: { include: { user: true } },
          lastMessage: true,
        },
      });

      if (existing && existing.members.length === 2) {
        return mapChat(existing, {
          includeLastMessage: true,
          includeMembers: true,
          currentUserId: currentUser.id,
        });
      }

      const chat = await this.prisma.chat.create({
        data: {
          chatType: ChatType.private,
          createdById: currentUser.id,
          members: {
            create: [
              { userId: currentUser.id, role: 'owner' },
              { userId: otherUserId, role: 'member' },
            ],
          },
        },
        include: {
          members: { include: { user: true } },
          lastMessage: true,
        },
      });
      return mapChat(chat, {
        includeLastMessage: true,
        includeMembers: true,
        currentUserId: currentUser.id,
      });
    }

    if (!name || name.trim().length === 0) {
      throw new BadRequestException('Group chat requires a name');
    }

    const chat = await this.prisma.chat.create({
      data: {
        chatType: ChatType.group,
        name: name.trim(),
        createdById: currentUser.id,
        members: {
          create: [
            { userId: currentUser.id, role: 'owner' },
            ...memberIds
              .filter((id) => id !== currentUser.id)
              .map((userId) => ({ userId, role: 'member' as const })),
          ],
        },
      },
      include: {
        members: true,
        lastMessage: true,
      },
    });
    return mapChat(chat, {
      includeLastMessage: true,
      includeMembers: true,
    });
  }

  async setPinnedMessage(
    chatId: string,
    userId: string,
    messageId: string | null,
  ): Promise<MappedChat> {
    const member = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) {
      throw new BadRequestException('Not a member of this chat');
    }

    if (messageId) {
      const message = await this.prisma.message.findFirst({
        where: { id: messageId, chatId, isDeleted: false },
        select: { id: true },
      });
      if (!message) {
        throw new BadRequestException('Message not found in this chat');
      }
    }

    const chat = await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        pinnedMessageId: messageId,
      },
      include: {
        members: { include: { user: true } },
        lastMessage: true,
      },
    });

    return mapChat(chat, {
      includeLastMessage: true,
      includeMembers: true,
      currentUserId: userId,
    });
  }
}
