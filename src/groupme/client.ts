import { HttpBody, HttpClient, HttpClientRequest } from "@effect/platform";
import { NodeHttpClient } from "@effect/platform-node";
import { Data, Effect, Schema } from "effect";
import { AppConfig } from "../config";

// Schemas for GroupMe API responses
class UserInfo extends Schema.Class<UserInfo>("UserInfo")({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
}) {}

class UserResponse extends Schema.Class<UserResponse>("UserResponse")({
  response: Schema.optional(UserInfo),
}) {}

class GroupMember extends Schema.Class<GroupMember>("GroupMember")({
  user_id: Schema.String,
  nickname: Schema.String,
  email: Schema.optional(Schema.String),
  phone_number: Schema.optional(Schema.String),
}) {}

class GroupResponseData extends Schema.Class<GroupResponseData>("GroupResponseData")({
  members: Schema.optional(Schema.Array(GroupMember)),
}) {}

class GroupResponse extends Schema.Class<GroupResponse>("GroupResponse")({
  response: Schema.optional(GroupResponseData),
}) {}

class AddMemberResultItem extends Schema.Class<AddMemberResultItem>("AddMemberResultItem")({
  member_id: Schema.String,
  user_id: Schema.String,
}) {}

class AddMemberResponseData extends Schema.Class<AddMemberResponseData>("AddMemberResponseData")({
  results: Schema.optional(Schema.Array(AddMemberResultItem)),
}) {}

class AddMemberResponse extends Schema.Class<AddMemberResponse>("AddMemberResponse")({
  response: Schema.optional(AddMemberResponseData),
}) {}

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

    // Helper to handle response with schema validation
    const handleResponse =
      <A, I>(context: string, schema: Schema.Schema<A, I>) =>
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
            const validated = yield* Schema.decodeUnknown(schema)(json).pipe(
              Effect.mapError(
                (e) =>
                  new GroupMeApiError({
                    message: `${context}: Invalid response schema - ${e.message}`,
                    cause: e,
                  })
              )
            );
            return validated;
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
        Effect.flatMap(handleResponse("Token validation failed", UserResponse)),
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
          Effect.flatMap(handleResponse("Failed to get group members", GroupResponse)),
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
                  const json = yield* res.json.pipe(
                    Effect.mapError(
                      (e) =>
                        new GroupMeApiError({ message: "Failed to parse JSON response", cause: e })
                    )
                  );
                  const data = yield* Schema.decodeUnknown(AddMemberResponse)(json).pipe(
                    Effect.mapError(
                      (e) =>
                        new GroupMeApiError({
                          message: `Invalid response schema - ${e.message}`,
                          cause: e,
                        })
                    )
                  );
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
