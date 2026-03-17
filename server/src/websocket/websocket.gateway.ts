import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'ws';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

const WS_PORT = parseInt(process.env.WS_PORT ?? '4001', 10);

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
}

@WebSocketGateway(WS_PORT, { path: '/' })
@Injectable()
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WebsocketGateway.name);

  /** userId -> Set of WebSocket connections */
  private readonly userSockets = new Map<string, Set<AuthenticatedSocket>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: AuthenticatedSocket, ...args: unknown[]) {
    const request = (args[0] as { url?: string })?.url;
    const url = new URL(request || '/', 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      this.logger.warn('WS connection rejected: no token');
      client.close(4001, 'Missing token');
      return;
    }

    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user) {
        client.close(4002, 'User not found');
        return;
      }

      client.userId = payload.sub;
      let set = this.userSockets.get(payload.sub);
      if (!set) {
        set = new Set();
        this.userSockets.set(payload.sub, set);
      }
      set.add(client);

      await this.prisma.user.update({
        where: { id: payload.sub },
        data: { isOnline: true, lastSeen: new Date() },
      });

      this.broadcastPresence(payload.sub, true);
      this.logger.log(`User ${payload.sub} connected (WS)`);
    } catch {
      this.logger.warn('WS connection rejected: invalid token');
      client.close(4003, 'Invalid token');
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.userId;
    if (!userId) return;

    const set = this.userSockets.get(userId);
    if (set) {
      set.delete(client);
      if (set.size === 0) {
        this.userSockets.delete(userId);
        this.prisma.user
          .update({
            where: { id: userId },
            data: { isOnline: false, lastSeen: new Date() },
          })
          .catch((err) =>
            this.logger.error(
              `Failed to update user ${userId} offline status`,
              err,
            ),
          );
        this.broadcastPresence(userId, false);
      }
    }
    this.logger.log(`User ${userId} disconnected (WS)`);
  }

  private broadcastPresence(userId: string, isOnline: boolean) {
    const msg = JSON.stringify({
      type: 'presence',
      user_id: userId,
      is_online: isOnline,
    });
    this.server.clients.forEach((c) => {
      if ((c as unknown as AuthenticatedSocket).userId) {
        c.send(msg);
      }
    });
  }

  private getChatMemberIds(chatId: string): Promise<string[]> {
    return this.prisma.chatMember
      .findMany({
        where: { chatId },
        select: { userId: true },
      })
      .then((members) => members.map((m) => m.userId));
  }

  private sendToUser(userId: string, data: string) {
    const set = this.userSockets.get(userId);
    if (set) {
      set.forEach((client) => {
        if (client.readyState === 1) client.send(data);
      });
    }
  }

  @SubscribeMessage('message')
  async handleMessage(
    client: AuthenticatedSocket,
    payload: { chat_id: string; message: unknown },
  ) {
    if (!client.userId) return;
    const { chat_id: chatId, message } = payload;
    if (!chatId || !message) return;

    const members = await this.getChatMemberIds(chatId);
    if (!members.includes(client.userId)) return;

    const data = JSON.stringify({
      type: 'message',
      chat_id: chatId,
      sender_id: client.userId,
      message,
    });
    members.forEach((uid) => {
      if (uid !== client.userId) this.sendToUser(uid, data);
    });
  }

  @SubscribeMessage('typing')
  async handleTyping(
    client: AuthenticatedSocket,
    payload: { chat_id: string; is_typing: boolean },
  ) {
    if (!client.userId) return;
    const { chat_id: chatId, is_typing: isTyping } = payload;
    if (!chatId) return;

    const members = await this.getChatMemberIds(chatId);
    if (!members.includes(client.userId)) return;

    const data = JSON.stringify({
      type: 'typing',
      chat_id: chatId,
      user_id: client.userId,
      is_typing: isTyping,
    });
    members.forEach((uid) => {
      if (uid !== client.userId) this.sendToUser(uid, data);
    });
  }

  @SubscribeMessage('ack')
  async handleAck(
    client: AuthenticatedSocket,
    payload: {
      chat_id: string;
      message_id: string;
      status: 'delivered' | 'read';
    },
  ) {
    if (!client.userId) return;
    const { chat_id: chatId, message_id: messageId, status } = payload;
    if (!chatId || !messageId || !status) return;

    const members = await this.getChatMemberIds(chatId);
    if (!members.includes(client.userId)) return;

    const data = JSON.stringify({
      type: 'ack',
      chat_id: chatId,
      message_id: messageId,
      user_id: client.userId,
      status,
    });
    members.forEach((uid) => this.sendToUser(uid, data));
  }
}
