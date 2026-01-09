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
}

export class GroupMeApiError extends Data.TaggedError("GroupMeApiError")<{
  readonly message: string;
  readonly status?: number;
  readonly cause?: unknown;
}> {}

export const addGroupMeMember = (groupId: string, member: GroupMeMember) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const targetGroupId = groupId || config.groupme.groupId;

    const response = yield* Effect.tryPromise({
      try: async () => {
        const res = await fetch(`https://api.groupme.com/v3/groups/${targetGroupId}/members/add`, {
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
        });

        if (!res.ok) {
          const errorBody = await res.text();
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
        };
      },
      catch: (error) =>
        new GroupMeApiError({
          message: error instanceof Error ? error.message : "Request failed",
          cause: error,
        }),
    });

    return response;
  });
