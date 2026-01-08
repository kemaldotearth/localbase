import type { Conflict, ConflictResolutionStrategy } from "../types";

export class ConflictResolver {
  static async resolve(
    conflict: Conflict,
    strategy: ConflictResolutionStrategy
  ): Promise<any> {
    if (typeof strategy === "function") {
      return strategy(conflict);
    }

    switch (strategy) {
      case "last-write-wins":
        return conflict.remoteTimestamp > conflict.localTimestamp
          ? conflict.remote
          : conflict.local;

      case "local-wins":
        return conflict.local;

      case "remote-wins":
        return conflict.remote;

      default:
        return conflict.remoteTimestamp > conflict.localTimestamp
          ? conflict.remote
          : conflict.local;
    }
  }

  static detectConflict(
    local: any,
    remote: any,
    table: string,
    key: any
  ): Conflict | null {
    const localTimestamp = local?.updated_at
      ? new Date(local.updated_at).getTime()
      : local?.created_at
      ? new Date(local.created_at).getTime()
      : Date.now();

    const remoteTimestamp = remote?.updated_at
      ? new Date(remote.updated_at).getTime()
      : remote?.created_at
      ? new Date(remote.created_at).getTime()
      : Date.now();

    if (Math.abs(localTimestamp - remoteTimestamp) > 1000) {
      return {
        local,
        remote,
        table,
        key,
        localTimestamp,
        remoteTimestamp,
      };
    }

    return null;
  }
}
