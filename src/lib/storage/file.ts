import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ZodError, type ZodType } from "zod";

export class StorageFileError extends Error {
  readonly filePath: string;

  constructor(message: string, filePath: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.filePath = filePath;
  }
}

export class StorageJsonParseError extends StorageFileError {
  constructor(filePath: string, cause: unknown) {
    super(`Invalid JSON in ${filePath}`, filePath, {
      cause: cause instanceof Error ? cause : undefined,
    });
  }
}

export class StorageSchemaError extends StorageFileError {
  readonly issues: ReadonlyArray<ZodError["issues"][number]>;

  constructor(filePath: string, issues: ZodError["issues"]) {
    super(`Invalid storage schema in ${filePath}`, filePath);
    this.issues = issues;
  }
}

export function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function readJsonFile<T>(filePath: string, schema: ZodType<T>): Promise<T> {
  const raw = await readFile(filePath, "utf8");

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new StorageJsonParseError(filePath, error);
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new StorageSchemaError(filePath, parsed.error.issues);
  }

  return parsed.data;
}

export async function writeJsonFile<T>(filePath: string, schema: ZodType<T>, value: T): Promise<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new StorageSchemaError(filePath, parsed.error.issues);
  }

  await mkdir(dirname(filePath), { recursive: true });

  const tempFilePath = `${filePath}.${randomUUID()}.tmp`;
  const content = `${JSON.stringify(parsed.data, null, 2)}\n`;

  try {
    await writeFile(tempFilePath, content, "utf8");
    await rename(tempFilePath, filePath);
  } catch (error) {
    await rm(tempFilePath, { force: true }).catch(() => undefined);
    throw new StorageFileError(`Failed to write ${filePath}`, filePath, {
      cause: error instanceof Error ? error : undefined,
    });
  }

  return parsed.data;
}
