/**
 * Query builder for table queries
 */

export type WhereOperator =
  | "="
  | ">"
  | ">="
  | "<"
  | "<="
  | "!="
  | "between"
  | "startsWith"
  | "matches";

export interface WhereClause {
  field: string;
  operator: WhereOperator;
  value: any;
}

export class Query<T> {
  private db: IDBDatabase;
  private storeName: string;
  private indexName: string | null = null;
  private whereClauses: WhereClause[] = [];
  private sortField: string | null = null;
  private sortDirection: "asc" | "desc" = "asc";
  private limitCount: number | null = null;
  private offsetCount: number = 0;

  constructor(db: IDBDatabase, storeName: string) {
    this.db = db;
    this.storeName = storeName;
  }

  where(field: string): QueryBuilder<T> {
    return new QueryBuilder<T>(this, field);
  }

  filter(predicate: (item: T) => boolean): Query<T> {
    // Store filter for later application
    (this as any).filterPredicate = predicate;
    return this;
  }

  sort(field: string, direction: "asc" | "desc" = "asc"): Query<T> {
    this.sortField = field;
    this.sortDirection = direction;
    return this;
  }

  limit(count: number): Query<T> {
    this.limitCount = count;
    return this;
  }

  offset(count: number): Query<T> {
    this.offsetCount = count;
    return this;
  }

  async toArray(): Promise<T[]> {
    // Create a new transaction for each query execution
    // This ensures the transaction is active when we use it
    const transaction = this.db.transaction([this.storeName], "readonly");
    const store = transaction.objectStore(this.storeName);

    let results: T[] = [];

    // Use index if available
    if (this.indexName) {
      try {
        const index = store.index(this.indexName);
        const keyRange = this.buildKeyRange();
        const request = index.getAll(keyRange || undefined);
        results = await new Promise<T[]>((resolve, reject) => {
          request.onsuccess = () => {
            // Transaction stays alive until request completes
            resolve(request.result);
          };
          request.onerror = () => reject(request.error);
          transaction.onerror = () => reject(transaction.error);
        });
      } catch (error) {
        // If index doesn't exist, fall back to getAll
        const request = store.getAll();
        results = await new Promise<T[]>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          transaction.onerror = () => reject(transaction.error);
        });
      }
    } else {
      // Fallback to getAll
      const request = store.getAll();
      results = await new Promise<T[]>((resolve, reject) => {
        request.onsuccess = () => {
          // Transaction stays alive until request completes
          resolve(request.result);
        };
        request.onerror = () => reject(request.error);
        transaction.onerror = () => reject(transaction.error);
      });
    }

    // Apply where clauses
    for (const clause of this.whereClauses) {
      results = this.applyWhereClause(results, clause);
    }

    // Apply filter predicate if exists
    const filterPredicate = (this as any).filterPredicate;
    if (filterPredicate) {
      results = results.filter(filterPredicate);
    }

    // Apply sorting
    if (this.sortField) {
      results.sort((a, b) => {
        const aVal = (a as any)[this.sortField!];
        const bVal = (b as any)[this.sortField!];
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return this.sortDirection === "asc" ? comparison : -comparison;
      });
    }

    // Apply offset and limit
    if (this.offsetCount > 0) {
      results = results.slice(this.offsetCount);
    }
    if (this.limitCount !== null) {
      results = results.slice(0, this.limitCount);
    }

    return results;
  }

  async first(): Promise<T | undefined> {
    const results = await this.limit(1).toArray();
    return results[0];
  }

  async count(): Promise<number> {
    const results = await this.toArray();
    return results.length;
  }

  private buildKeyRange(): IDBKeyRange | null {
    if (this.whereClauses.length === 0) {
      return null;
    }

    // Use first where clause for key range
    const clause = this.whereClauses[0];

    switch (clause.operator) {
      case "=":
        return IDBKeyRange.only(clause.value);
      case ">":
        return IDBKeyRange.lowerBound(clause.value, true);
      case ">=":
        return IDBKeyRange.lowerBound(clause.value, false);
      case "<":
        return IDBKeyRange.upperBound(clause.value, true);
      case "<=":
        return IDBKeyRange.upperBound(clause.value, false);
      case "between":
        const [min, max] = clause.value;
        return IDBKeyRange.bound(min, max, false, false);
      default:
        return null;
    }
  }

  private applyWhereClause(results: T[], clause: WhereClause): T[] {
    return results.filter((item) => {
      const fieldValue = (item as any)[clause.field];

      switch (clause.operator) {
        case "=":
          return fieldValue === clause.value;
        case ">":
          return fieldValue > clause.value;
        case ">=":
          return fieldValue >= clause.value;
        case "<":
          return fieldValue < clause.value;
        case "<=":
          return fieldValue <= clause.value;
        case "!=":
          return fieldValue !== clause.value;
        case "startsWith":
          return String(fieldValue).startsWith(String(clause.value));
        case "matches":
          const regex = new RegExp(clause.value);
          return regex.test(String(fieldValue));
        default:
          return true;
      }
    });
  }

  setIndex(indexName: string): void {
    this.indexName = indexName;
  }

  addWhereClause(clause: WhereClause): void {
    this.whereClauses.push(clause);
  }
}

export class QueryBuilder<T> {
  constructor(private query: Query<T>, private field: string) {}

  equals(value: any): Query<T> {
    this.query.addWhereClause({ field: this.field, operator: "=", value });
    return this.query;
  }

  above(value: any): Query<T> {
    this.query.addWhereClause({ field: this.field, operator: ">", value });
    return this.query;
  }

  aboveOrEqual(value: any): Query<T> {
    this.query.addWhereClause({ field: this.field, operator: ">=", value });
    return this.query;
  }

  below(value: any): Query<T> {
    this.query.addWhereClause({ field: this.field, operator: "<", value });
    return this.query;
  }

  belowOrEqual(value: any): Query<T> {
    this.query.addWhereClause({ field: this.field, operator: "<=", value });
    return this.query;
  }

  between(lower: any, upper: any): Query<T> {
    this.query.addWhereClause({
      field: this.field,
      operator: "between",
      value: [lower, upper],
    });
    return this.query;
  }

  startsWith(value: string): Query<T> {
    this.query.addWhereClause({
      field: this.field,
      operator: "startsWith",
      value,
    });
    return this.query;
  }

  matches(regex: string | RegExp): Query<T> {
    this.query.addWhereClause({
      field: this.field,
      operator: "matches",
      value: regex,
    });
    return this.query;
  }

  notEqual(value: any): Query<T> {
    this.query.addWhereClause({ field: this.field, operator: "!=", value });
    return this.query;
  }
}
