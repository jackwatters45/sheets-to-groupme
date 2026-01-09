import type { GroupMeMember, GroupMeApiAddMember } from "./types";

export const addGroupMeMember: GroupMeApiAddMember = async (
  _groupId: string,
  _member: GroupMeMember
): Promise<{ success: boolean; memberId?: string }> => {
  return { success: false };
};

export const groupmeAuthenticate = async (_token: string): Promise<void> => {
  // TODO: Implement
};
