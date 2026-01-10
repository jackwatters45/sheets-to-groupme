import { Data, Effect } from "effect";
import { AppConfig } from "../config";

export interface GroupMeMember {
  nickname: string;
  email?: string;
  phone_number?: string;
}

export interface AddMemberResult {
  success: boolean;
  memberId?: string;
  userId?: string;
  alreadyExists?: boolean;
}

export class GroupMeApiError extends Data.TaggedError("GroupMeApiError")<{
  readonly message: string;
  readonly status?: number;
  readonly cause?: unknown;
}> {}

export class GroupMeUnauthorizedError extends Data.TaggedError("GroupMeUnauthorizedError")<{
  readonly message: string;
}> {}

export class GroupMeMemberAlreadyExistsError extends Data.TaggedError(
  "GroupMeMemberAlreadyExistsError"
)<{
  readonly message: string;
  readonly memberId?: string;
}> {}

export class GroupMeService extends Effect.Service<GroupMeService>()("GroupMeService", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig;

    const validateToken = Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: async () => {
          const res = await fetch("https://api.groupme.com/v3/users/me", {
            headers: {
              Authorization: `Bearer ${config.groupme.accessToken}`,
              Accept: "application/json",
            },
          });

          if (res.status === 401) {
            throw new GroupMeUnauthorizedError({
              message: "Invalid or expired GroupMe access token",
            });
          }

          if (!res.ok) {
            const errorBody = await res.text();
            throw new Error(`Token validation failed: ${res.status} - ${errorBody}`);
          }

          const data = (await res.json()) as {
            response?: { id: string; name: string; email: string };
          };
          return data.response;
        },
        catch: (error) =>
          error instanceof GroupMeUnauthorizedError
            ? error
            : new GroupMeApiError({
                message: error instanceof Error ? error.message : "Token validation failed",
                cause: error,
              }),
      });

      return response;
    });

    const getMembers = (groupId: string) =>
      Effect.gen(function* () {
        const targetGroupId = groupId || config.groupme.groupId;

        const response = yield* Effect.tryPromise({
          try: async () => {
            const res = await fetch(`https://api.groupme.com/v3/groups/${targetGroupId}`, {
              headers: {
                Authorization: `Bearer ${config.groupme.accessToken}`,
                Accept: "application/json",
              },
            });

            if (res.status === 401) {
              throw new GroupMeUnauthorizedError({
                message: "Unauthorized - check GroupMe access token",
              });
            }

            if (!res.ok) {
              const errorBody = await res.text();
              throw new Error(`${res.status} - ${errorBody}`);
            }

            const data = (await res.json()) as {
              response?: {
                members?: Array<{
                  user_id: string;
                  nickname: string;
                  email?: string;
                  phone_number?: string;
                }>;
              };
            };
            return data.response?.members || [];
          },
          catch: (error) =>
            error instanceof GroupMeUnauthorizedError
              ? error
              : new GroupMeApiError({
                  message: error instanceof Error ? error.message : "Failed to get group members",
                  cause: error,
                }),
        });

        return response;
      });

    const addMember = (groupId: string, member: GroupMeMember) =>
      Effect.gen(function* () {
        const targetGroupId = groupId || config.groupme.groupId;

        const response = yield* Effect.tryPromise({
          try: async () => {
            const res = await fetch(
              `https://api.groupme.com/v3/groups/${targetGroupId}/members/add`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${config.groupme.accessToken}`,
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({
                  members: [
                    {
                      nickname: member.nickname,
                      email: member.email,
                      phone_number: member.phone_number,
                    },
                  ],
                }),
              }
            );

            if (res.status === 401) {
              throw new GroupMeUnauthorizedError({
                message: "Unauthorized - check GroupMe access token",
              });
            }

            if (!res.ok) {
              const errorBody = await res.text();

              // Check for "already_member" response
              if (errorBody.includes("already_member") || errorBody.includes("already in group")) {
                // Try to extract member_id from error response
                const errorData = JSON.parse(errorBody);
                const memberId = errorData?.meta?.member_id || errorData?.response?.member_id;
                throw new GroupMeMemberAlreadyExistsError({
                  message: "Member already exists in group",
                  memberId,
                });
              }

              throw new Error(`${res.status} - ${errorBody}`);
            }

            const data = (await res.json()) as {
              response?: { results?: Array<{ member_id: string; user_id: string }> };
            };
            const result = data.response?.results?.[0];
            return {
              success: true,
              memberId: result?.member_id,
              userId: result?.user_id,
              alreadyExists: false,
            };
          },
          catch: (error) =>
            error instanceof GroupMeUnauthorizedError ||
            error instanceof GroupMeMemberAlreadyExistsError
              ? error
              : new GroupMeApiError({
                  message: error instanceof Error ? error.message : "Request failed",
                  cause: error,
                }),
        });

        return response;
      });

    return { validateToken, getMembers, addMember };
  }),
  dependencies: [],
}) {}
