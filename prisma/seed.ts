/**
 * Seeds the six departments, the event run sheet skeleton, and — the first
 * time only — a T4 owner invite so somebody can actually get in.
 *
 * Safe to run repeatedly: everything is an upsert, and no existing user,
 * password or session is ever touched.
 *
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const db = new PrismaClient();

const DEPARTMENTS = [
  {
    name: "Sponsorship & Partnerships",
    slug: "sponsorship",
    color: "#EC4899",
    sortOrder: 1,
    description: "Sponsor outreach, MOUs, tier packages, and the money that makes the event exist.",
  },
  {
    name: "Social Media & External Affairs",
    slug: "social",
    color: "#8B5CF6",
    sortOrder: 2,
    description: "Content calendar, posting, captions, and everything the public sees.",
  },
  {
    name: "Film/Photo & Tech",
    slug: "film-tech",
    color: "#0EA5E9",
    sortOrder: 3,
    description: "Cameras, edits, livestream, and the technical rig on the day.",
  },
  {
    name: "Documentation",
    slug: "documentation",
    color: "#F59E0B",
    sortOrder: 4,
    description: "Proposals, reports, minutes, and the paper trail the school asks for.",
  },
  {
    name: "Operations",
    slug: "operations",
    color: "#22C55E",
    sortOrder: 5,
    description: "Venue, schedule, logistics, food, safety, and run-of-show.",
  },
  {
    name: "Mentorship",
    slug: "mentorship",
    color: "#2DD4BF",
    sortOrder: 6,
    description: "D-Day mentors, team pairing, and participant support.",
  },
  {
    name: "General",
    slug: "general",
    color: "#BE185D",
    sortOrder: 0,
    isGeneral: true,
    description: "All-staff space: brand assets, the master instruction doc, the schedule.",
  },
];

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

async function main() {
  console.log("Seeding departments…");
  for (const d of DEPARTMENTS) {
    await db.department.upsert({
      where: { slug: d.slug },
      create: d,
      update: { name: d.name, color: d.color, sortOrder: d.sortOrder, description: d.description },
    });
  }

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
          "    OWNER_EMAIL=you@kmids.ac.th npm run db:seed\n",
      );
    } else if (!email.toLowerCase().endsWith("@kmids.ac.th")) {
      console.error(`\n  OWNER_EMAIL must be a @kmids.ac.th address. Got: ${email}\n`);
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
