import { randomUUID } from 'node:crypto';
import { Injectable, ForbiddenException } from '@nestjs/common';
import {
  MessageType,
  MediaType,
  MessageStatus,
  Transport,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mapMessage, type MappedMessage } from '../common/mappers';

const MSG_TYPE_TO_MEDIA_TYPE: Record<string, MediaType> = {
  voice: MediaType.voice,
  image: MediaType.image,
  video_note: MediaType.video_note,
  video: MediaType.video,
  file: MediaType.file,
};

const VALID_MSG_TYPES: MessageType[] = [
  MessageType.text,
  MessageType.image,
  MessageType.voice,
  MessageType.video_note,
  MessageType.file,
];

export interface CreateMessageMedia {
  url?: string;
  duration_ms?: number;
  waveform?: number[];
  thumbnail_url?: string;
  is_round?: boolean;
  width?: number;
  height?: number;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
}

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async createMessage(
    chatId: string,
    senderId: string,
    msgType: string,
    content: string | null,
    media?: CreateMessageMedia,
  ): Promise<MappedMessage> {
    const member = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: senderId } },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this chat');
    }

    const prismaMsgType = this.toMessageType(msgType);

    const result = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          id: randomUUID(),
          chatId,
          senderId,
          msgType: prismaMsgType,
          content,
          status: MessageStatus.sent,
          transport: Transport.websocket,
        },
      });

      if (media && prismaMsgType !== MessageType.text) {
        const mediaType =
          MSG_TYPE_TO_MEDIA_TYPE[prismaMsgType] ?? MediaType.file;
        const mediaData: Parameters<typeof tx.media.create>[0]['data'] = {
          id: randomUUID(),
          messageId: message.id,
          mediaType,
          remoteUrl: media.url ?? null,
          fileName: media.file_name ?? null,
          mimeType: media.mime_type ?? null,
          fileSize: media.file_size ?? null,
          width: media.width ?? null,
          height: media.height ?? null,
          durationMs: media.duration_ms ?? null,
          waveform: media.waveform
            ? Buffer.from(new Uint8Array(media.waveform))
            : null,
          isRound: media.is_round ?? false,
        };
        await tx.media.create({ data: mediaData });
      }

      const preview = this.buildLastMessagePreview(
        prismaMsgType,
        content,
        media,
      );
      await tx.chat.update({
        where: { id: chatId },
        data: {
          lastMessageId: message.id,
          lastMessageAt: message.createdAt,
          lastMessagePreview: preview,
        },
      });

      return message;
    });

    const withMedia = await this.prisma.message.findUnique({
      where: { id: result.id },
      include: { media: true },
    });
    return mapMessage(withMedia!, { includeMedia: true });
  }

  private toMessageType(msgType: string): MessageType {
    const normalized = msgType.toLowerCase();
    if (VALID_MSG_TYPES.includes(normalized as MessageType)) {
      return normalized as MessageType;
    }
    return MessageType.text;
  }

  private buildLastMessagePreview(
    msgType: MessageType,
    content: string | null,
    media?: CreateMessageMedia,
  ): string {
    const maxLen = 100;
    if (msgType === MessageType.text && content) {
      return content.length <= maxLen
        ? content
        : content.slice(0, maxLen) + '…';
    }
    const placeholders: Record<MessageType, string> = {
      [MessageType.text]: '',
      [MessageType.image]: 'Photo',
      [MessageType.voice]: 'Voice message',
      [MessageType.video_note]: 'Video note',
      [MessageType.video]: 'Video',
      [MessageType.file]: media?.file_name ?? 'File',
      [MessageType.system]: '',
    };
    return placeholders[msgType] ?? 'Message';
  }

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
