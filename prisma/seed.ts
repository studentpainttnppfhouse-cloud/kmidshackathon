/**
 * Seeds the teams on the staff chart, the event run sheet skeleton, and — the first
 * time only — a T4 owner invite so somebody can actually get in.
 *
 * Safe to run repeatedly: everything is an upsert, and no existing user,
 * password or session is ever touched.
 *
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { resolveDatabaseUrl } from "../src/lib/database-url";
import { ALLOWED_EMAIL_DOMAIN, TEAMS } from "../src/lib/constants";

// Same TLS normalization the app uses, so seeding works with whatever string
// was pasted into DATABASE_URL. See src/lib/database-url.ts.
const datasourceUrl = resolveDatabaseUrl();
const db = new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);

/**
 * The departments are the teams on the staff chart, straight out of
 * src/lib/constants.ts. Seeding from the same list the role dropdowns read
 * means a team can never exist in one place and not the other.
 */
const DEPARTMENTS = TEAMS.map((team) => ({
  name: team.name,
  slug: team.slug,
  color: team.color,
  sortOrder: team.sortOrder,
  description: team.description,
  isGeneral: team.isGeneral === true,
}));

const RUN_SHEET = [
  { day: "2027-03-19", startTime: "15:00", endTime: "18:00", title: "Venue setup", location: "Main Hall" },
  { day: "2027-03-19", startTime: "18:00", endTime: "19:00", title: "Staff briefing", location: "Room 7F-201" },
  { day: "2027-03-20", startTime: "07:00", endTime: "08:00", title: "Staff call time", location: "Staff desk" },
  { day: "2027-03-20", startTime: "08:00", endTime: "09:00", title: "Participant registration", location: "Lobby" },
  { day: "2027-03-20", startTime: "09:00", endTime: "10:00", title: "Opening Ceremony", location: "Main Hall" },
  { day: "2027-03-20", startTime: "10:00", endTime: "12:00", title: "Hacking begins", location: "Hall A & B" },
  { day: "2027-03-20", startTime: "12:00", endTime: "13:00", title: "Lunch", location: "Cafeteria" },
  { day: "2027-03-20", startTime: "13:00", endTime: "18:00", title: "Hacking continues · mentor rounds", location: "Hall A & B" },
  { day: "2027-03-21", startTime: "09:00", endTime: "12:00", title: "Final sprint", location: "Hall A & B" },
  { day: "2027-03-21", startTime: "13:00", endTime: "15:30", title: "Judging", location: "Main Hall" },
  { day: "2027-03-21", startTime: "16:00", endTime: "17:00", title: "Closing & awards", location: "Main Hall" },
];

/**
 * Clears out departments that are no longer on the staff chart.
 *
 * The chart was rebuilt around the real 2027 teams, and an earlier seed had
 * put a different six in. A leftover team is not harmless: it sits in every
 * department dropdown, every filter and every picker, and somebody files work
 * into it by accident.
 *
 * Only ever removes a department that holds nothing at all — no members, no
 * tasks, no documents, no files, no forms, no announcements, no invites
 * pointing at it. Anything with a single row in it is left exactly where it is
 * and reported, because deleting a team's work to tidy up a list is not a
 * trade this script gets to make.
 */
async function retireEmptyDepartments(): Promise<void> {
  const keep = new Set(DEPARTMENTS.map((d) => d.slug));
  const strays = await db.department.findMany({
    where: { slug: { notIn: [...keep] } },
    select: { id: true, name: true, slug: true },
  });

  for (const dept of strays) {
    const where = { departmentId: dept.id };
    const counts = await Promise.all([
      db.user.count({ where }),
      db.assignment.count({ where }),
      db.document.count({ where }),
      db.fileAsset.count({ where }),
      db.form.count({ where }),
      db.announcement.count({ where }),
      db.invite.count({ where }),
      db.department.count({ where: { headUserId: { not: null }, id: dept.id } }),
    ]);

    const held = counts.reduce((a, b) => a + b, 0);
    if (held > 0) {
      console.log(`  keeping "${dept.name}" — off the chart, but it still holds ${held} row(s).`);
      continue;
    }

    await db.department.delete({ where: { id: dept.id } });
    console.log(`  removed "${dept.name}" — off the chart and empty.`);
  }
}

async function main() {
  console.log("Seeding departments…");
  for (const d of DEPARTMENTS) {
    await db.department.upsert({
      where: { slug: d.slug },
      create: d,
      update: { name: d.name, color: d.color, sortOrder: d.sortOrder, description: d.description },
    });
  }

  await retireEmptyDepartments();

  console.log("Seeding run sheet…");
  const existingItems = await db.eventItem.count();
  if (existingItems === 0) {
    for (const [i, item] of RUN_SHEET.entries()) {
      await db.eventItem.create({ data: { ...item, sortOrder: i } });
    }
  }

  await db.setting.upsert({
    where: { key: "archive_mode" },
    create: { key: "archive_mode", value: "0" },
    update: {},
  });

  // The bootstrap owner invite. Only ever created when the portal has nobody
  // in it — after that, invites come from the admin panel.
  const userCount = await db.user.count();
  const pendingOwner = await db.invite.findFirst({
    where: { tier: "T4_OWNER", acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
  });

  if (userCount === 0 && !pendingOwner) {
    const email = process.env.OWNER_EMAIL;

    if (!email) {
      console.log(
        "\n  No users yet and OWNER_EMAIL is not set.\n" +
          "  Re-run with the first owner's address to generate a bootstrap invite:\n\n" +
          `    OWNER_EMAIL=you@${ALLOWED_EMAIL_DOMAIN} npm run db:seed\n`,
      );
    } else if (!email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      console.error(
        `\n  OWNER_EMAIL must be a @${ALLOWED_EMAIL_DOMAIN} address — that is what\n` +
          `  the login gate accepts. Got: ${email}\n`,
      );
      process.exitCode = 1;
    } else {
      // The bootstrap owner has to exist before an Invite can point at it, so
      // this one account is created directly, with no password. The invite is
      // what turns it into a usable login.
      const owner = await db.user.create({
        data: {
          email: email.toLowerCase(),
          name: "Portal Owner",
          tier: "T4_OWNER",
          roleTitle: "Lead Organizer",
        },
      });

      const code = randomBytes(24).toString("base64url");
      await db.invite.create({
        data: {
          email: owner.email,
          code,
          tier: "T4_OWNER",
          invitedById: owner.id,
          expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });

      console.log(
        `\n  ────────────────────────────────────────────────────────\n` +
          `  Bootstrap owner invite for ${owner.email}\n\n` +
          `    /invite/${code}\n\n` +
          `  Open that path on your deployed portal to set a password.\n` +
          `  It expires in 14 days and works exactly once.\n` +
          `  ────────────────────────────────────────────────────────\n`,
      );
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
