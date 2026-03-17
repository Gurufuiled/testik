import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SignalingGateway } from './signaling.gateway';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET!,
      signOptions: {
        expiresIn: parseInt(process.env.JWT_EXPIRES_IN ?? '3600', 10),
      },
    }),
  ],
  providers: [SignalingGateway],
})
export class SignalingModule {}
