export interface GroupMeMember {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

export type GroupMeApiAddMember = (
  groupId: string,
  member: GroupMeMember
) => Promise<{ success: boolean; memberId?: string }>;
