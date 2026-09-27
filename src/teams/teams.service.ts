import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateContributionSettingsDto } from './dto/update-contribution-settings.dto';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async getContributionSettings(teamId: string) {
    const team = await this.prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      select: {
        contributionMode: true,
        monthlyContributionPerDirector: true,
      },
    });

    return {
      mode: team.contributionMode,
      monthlyContributionPerDirector: Number(team.monthlyContributionPerDirector),
    };
  }

  async updateContributionSettings(teamId: string, settings: UpdateContributionSettingsDto) {
    await this.prisma.team.update({
      where: { id: teamId },
      data: {
        contributionMode: settings.mode,
        ...(settings.monthlyContributionPerDirector !== undefined
          ? { monthlyContributionPerDirector: settings.monthlyContributionPerDirector }
          : {}),
      },
    });

    return this.getContributionSettings(teamId);
  }
}
