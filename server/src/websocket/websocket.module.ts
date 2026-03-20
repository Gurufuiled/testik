import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WebsocketGateway } from './websocket.gateway';
import { MessagesModule } from '../messages/messages.module';
import { ChatsModule } from '../chats/chats.module';

@Module({
  imports: [
    ChatsModule,
    MessagesModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET!,
      signOptions: {
        expiresIn: parseInt(process.env.JWT_EXPIRES_IN ?? '3600', 10),
      },
    }),
  ],
  providers: [WebsocketGateway],
})
export class WebsocketModule {}
