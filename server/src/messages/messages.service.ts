import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { mapMessage, type MappedMessage } from '../common/mappers';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async getMessagesForChat(
    chatId: string,
    userId: string,
    limit: number,
    before?: string,
  ): Promise<MappedMessage[]> {
    const member = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this chat');
    }

    const where: { chatId: string; createdAt?: { lt: Date } } = { chatId };
    if (before) {
      const beforeMsg = await this.prisma.message.findFirst({
        where: { id: before, chatId },
      });
      if (beforeMsg) {
        where.createdAt = { lt: beforeMsg.createdAt };
      }
    }

    const messages = await this.prisma.message.findMany({
      where,
      include: { media: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return messages.map((m) => mapMessage(m, { includeMedia: true }));
  }
}
