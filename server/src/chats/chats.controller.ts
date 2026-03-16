import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ChatsService } from './chats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common';
import { CreateChatDto } from './dto/create-chat.dto';
import type { User } from '@prisma/client';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  async getChats(@CurrentUser() user: User) {
    return this.chatsService.getChatsForUser(user.id, true);
  }

  @Post()
  async createChat(@Body() dto: CreateChatDto, @CurrentUser() user: User) {
    return this.chatsService.createOrFindChat(
      user,
      dto.chat_type,
      dto.name,
      dto.member_ids,
    );
  }
}
