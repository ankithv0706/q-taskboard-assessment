import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/tasks/[id]/comments/route";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/jwt";

describe("task comments", () => {
  it("allows project members to post and lists comments chronologically", async () => {
    const owner = await prisma.user.create({
      data: {
        email: `comments-owner-${Date.now()}@example.com`,
        name: "Comment Owner",
        passwordHash: "unused",
      },
      select: { id: true, email: true, name: true },
    });
    const member = await prisma.user.create({
      data: {
        email: `comments-member-${Date.now()}@example.com`,
        name: "Comment Member",
        passwordHash: "unused",
      },
      select: { id: true, email: true, name: true },
    });
    const project = await prisma.project.create({
      data: {
        name: `Comment Project ${Date.now()}`,
        description: "test",
        ownerId: owner.id,
      },
    });
    await prisma.membership.createMany({
      data: [
        { userId: owner.id, projectId: project.id, role: "admin" },
        { userId: member.id, projectId: project.id, role: "member" },
      ],
    });
    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        title: "Commentable task",
        description: "Test comments",
        createdById: owner.id,
      },
    });

    const token = signToken({ userId: member.id, email: member.email });
    const postReq = new NextRequest("http://localhost/api/tasks/123/comments", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ body: "First comment" }),
    });

    const postRes = await POST(postReq, { params: Promise.resolve({ id: task.id }) });
    expect(postRes.status).toBe(201);

    const listReq = new NextRequest("http://localhost/api/tasks/123/comments", {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });

    const listRes = await GET(listReq, { params: Promise.resolve({ id: task.id }) });
    expect(listRes.status).toBe(200);

    const body = await listRes.json();
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].body).toBe("First comment");
    expect(body.comments[0].author.name).toBe(member.name);
  });

  it("blocks viewers from posting comments", async () => {
    const owner = await prisma.user.create({
      data: {
        email: `comments-viewer-owner-${Date.now()}@example.com`,
        name: "Viewer Owner",
        passwordHash: "unused",
      },
      select: { id: true, email: true, name: true },
    });
    const viewer = await prisma.user.create({
      data: {
        email: `comments-viewer-${Date.now()}@example.com`,
        name: "Viewer User",
        passwordHash: "unused",
      },
      select: { id: true, email: true, name: true },
    });
    const project = await prisma.project.create({
      data: {
        name: `Comment Viewer Project ${Date.now()}`,
        description: "test",
        ownerId: owner.id,
      },
    });
    await prisma.membership.createMany({
      data: [
        { userId: owner.id, projectId: project.id, role: "admin" },
        { userId: viewer.id, projectId: project.id, role: "viewer" },
      ],
    });
    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        title: "Viewer task",
        createdById: owner.id,
      },
    });

    const token = signToken({ userId: viewer.id, email: viewer.email });
    const req = new NextRequest("http://localhost/api/tasks/123/comments", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ body: "Should fail" }),
    });

    const response = await POST(req, { params: Promise.resolve({ id: task.id }) });
    expect(response.status).toBe(403);
  });
});
