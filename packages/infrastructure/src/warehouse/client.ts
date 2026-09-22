/**
 * The narrow surface the warehouse code needs from BigQuery.
 *
 * Four methods, and that is the point: everything above this file — the
 * migration runner, the repositories, the fixture loader — is written against
 * the interface, so all of it is exercised by tests on a machine that has never
 * authenticated to Google. The SDK-backed implementation is the only part that
 * cannot be, and it is kept small enough that what it does is readable.
 *
 * `load` and `replace` go through a load job rather than the streaming insert
 * API for two reasons: load jobs are free where streaming is billed per
 * megabyte, and rows arrive in the table immediately rather than sitting in a
 * streaming buffer that DML cannot see.
 */

/** Named query parameters. `@name` in the SQL. */
export type QueryParams = Record<string, unknown>;

export interface WarehouseClient {
  /** Run a statement and collect every row. For DDL, DML and small results. */
  query<Row = Record<string, unknown>>(
    sql: string,
    params?: QueryParams,
  ): Promise<Row[]>;

  /** Run a statement and stream its rows, for results too large to hold. */
  stream<Row = Record<string, unknown>>(
    sql: string,
    params?: QueryParams,
  ): AsyncIterable<Row>;

  /** Append rows to a table. Returns how many were written. */
  load(table: string, rows: AsyncIterable<object>): Promise<number>;

  /** Replace a table's contents with these rows, atomically. */
  replace(table: string, rows: AsyncIterable<object>): Promise<number>;
}

export interface BigQueryClientOptions {
  readonly projectId?: string;
  readonly dataset: string;
  /** Where the dataset lives. Must match it or a job is rejected. */
  readonly location?: string;
}

/**
 * The real client.
 *
 * The SDK is imported dynamically so that importing this module — which the
 * package's entry point does — does not drag `@google-cloud/bigquery` and its
 * fifty-odd transitive packages into the web app's traced output. Nothing in
 * `apps/web` constructs one yet, and when step 8 does, it pays for it then.
 */
export async function bigQueryClient(
  options: BigQueryClientOptions,
): Promise<WarehouseClient> {
  const { BigQuery } = await import("@google-cloud/bigquery");
  // Built by spreading rather than by assigning undefined: the workspace runs
  // with exactOptionalPropertyTypes, and the SDK's option types mean "absent",
  // not "present and undefined".
  const where = options.location === undefined ? {} : { location: options.location };
  const bigquery = new BigQuery({
    ...(options.projectId === undefined ? {} : { projectId: options.projectId }),
    ...where,
  });
  const dataset = bigquery.dataset(options.dataset, where);

  async function writeRows(
    table: string,
    rows: AsyncIterable<object>,
    writeDisposition: "WRITE_APPEND" | "WRITE_TRUNCATE",
  ): Promise<number> {
    const stream = dataset.table(table).createWriteStream({
      sourceFormat: "NEWLINE_DELIMITED_JSON",
      writeDisposition,
      // The table already exists — a migration made it. CREATE_NEVER is what
      // stops a load job from inventing one from whatever rows happen to be in
      // the first batch, which is how a typo in a column name becomes a second
      // table's worth of nulls rather than an error.
      createDisposition: "CREATE_NEVER",
    });

    let written = 0;
    const finished = new Promise<void>((resolve, reject) => {
      stream.on("error", reject);
      stream.on("job", (job: { on: (event: string, fn: (e: unknown) => void) => void }) => {
        job.on("error", reject);
        job.on("complete", () => resolve());
      });
    });

    for await (const row of rows) {
      written += 1;
      if (!stream.write(`${JSON.stringify(row)}\n`)) {
        await new Promise((resolve) => stream.once("drain", resolve));
      }
    }
    stream.end();
    await finished;
    return written;
  }

  return {
    async query<Row>(sql: string, params?: QueryParams): Promise<Row[]> {
      const [rows] = await bigquery.query({
        query: sql,
        ...(params === undefined ? {} : { params }),
        ...where,
      });
      return rows as Row[];
    },

    async *stream<Row>(sql: string, params?: QueryParams): AsyncIterable<Row> {
      const stream = bigquery.createQueryStream({
        query: sql,
        ...(params === undefined ? {} : { params }),
        ...where,
      });
      for await (const row of stream) yield row as Row;
    },

    load: (table, rows) => writeRows(table, rows, "WRITE_APPEND"),
    replace: (table, rows) => writeRows(table, rows, "WRITE_TRUNCATE"),
  };
}
