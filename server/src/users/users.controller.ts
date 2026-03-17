import { Controller, Get, Patch, Body, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SearchUsersQueryDto } from './dto/search-users-query.dto';
import type { User } from '@prisma/client';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser() user: User) {
    return this.usersService.getProfile(user.id);
  }

  @Get('search')
  async searchUsers(
    @CurrentUser() user: User,
    @Query() query: SearchUsersQueryDto,
  ) {
    return this.usersService.searchUsers(
      user.id,
      query.q ?? '',
      query.limit ?? 20,
    );
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, {
      display_name: dto.display_name,
      avatar_url: dto.avatar_url,
    });
  }
}
