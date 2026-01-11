import { HttpBody, HttpClient, HttpClientRequest } from "@effect/platform";
import { NodeHttpClient } from "@effect/platform-node";
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
    const baseClient = yield* HttpClient.HttpClient;

    // Create a client with base URL and common headers
    const httpClient = baseClient.pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl("https://api.groupme.com")),
      HttpClient.mapRequest(HttpClientRequest.setHeader("Accept", "application/json"))
    );

    // Helper to handle response with custom error mapping
    const handleResponse =
      <T>(context: string) =>
      (res: import("@effect/platform/HttpClientResponse").HttpClientResponse) =>
        Effect.gen(function* () {
          if (res.status === 401) {
            return yield* Effect.fail(
              new GroupMeUnauthorizedError({
                message: "Unauthorized - check GroupMe access token",
              })
            );
          }

          if (res.status >= 200 && res.status < 300) {
            const json = yield* res.json.pipe(
              Effect.mapError(
                (e) =>
                  new GroupMeApiError({ message: `${context}: Failed to parse JSON`, cause: e })
              )
            );
            return json as T;
          }

          const errorBody = yield* res.text.pipe(
            Effect.mapError(
              (e) =>
                new GroupMeApiError({ message: `${context}: Failed to read response`, cause: e })
            )
          );
          return yield* Effect.fail(
            new GroupMeApiError({
              message: `${context}: ${res.status} - ${errorBody}`,
              status: res.status,
            })
          );
        });

    const validateToken = Effect.gen(function* () {
      const url = `/v3/users/me?token=${config.groupme.accessToken}`;
      const response = yield* httpClient.get(url).pipe(
        Effect.flatMap(
          handleResponse<{ response?: { id: string; name: string; email: string } }>(
            "Token validation failed"
          )
        ),
        Effect.mapError((error) =>
          error instanceof GroupMeUnauthorizedError || error instanceof GroupMeApiError
            ? error
            : new GroupMeApiError({ message: error.message, cause: error })
        )
      );
      return response.response;
    });

    const getMembers = (groupId: string) =>
      Effect.gen(function* () {
        const targetGroupId = groupId || config.groupme.groupId;
        const url = `/v3/groups/${targetGroupId}?token=${config.groupme.accessToken}`;

        const response = yield* httpClient.get(url).pipe(
          Effect.flatMap(
            handleResponse<{
              response?: {
                members?: Array<{
                  user_id: string;
                  nickname: string;
                  email?: string;
                  phone_number?: string;
                }>;
              };
            }>("Failed to get group members")
          ),
          Effect.mapError((error) =>
            error instanceof GroupMeUnauthorizedError || error instanceof GroupMeApiError
              ? error
              : new GroupMeApiError({ message: error.message, cause: error })
          )
        );
        return response.response?.members || [];
      });

    const addMember = (groupId: string, member: GroupMeMember) =>
      Effect.gen(function* () {
        const targetGroupId = groupId || config.groupme.groupId;
        const url = `/v3/groups/${targetGroupId}/members/add?token=${config.groupme.accessToken}`;

        const result = yield* httpClient
          .post(url, {
            body: HttpBody.unsafeJson({
              members: [
                {
                  nickname: member.nickname,
                  email: member.email,
                  phone_number: member.phone_number,
                },
              ],
            }),
          })
          .pipe(
            Effect.flatMap((res) =>
              Effect.gen(function* () {
                if (res.status === 401) {
                  return yield* Effect.fail(
                    new GroupMeUnauthorizedError({
                      message: "Unauthorized - check GroupMe access token",
                    })
                  );
                }

                if (res.status >= 200 && res.status < 300) {
                  const data = (yield* res.json.pipe(
                    Effect.mapError(
                      (e) =>
                        new GroupMeApiError({ message: "Failed to parse JSON response", cause: e })
                    )
                  )) as {
                    response?: { results?: Array<{ member_id: string; user_id: string }> };
                  };
                  const addResult = data.response?.results?.[0];
                  return {
                    success: true,
                    memberId: addResult?.member_id,
                    userId: addResult?.user_id,
                    alreadyExists: false,
                  };
                }

                const errorBody = yield* res.text.pipe(
                  Effect.mapError(
                    (e) =>
                      new GroupMeApiError({ message: "Failed to read error response", cause: e })
                  )
                );

                // Check for "already_member" response
                if (
                  errorBody.includes("already_member") ||
                  errorBody.includes("already in group")
                ) {
                  const parsedMemberId = yield* Effect.try({
                    try: () => {
                      const errorData = JSON.parse(errorBody);
                      return (errorData?.meta?.member_id || errorData?.response?.member_id) as
                        | string
                        | undefined;
                    },
                    catch: () => undefined,
                  }).pipe(Effect.orElseSucceed(() => undefined));

                  return yield* Effect.fail(
                    new GroupMeMemberAlreadyExistsError({
                      message: "Member already exists in group",
                      ...(parsedMemberId ? { memberId: parsedMemberId } : {}),
                    })
                  );
                }

                return yield* Effect.fail(
                  new GroupMeApiError({
                    message: `${res.status} - ${errorBody}`,
                    status: res.status,
                  })
                );
              })
            ),
            Effect.mapError((error) => {
              if (
                error instanceof GroupMeUnauthorizedError ||
                error instanceof GroupMeMemberAlreadyExistsError ||
                error instanceof GroupMeApiError
              ) {
                return error;
              }
              return new GroupMeApiError({
                message: error.message || "Request failed",
                cause: error,
              });
            })
          );

        return result;
      });

    return { validateToken, getMembers, addMember };
  }),
  dependencies: [NodeHttpClient.layerUndici],
}) {}
