import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { mapUser, type MappedUser } from '../common/mappers';
import type { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<MappedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return mapUser(user);
  }

  async searchUsers(
    currentUserId: string,
    query: string,
    limit = 20,
  ): Promise<MappedUser[]> {
    const q = query.trim();
    if (!q) {
      return [];
    }
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: Math.max(1, Math.min(limit, 50)),
    });
    return users.map(mapUser);
  }

  async updateProfile(
    userId: string,
    data: { display_name?: string; avatar_url?: string },
  ): Promise<MappedUser> {
    const updateData: { displayName?: string; avatarUrl?: string } = {};
    if (data.display_name !== undefined) {
      updateData.displayName = data.display_name;
    }
    if (data.avatar_url !== undefined) {
      updateData.avatarUrl = data.avatar_url;
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
    return mapUser(user);
  }
}
