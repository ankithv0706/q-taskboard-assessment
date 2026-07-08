import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/jwt";

const airtableState = vi.hoisted(() => ({
  upsertRecord: vi.fn(async () => undefined),
}));

vi.mock("../lib/airtable", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/airtable")>();
  return {
    ...actual,
    createAirtableClient: vi.fn(() => ({ upsertRecord: airtableState.upsertRecord })),
  };
});

let POST: typeof import("../app/api/projects/[id]/export/route").POST;

process.env.AIRTABLE_USE_MOCK = "true";

beforeAll(async () => {
  ({ POST } = await import("../app/api/projects/[id]/export/route"));
});

beforeEach(() => {
  airtableState.upsertRecord.mockReset();
  airtableState.upsertRecord.mockResolvedValue(undefined);
});

describe("project Airtable export", () => {
  it("allows project members to trigger an export", async () => {
    const owner = await prisma.user.create({
      data: {
        email: `export-owner-${Date.now()}@example.com`,
        name: "Export Owner",
        passwordHash: "unused",
      },
      select: { id: true, email: true, name: true },
    });
    const member = await prisma.user.create({
      data: {
        email: `export-member-${Date.now()}@example.com`,
        name: "Export Member",
        passwordHash: "unused",
      },
      select: { id: true, email: true, name: true },
    });
    const project = await prisma.project.create({
      data: {
        name: `Export Project ${Date.now()}`,
        ownerId: owner.id,
      },
    });
    await prisma.membership.createMany({
      data: [
        { userId: owner.id, projectId: project.id, role: "admin" },
        { userId: member.id, projectId: project.id, role: "member" },
      ],
    });
    await prisma.task.create({
      data: {
        projectId: project.id,
        title: "Exportable task",
        createdById: owner.id,
      },
    });

    const token = signToken({ userId: member.id, email: member.email });
    const req = new NextRequest("http://localhost/api/projects/123/export", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

    const response = await POST(req, { params: Promise.resolve({ id: project.id }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.created).toBe(0);
  });

  it("starts the export without awaiting completion", async () => {
    const owner = await prisma.user.create({
      data: {
        email: `export-nonblocking-owner-${Date.now()}@example.com`,
        name: "Nonblocking Owner",
        passwordHash: "unused",
      },
      select: { id: true, email: true, name: true },
    });
    const project = await prisma.project.create({
      data: {
        name: `Export Nonblocking Project ${Date.now()}`,
        ownerId: owner.id,
      },
    });
    await prisma.membership.create({
      data: { userId: owner.id, projectId: project.id, role: "admin" },
    });
    await prisma.task.create({
      data: {
        projectId: project.id,
        title: "Background export task",
        createdById: owner.id,
      },
    });

    let releaseUpload: (() => void) | undefined;
    const pendingUpload = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    airtableState.upsertRecord.mockImplementation(async () => {
      await pendingUpload;
    });

    const token = signToken({ userId: owner.id, email: owner.email });
    const req = new NextRequest("http://localhost/api/projects/123/export", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

    const response = await Promise.race([
      POST(req, { params: Promise.resolve({ id: project.id }) }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("POST did not respond immediately")), 100)),
    ]);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.created).toBe(0);

    releaseUpload?.();
  });

  it("returns a clear error when Airtable credentials are missing", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousToken = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
    const previousApiKey = process.env.AIRTABLE_API_KEY;
    const previousBaseId = process.env.AIRTABLE_BASE_ID;
    const previousVitest = process.env.VITEST;
    const previousUseMock = process.env.AIRTABLE_USE_MOCK;

    const owner = await prisma.user.create({
      data: {
        email: `export-config-owner-${Date.now()}@example.com`,
        name: "Config Owner",
        passwordHash: "unused",
      },
      select: { id: true, email: true, name: true },
    });
    const project = await prisma.project.create({
      data: {
        name: `Export Config Project ${Date.now()}`,
        ownerId: owner.id,
      },
    });
    await prisma.membership.create({
      data: { userId: owner.id, projectId: project.id, role: "admin" },
    });

    process.env.NODE_ENV = "development";
    delete process.env.VITEST;
    delete process.env.AIRTABLE_USE_MOCK;
    delete process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
    delete process.env.AIRTABLE_API_KEY;
    delete process.env.AIRTABLE_BASE_ID;

    try {
      const token = signToken({ userId: owner.id, email: owner.email });
      const req = new NextRequest("http://localhost/api/projects/123/export", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });

      const response = await POST(req, { params: Promise.resolve({ id: project.id }) });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.result.failed).toBe(0);
    } finally {
      if (previousNodeEnv) process.env.NODE_ENV = previousNodeEnv; else delete process.env.NODE_ENV;
      if (previousVitest) process.env.VITEST = previousVitest; else delete process.env.VITEST;
      if (previousUseMock) process.env.AIRTABLE_USE_MOCK = previousUseMock; else delete process.env.AIRTABLE_USE_MOCK;
      if (previousToken) process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN = previousToken; else delete process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
      if (previousApiKey) process.env.AIRTABLE_API_KEY = previousApiKey; else delete process.env.AIRTABLE_API_KEY;
      if (previousBaseId) process.env.AIRTABLE_BASE_ID = previousBaseId; else delete process.env.AIRTABLE_BASE_ID;
    }
  });

  it("blocks viewers from triggering an export", async () => {
    const owner = await prisma.user.create({
      data: {
        email: `export-viewer-owner-${Date.now()}@example.com`,
        name: "Viewer Owner",
        passwordHash: "unused",
      },
      select: { id: true, email: true, name: true },
    });
    const viewer = await prisma.user.create({
      data: {
        email: `export-viewer-${Date.now()}@example.com`,
        name: "Viewer User",
        passwordHash: "unused",
      },
      select: { id: true, email: true, name: true },
    });
    const project = await prisma.project.create({
      data: {
        name: `Export Viewer Project ${Date.now()}`,
        ownerId: owner.id,
      },
    });
    await prisma.membership.createMany({
      data: [
        { userId: owner.id, projectId: project.id, role: "admin" },
        { userId: viewer.id, projectId: project.id, role: "viewer" },
      ],
    });

    const token = signToken({ userId: viewer.id, email: viewer.email });
    const req = new NextRequest("http://localhost/api/projects/123/export", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

    const response = await POST(req, { params: Promise.resolve({ id: project.id }) });
    expect(response.status).toBe(403);
  });
});
