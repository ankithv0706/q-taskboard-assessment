import Airtable from "airtable";
import { AirtableError as AirtableClientError, airtable } from "@/lib/airtable-mock";

export type AirtableFieldMap = Record<string, string | number | boolean | null | undefined>;

export type AirtableExportResult = {
  created: number;
  updated: number;
  failed: number;
  errors: string[];
};

export class AirtableClient {
  private base: Airtable.Base;

  constructor(
    personalAccessToken = resolveAirtableEnvConfig().token,
    baseId = resolveAirtableEnvConfig().baseId,
  ) {
    if (!personalAccessToken || !baseId) {
      throw new Error("AIRTABLE_PERSONAL_ACCESS_TOKEN (or AIRTABLE_API_KEY for compatibility) and AIRTABLE_BASE_ID must be configured");
    }

    this.base = new Airtable({ apiKey: personalAccessToken }).base(baseId);
  }

  static createMock() {
    return new AirtableMockAdapter();
  }

  async upsertRecord(tableName: string, taskId: string, fields: AirtableFieldMap): Promise<void> {
    const table = this.base(tableName);
    const recordFields = {
      ...fields,
      Id: taskId,
    };

    try {
      await table.select({ maxRecords: 1, filterByFormula: `{taskboardTaskId} = '${taskId}'` }).firstPage();
    } catch (error) {
      const status = this.getStatusCode(error);
      if (status === 401 || status === 403 || this.isAuthError(error)) {
        throw new Error("Airtable rejected the access token. Create a fresh personal access token in Airtable and set it as AIRTABLE_PERSONAL_ACCESS_TOKEN (or AIRTABLE_API_KEY). Also verify AIRTABLE_BASE_ID is your Airtable base ID, not the base URL.");
      }
      if (status && status >= 500) {
        throw new AirtableClientError("Airtable server error while checking for existing record", "server-error", status);
      }
      if (status === 429) {
        throw new AirtableClientError("Airtable rate limit while checking for existing record", "rate-limit", status);
      }
      if (this.isTransient(error)) {
        throw new AirtableClientError("Airtable network error while checking for existing record", "network", 0);
      }
    }

    try {
      await table.create([{ fields: recordFields }], { typecast: true });
    } catch (error) {
      const status = this.getStatusCode(error);
      if (status === 401 || status === 403 || this.isAuthError(error)) {
        throw new Error("Airtable rejected the access token. Create a fresh personal access token in Airtable and set it as AIRTABLE_PERSONAL_ACCESS_TOKEN (or AIRTABLE_API_KEY). Also verify AIRTABLE_BASE_ID is your Airtable base ID, not the base URL.");
      }
      if (status === 429) {
        throw new AirtableClientError("Airtable rate limit while creating record", "rate-limit", status);
      }
      if (status && status >= 500) {
        throw new AirtableClientError("Airtable server error while creating record", "server-error", status);
      }
      if (this.isTransient(error)) {
        throw new AirtableClientError("Airtable network error while creating record", "network", 0);
      }
      throw error;
    }
  }

  private getStatusCode(error: unknown): number | null {
    if (typeof error === "object" && error !== null && "statusCode" in error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (typeof statusCode === "number") return statusCode;
    }
    return null;
  }

  private isTransient(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes("timeout") || message.includes("network") || message.includes("econnreset") || message.includes("socket");
    }
    return false;
  }

  private isAuthError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes("api key") || message.includes("token") || message.includes("unauthorized") || message.includes("authorization");
    }
    return false;
  }
}

class AirtableMockAdapter {
  async upsertRecord(tableName: string, taskId: string, fields: AirtableFieldMap): Promise<void> {
    await airtable.create({ id: taskId, fields: { tableName, ...fields } });
  }
}

export function resolveAirtableEnvConfig() {
  const token = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN || process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_PAT;
  const baseId = process.env.AIRTABLE_BASE_ID;

  return { token, baseId };
}

export function createAirtableClient() {
  const shouldUseMock = process.env.AIRTABLE_USE_MOCK === "true" || process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
  if (shouldUseMock) {
    return new AirtableMockAdapter();
  }

  const { token, baseId } = resolveAirtableEnvConfig();
  if (!token || !baseId) {
    throw new Error("Airtable export is not configured. Set AIRTABLE_PERSONAL_ACCESS_TOKEN (or AIRTABLE_API_KEY) and AIRTABLE_BASE_ID before exporting tasks.");
  }

  return new AirtableClient(token, baseId);
}
