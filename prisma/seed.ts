import { CategoryType, PrismaClient, Role } from '@prisma/client';
import { hash } from 'argon2';

const prisma = new PrismaClient();

const initialCategories = [
  { name: 'Diretoria', type: CategoryType.ENTRADA },
  { name: 'Uber', type: CategoryType.SAIDA },
  { name: 'Jogador', type: CategoryType.SAIDA },
  { name: 'Resenha', type: CategoryType.SAIDA },
  { name: 'Arbitragem', type: CategoryType.SAIDA },
];

async function main() {
  const team = await prisma.team.upsert({
    where: { slug: 'santa-fe' },
    update: { name: 'Santa Fé', active: true },
    create: { name: 'Santa Fé', slug: 'santa-fe' },
  });

  for (const category of initialCategories) {
    await prisma.category.upsert({
      where: { teamId_name: { teamId: team.id, name: category.name } },
      update: { type: category.type, active: true },
      create: { ...category, teamId: team.id },
    });
  }

  const directors = ['Tiaguinho', 'Chokito', 'Andy', 'Bola', 'Diego'];
  const directorIds = new Map<string, string>();
  for (const name of directors) {
    const director = await prisma.director.upsert({
      where: { teamId_name: { teamId: team.id, name } },
      update: { active: true },
      create: { teamId: team.id, name, active: true, contact: '' },
    });
    directorIds.set(name.toLowerCase(), director.id);
  }

  const adminPass = await hash('Admin#123456');
  const dirPass = await hash('Diretor#123456');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@santafe.local' },
    update: {},
    create: { email: 'admin@santafe.local', passwordHash: adminPass },
  });

  await prisma.teamMembership.upsert({
    where: { userId_teamId: { userId: admin.id, teamId: team.id } },
    update: { role: Role.ADMIN, active: true, directorId: null },
    create: { userId: admin.id, teamId: team.id, role: Role.ADMIN },
  });

  for (const name of directors.map((director) => director.toLowerCase())) {
    const email = `${name}@santafe.local`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, passwordHash: dirPass },
    });

    await prisma.teamMembership.upsert({
      where: { userId_teamId: { userId: user.id, teamId: team.id } },
      update: {
        role: Role.DIRETOR,
        directorId: directorIds.get(name),
        active: true,
      },
      create: {
        userId: user.id,
        teamId: team.id,
        role: Role.DIRETOR,
        directorId: directorIds.get(name),
      },
    });
  }
}

void main().finally(() => prisma.$disconnect());
