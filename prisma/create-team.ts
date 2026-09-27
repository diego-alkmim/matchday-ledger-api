import { CategoryType, PrismaClient, Role } from '@prisma/client';
import { hash } from 'argon2';

const prisma = new PrismaClient();

const categories = [
  { name: 'Diretoria', type: CategoryType.ENTRADA },
  { name: 'Uber', type: CategoryType.SAIDA },
  { name: 'Jogador', type: CategoryType.SAIDA },
  { name: 'Resenha', type: CategoryType.SAIDA },
  { name: 'Arbitragem', type: CategoryType.SAIDA },
];

function readArgument(name: string) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim();

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function requiredArgument(name: string) {
  const value = readArgument(name);
  if (!value) throw new Error(`Informe --${name}.`);
  return value;
}

async function main() {
  const name = requiredArgument('name');
  const slug = requiredArgument('slug').toLowerCase();
  const adminEmail = requiredArgument('admin-email').toLowerCase();
  const adminPassword = readArgument('admin-password') || process.env.TEAM_ADMIN_PASSWORD;

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('O slug deve conter apenas letras minúsculas, números e hífens.');
  }
  if (!/^\S+@\S+\.\S+$/.test(adminEmail)) {
    throw new Error('Informe um e-mail de administrador válido.');
  }

  const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingUser && (!adminPassword || adminPassword.length < 8)) {
    throw new Error(
      'Para um novo usuário, informe --admin-password com ao menos 8 caracteres ou TEAM_ADMIN_PASSWORD.',
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const team = await tx.team.create({ data: { name, slug } });
    await tx.category.createMany({
      data: categories.map((category) => ({ ...category, teamId: team.id })),
    });

    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          email: adminEmail,
          passwordHash: await hash(adminPassword!),
        },
      }));

    await tx.teamMembership.create({
      data: { userId: user.id, teamId: team.id, role: Role.ADMIN },
    });

    return { team, user };
  });

  process.stdout.write(`Time criado: ${result.team.name} (${result.team.slug})\n`);
  process.stdout.write(`Administrador: ${result.user.email}\n`);
}

void main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Não foi possível criar o time.'}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
