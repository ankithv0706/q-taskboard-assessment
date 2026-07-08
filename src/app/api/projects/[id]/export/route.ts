import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden, notFound } from "@/lib/auth";
import { createAirtableClient, type AirtableExportResult } from "@/lib/airtable";
import { AirtableError } from "@/lib/airtable-mock";

type Params = { params: Promise<{ id: string }> };

async function exportTasksToAirtable(projectId: string, result: AirtableExportResult = { created: 0, updated: 0, failed: 0, errors: [] }): Promise<AirtableExportResult> {
  const client = createAirtableClient();
  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ status: "asc" }, { position: "asc" }],
  });

  const uploadTaskToAirtable = async (task: (typeof tasks)[number]) => {
    await client.upsertRecord(process.env.AIRTABLE_TABLE_NAME || "Tasks", task.id, {
      ProjectId: projectId,
      Title: task.title,
      Description: task.description ?? "",
      Status: task.status,
      Assignee: task.assignee?.name ?? "",
      CreatedBy: task.createdBy.name,
      CreatedAt: task.createdAt.toISOString(),
      UpdatedAt: task.updatedAt.toISOString(),
    });
    result.created += 1;
  };

  for (const task of tasks) {
    try {
      await uploadTaskToAirtable(task);
    } catch (error) {
      result.failed += 1;
      if (error instanceof AirtableError) {
        result.errors.push(`${task.id}: ${error.message}`);
      } else {
        result.errors.push(`${task.id}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
  }

  return result;
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const membership = await prisma.membership.findUnique({
    where: { userId_projectId: { userId: user.id, projectId: id } },
    select: { role: true },
  });

  if (!membership) return forbidden("you are not a member of this project");
  if (membership.role === "viewer") {
    return forbidden("only project members can export tasks");
  }

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return notFound("project not found");

  const result: AirtableExportResult = { created: 0, updated: 0, failed: 0, errors: [] };

  void exportTasksToAirtable(id, result).catch((error) => {
    const message = error instanceof Error ? error.message : "Airtable export failed";
    result.failed += 1;
    result.errors.push(message);
  });

  return NextResponse.json({ ok: true, result });
}
