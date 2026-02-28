import { PrismaClient, Role, CategoryType } from "@prisma/client";
import { hash } from "argon2";

const prisma = new PrismaClient();

async function main() {
  const categories = [
    { name: "Arbitragem", type: CategoryType.SAIDA },
    { name: "Jogador", type: CategoryType.SAIDA },
    { name: "Lavagem", type: CategoryType.SAIDA },
    { name: "Churrasco", type: CategoryType.SAIDA },
    { name: "Resenha", type: CategoryType.SAIDA },
    { name: "Uniforme", type: CategoryType.SAIDA },
    { name: "Entrada Diretores", type: CategoryType.ENTRADA },
  ];
  for (const c of categories) {
    await prisma.category.upsert({
      where: { name: c.name },
      update: { type: c.type },
      create: c,
    });
  }

  const directors = ["Tiaguinho", "Chokito", "Andy", "Bola", "Diego"];
  const directorIds: Record<string, string> = {};
  for (const name of directors) {
    const d = await prisma.director.upsert({
      where: { name },
      update: {},
      create: { name, active: true, contact: "" },
    });
    directorIds[name] = d.id;
  }

  const adminPass = await hash("Admin#123456");
  const dirPass = await hash("Diretor#123456");

  await prisma.user.upsert({
    where: { email: "admin@santafe.local" },
    update: {},
    create: {
      email: "admin@santafe.local",
      passwordHash: adminPass,
      role: Role.ADMIN,
    },
  });

  const dirEmails = ["tiaguinho", "chokito", "andy", "bola", "diego"];
  dirEmails.forEach(async (name) => {
    await prisma.user.upsert({
      where: { email: `${name}@santafe.local` },
      update: {},
      create: {
        email: `${name}@santafe.local`,
        passwordHash: dirPass,
        role: Role.DIRETOR,
        directorId:
          directorIds[directors.find((d) => d.toLowerCase() === name)!],
      },
    });
  });
}

main().finally(() => prisma.$disconnect());
