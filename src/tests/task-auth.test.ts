import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "../app/api/tasks/[id]/route";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/jwt";

describe("task update authorization", () => {
  it("rejects updates from users who are not members of the task project", async () => {
    const task = await prisma.task.findFirst({ orderBy: { createdAt: "asc" } });
    expect(task).toBeTruthy();

    const user = await prisma.user.create({
      data: {
        email: `unauthorized-${Date.now()}@example.com`,
        name: "Unauthorized User",
        passwordHash: "unused",
      },
      select: { id: true, email: true, name: true },
    });

    const token = signToken({ userId: user.id, email: user.email });
    const req = new NextRequest("http://localhost/api/tasks/123", {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ status: "done" }),
    });

    const response = await PATCH(req, { params: Promise.resolve({ id: task!.id }) });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toMatch(/member|permission|forbidden/i);
  });
});
